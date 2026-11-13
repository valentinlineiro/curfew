import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handlePullRequest, type PullRequestDeps } from '../src/delivery/handlePullRequest.ts'
import { DEFAULT_POLICY } from '../src/domain/policy.ts'
import type { Alert } from '../src/domain/alert.ts'
import type { CheckPublisher, Logger } from '../src/ports.ts'

const job = { repo: 'acme/api', headSha: 'abc', author: 'ana', installationId: 42 }

const alert: Alert = {
  id: 1,
  repo: 'acme/api',
  packageName: 'lodash',
  manifestPath: 'package.json',
  severity: 'critical',
  publishedAt: new Date('2026-01-01T00:00:00Z'),
  state: 'open',
  fixAvailable: true,
}

function harness(overrides: Partial<PullRequestDeps> = {}) {
  const published: Parameters<CheckPublisher['publish']>[0][] = []
  const logs: { level: string; msg: string; ctx?: Record<string, unknown> }[] = []

  const logger: Logger = {
    info: (msg, ctx) => logs.push({ level: 'info', msg, ctx }),
    warn: (msg, ctx) => logs.push({ level: 'warn', msg, ctx }),
    error: (msg, ctx) => logs.push({ level: 'error', msg, ctx }),
  }

  const deps: PullRequestDeps = {
    alerts: { listOpenAlerts: async () => [alert] },
    ownerLookup: { ownerFor: async () => ({ kind: 'user', login: 'ana' }) },
    teamMembership: { checkMembership: async () => ({ status: 'MEMBER' }) },
    clock: { installedAt: async () => new Date('2025-01-01T00:00:00Z') },
    checks: { publish: async (input) => void published.push(input) },
    policy: DEFAULT_POLICY,
    logger,
    now: () => new Date('2026-11-11T00:00:00Z'),
    ...overrides,
  }
  return { deps, published, logs }
}

test('shouldPublishFailureWhenAuthorHasOverdueAlerts', async () => {
  const { deps, published } = harness()
  await handlePullRequest(job, deps)
  assert.equal(published.length, 1)
  assert.equal(published[0].result.conclusion, 'failure')
  assert.equal(published[0].result.title, '1 overdue alert')
  assert.match(published[0].result.summary, /lodash \(critical\) due 2026-01-08/)
  assert.match(published[0].result.summary, /\[owner: @ana\]/)
})

test('shouldPublishFailureWhenAuthorBelongsToTeamOwningOverdueAlert', async () => {
  const { deps, published } = harness({
    ownerLookup: { ownerFor: async () => ({ kind: 'team', org: 'acme', teamSlug: 'frontend' }) },
    teamMembership: { checkMembership: async () => ({ status: 'MEMBER' }) },
  })
  await handlePullRequest(job, deps)
  assert.equal(published.length, 1)
  assert.equal(published[0].result.conclusion, 'failure')
  assert.equal(published[0].result.title, '1 overdue alert')
  assert.match(published[0].result.summary, /\[owner: @acme\/frontend\]/)
})

test('shouldPublishSuccessWhenAuthorIsNotMemberOfTeamOwningAlert', async () => {
  const { deps, published } = harness({
    ownerLookup: { ownerFor: async () => ({ kind: 'team', org: 'acme', teamSlug: 'frontend' }) },
    teamMembership: { checkMembership: async () => ({ status: 'NOT_MEMBER' }) },
  })
  await handlePullRequest(job, deps)
  assert.equal(published.length, 1)
  assert.equal(published[0].result.conclusion, 'success')
  assert.equal(published[0].result.title, 'Within curfew')
})

