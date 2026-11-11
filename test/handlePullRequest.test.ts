import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handlePullRequest, type PullRequestDeps } from '../src/delivery/handlePullRequest.ts'
import { DEFAULT_POLICY } from '../src/domain/policy.ts'
import type { Alert } from '../src/domain/alert.ts'
import type { CheckPublisher } from '../src/ports.ts'

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
  const deps: PullRequestDeps = {
    alerts: { listOpenAlerts: async () => [alert] },
    ownerLookup: { ownerFor: async () => '@ana' },
    clock: { installedAt: async () => new Date('2025-01-01T00:00:00Z') },
    checks: { publish: async (input) => void published.push(input) },
    policy: DEFAULT_POLICY,
    now: () => new Date('2026-11-11T00:00:00Z'),
    ...overrides,
  }
  return { deps, published }
}

test('shouldPublishFailureWhenAuthorHasOverdueAlerts', async () => {
  const { deps, published } = harness()
  await handlePullRequest(job, deps)
  assert.equal(published.length, 1)
  assert.equal(published[0].result.conclusion, 'failure')
  assert.equal(published[0].result.title, 'Curfew passed: 1 alert')
  assert.match(published[0].result.summary, /lodash \(critical\) due 2026-01-08/)
})

test('shouldPublishSuccessWhenAlertSourceThrows', async () => {
  const { deps, published } = harness({
    alerts: { listOpenAlerts: async () => Promise.reject(new Error('boom')) },
  })
  await handlePullRequest(job, deps)
  assert.equal(published[0].result.conclusion, 'success')
  assert.match(published[0].result.summary, /curfew could not evaluate/)
})

test('shouldPublishSuccessWhenPullRequestAuthorHasNoDebt', async () => {
  const { deps, published } = harness({ ownerLookup: { ownerFor: async () => '@luis' } })
  await handlePullRequest(job, deps)
  assert.equal(published[0].result.conclusion, 'success')
})

test('shouldPublishSuccessWhenAlertHasNoOwner', async () => {
  const { deps, published } = harness({ ownerLookup: { ownerFor: async () => null } })
  await handlePullRequest(job, deps)
  assert.equal(published[0].result.conclusion, 'success')
})