test('shouldPublishSuccessFailOpenAndLogWarningWhenTeamMembershipIsUnknown', async () => {
  const { deps, published, logs } = harness({
    ownerLookup: { ownerFor: async () => ({ kind: 'team', org: 'acme', teamSlug: 'frontend' }) },
    teamMembership: { checkMembership: async () => ({ status: 'UNKNOWN', reason: 'FORBIDDEN' }) },
  })
  await handlePullRequest(job, deps)
  assert.equal(published.length, 1)
  assert.equal(published[0].result.conclusion, 'success')
  const warnLog = logs.find((l) => l.level === 'warn')
  assert.ok(warnLog)
  assert.match(warnLog.msg, /degraded/)
  assert.equal(warnLog.ctx?.reason, 'FORBIDDEN')
})

test('shouldFailForVerifiedUserDebtEvenWhenTeamDebtIsUnknown', async () => {
  const alert2: Alert = {
    id: 2,
    repo: 'acme/api',
    packageName: 'axios',
    manifestPath: 'services/package.json',
    severity: 'critical',
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    state: 'open',
    fixAvailable: true,
  }

  const { deps, published, logs } = harness({
    alerts: { listOpenAlerts: async () => [alert, alert2] },
    ownerLookup: {
      ownerFor: async (_repo, path) =>
        path === 'package.json'
          ? { kind: 'user', login: 'ana' }
          : { kind: 'team', org: 'acme', teamSlug: 'backend' },
    },
    teamMembership: { checkMembership: async () => ({ status: 'UNKNOWN', reason: 'TIMEOUT' }) },
  })

  await handlePullRequest(job, deps)
  assert.equal(published.length, 1)
  assert.equal(published[0].result.conclusion, 'failure')
  assert.equal(published[0].result.title, '1 overdue alert')
  assert.match(published[0].result.summary, /lodash/)
  assert.ok(logs.some((l) => l.level === 'warn' && l.ctx?.reason === 'TIMEOUT'))
})

test('shouldResolveDistinctManifestsInParallel', async () => {
  const alert2: Alert = {
    id: 2,
    repo: 'acme/api',
    packageName: 'axios',
    manifestPath: 'services/package.json',
    severity: 'high',
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    state: 'open',
    fixAvailable: true,
  }
  const queriedPaths: string[] = []

  const { deps, published } = harness({
    alerts: { listOpenAlerts: async () => [alert, alert2] },
    ownerLookup: {
      ownerFor: async (_repo, path) => {
        queriedPaths.push(path)
        return { kind: 'user', login: 'ana' }
      },
    },
  })

  await handlePullRequest(job, deps)
  assert.equal(published[0].result.conclusion, 'failure')
  assert.equal(published[0].result.title, '2 overdue alerts')
  assert.equal(queriedPaths.length, 2)
  assert.ok(queriedPaths.includes('package.json'))
  assert.ok(queriedPaths.includes('services/package.json'))
})

test('shouldPublishSuccessWhenAlertSourceThrows', async () => {
  const { deps, published, logs } = harness({
    alerts: { listOpenAlerts: async () => Promise.reject(new Error('boom')) },
  })
  await handlePullRequest(job, deps)
  assert.equal(published[0].result.conclusion, 'success')
  assert.match(published[0].result.summary, /curfew could not evaluate/)
  assert.ok(logs.some((l) => l.level === 'error'))
})

test('shouldPropagatePublicationErrorAndNotPublishFailOpenCheck', async () => {
  const publishError = new Error('GitHub checks API down')
  const { deps } = harness({
    checks: {
      publish: async () => {
        throw publishError
      },
    },
  })

  await assert.rejects(
    async () => {
      await handlePullRequest(job, deps)
    },
    (err: unknown) => err === publishError,
  )
})

test('shouldPublishSuccessWhenPullRequestAuthorHasNoDebt', async () => {
  const { deps, published } = harness({
    ownerLookup: { ownerFor: async () => ({ kind: 'user', login: 'luis' }) },
  })
  await handlePullRequest(job, deps)
  assert.equal(published[0].result.conclusion, 'success')
})

test('shouldPublishSuccessWhenAlertHasNoOwner', async () => {
  const { deps, published } = harness({ ownerLookup: { ownerFor: async () => null } })
  await handlePullRequest(job, deps)
  assert.equal(published[0].result.conclusion, 'success')
})
