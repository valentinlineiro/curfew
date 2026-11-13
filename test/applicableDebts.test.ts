import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Debt, Alert } from '../src/domain/alert.ts'
import type { TeamMembership, MembershipResult } from '../src/ports.ts'
import { resolveApplicableDebts } from '../src/application/applicableDebts.ts'

function createAlert(id: number, packageName: string): Alert {
  return {
    id,
    repo: 'acme/repo',
    packageName,
    manifestPath: 'package.json',
    severity: 'critical',
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    state: 'open',
    fixAvailable: true,
  }
}

test('shouldIncludeDebtWhenUserOwnerMatchesAuthor', async () => {
  const debt: Debt = {
    alert: createAlert(1, 'pkg1'),
    owner: { kind: 'user', login: 'alice' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }
  const membership: TeamMembership = {
    checkMembership: async () => ({ status: 'NOT_MEMBER' }),
  }

  const result = await resolveApplicableDebts({
    author: '@Alice',
    debts: [debt],
    teamMembership: membership,
  })

  assert.deepEqual(result.applicableDebts, [debt])
  assert.deepEqual(result.degradations, [])
})

test('shouldExcludeDebtWhenUserOwnerDoesNotMatchAuthor', async () => {
  const debt: Debt = {
    alert: createAlert(1, 'pkg1'),
    owner: { kind: 'user', login: 'bob' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }
  const membership: TeamMembership = {
    checkMembership: async () => ({ status: 'NOT_MEMBER' }),
  }

  const result = await resolveApplicableDebts({
    author: 'alice',
    debts: [debt],
    teamMembership: membership,
  })

  assert.deepEqual(result.applicableDebts, [])
  assert.deepEqual(result.degradations, [])
})

test('shouldIncludeTeamDebtWhenAuthorIsMemberPreservingOriginalOwner', async () => {
  const teamDebt: Debt = {
    alert: createAlert(1, 'pkg1'),
    owner: { kind: 'team', org: 'acme', teamSlug: 'frontend' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }
  const membership: TeamMembership = {
    checkMembership: async (org, slug, user) => {
      assert.equal(org, 'acme')
      assert.equal(slug, 'frontend')
      assert.equal(user, 'alice')
      return { status: 'MEMBER' }
    },
  }

  const result = await resolveApplicableDebts({
    author: 'alice',
    debts: [teamDebt],
    teamMembership: membership,
  })

  assert.deepEqual(result.applicableDebts, [teamDebt])
  assert.deepEqual(result.degradations, [])
})

test('shouldExcludeTeamDebtWhenAuthorIsNotMember', async () => {
  const teamDebt: Debt = {
    alert: createAlert(1, 'pkg1'),
    owner: { kind: 'team', org: 'acme', teamSlug: 'frontend' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }
  const membership: TeamMembership = {
    checkMembership: async () => ({ status: 'NOT_MEMBER' }),
  }

  const result = await resolveApplicableDebts({
    author: 'alice',
    debts: [teamDebt],
    teamMembership: membership,
  })

  assert.deepEqual(result.applicableDebts, [])
  assert.deepEqual(result.degradations, [])
})

test('shouldExcludeTeamDebtAndRecordDegradationWhenStatusIsUnknown', async () => {
  const teamDebt: Debt = {
    alert: createAlert(1, 'pkg1'),
    owner: { kind: 'team', org: 'acme', teamSlug: 'frontend' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }
  const membership: TeamMembership = {
    checkMembership: async () => ({ status: 'UNKNOWN', reason: 'FORBIDDEN' }),
  }

  const result = await resolveApplicableDebts({
    author: 'alice',
    debts: [teamDebt],
    teamMembership: membership,
  })

  assert.deepEqual(result.applicableDebts, [])
  assert.deepEqual(result.degradations, [
    { team: { kind: 'team', org: 'acme', teamSlug: 'frontend' }, reason: 'FORBIDDEN' },
  ])
})

test('shouldCoalesceRequestsAndQueryTeamMembershipOnlyOnceForMultipleAlertsOfSameTeam', async () => {
  let callCount = 0
  const debts: Debt[] = Array.from({ length: 10 }, (_, i) => ({
    alert: createAlert(i, `pkg${i}`),
    owner: { kind: 'team', org: 'acme', teamSlug: 'frontend' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }))

  const membership: TeamMembership = {
    checkMembership: async () => {
      callCount++
      return { status: 'MEMBER' }
    },
  }

  const result = await resolveApplicableDebts({
    author: 'alice',
    debts,
    teamMembership: membership,
  })

  assert.equal(callCount, 1)
  assert.equal(result.applicableDebts.length, 10)
  assert.deepEqual(result.degradations, [])
})

test('shouldQueryDistinctTeamsConcurrentlyAndIsolateResults', async () => {
  const calls: string[] = []
  const debtA: Debt = {
    alert: createAlert(1, 'pkgA'),
    owner: { kind: 'team', org: 'acme', teamSlug: 'team-a' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }
  const debtB: Debt = {
    alert: createAlert(2, 'pkgB'),
    owner: { kind: 'team', org: 'acme', teamSlug: 'team-b' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }

  const membership: TeamMembership = {
    checkMembership: async (org, slug) => {
      calls.push(`${org}/${slug}`)
      return slug === 'team-a' ? { status: 'MEMBER' } : { status: 'NOT_MEMBER' }
    },
  }

  const result = await resolveApplicableDebts({
    author: 'alice',
    debts: [debtA, debtB],
    teamMembership: membership,
  })

  assert.deepEqual(result.applicableDebts, [debtA])
  assert.equal(calls.length, 2)
  assert.deepEqual(result.degradations, [])
})

test('shouldNotNeutralizeVerifiedDebtWhenAnotherTeamIsUnknown', async () => {
  const userDebt: Debt = {
    alert: createAlert(1, 'userPkg'),
    owner: { kind: 'user', login: 'alice' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }
  const degradedDebt: Debt = {
    alert: createAlert(2, 'teamPkg'),
    owner: { kind: 'team', org: 'acme', teamSlug: 'unknown-team' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }

  const membership: TeamMembership = {
    checkMembership: async () => ({ status: 'UNKNOWN', reason: 'TIMEOUT' }),
  }

  const result = await resolveApplicableDebts({
    author: 'alice',
    debts: [userDebt, degradedDebt],
    teamMembership: membership,
  })

  assert.deepEqual(result.applicableDebts, [userDebt])
  assert.equal(result.degradations.length, 1)
  assert.equal(result.degradations[0].reason, 'TIMEOUT')
})

test('shouldPreserveDeterministicOrderOfDebts', async () => {
  const debt1: Debt = {
    alert: createAlert(1, 'first'),
    owner: { kind: 'user', login: 'alice' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }
  const debt2: Debt = {
    alert: createAlert(2, 'second'),
    owner: { kind: 'team', org: 'acme', teamSlug: 'frontend' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }
  const debt3: Debt = {
    alert: createAlert(3, 'third'),
    owner: { kind: 'user', login: 'alice' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }

  const membership: TeamMembership = {
    checkMembership: async () => ({ status: 'MEMBER' }),
  }

  const result = await resolveApplicableDebts({
    author: 'alice',
    debts: [debt1, debt2, debt3],
    teamMembership: membership,
  })

  assert.deepEqual(result.applicableDebts, [debt1, debt2, debt3])
})

test('shouldFailOpenToUnknownUnexpectedWhenPortThrowsException', async () => {
  const teamDebt: Debt = {
    alert: createAlert(1, 'pkg1'),
    owner: { kind: 'team', org: 'acme', teamSlug: 'crashing-team' },
    dueAt: new Date('2026-01-08T00:00:00Z'),
  }
  const membership: TeamMembership = {
    checkMembership: async () => {
      throw new Error('port exploded')
    },
  }

  const result = await resolveApplicableDebts({
    author: 'alice',
    debts: [teamDebt],
    teamMembership: membership,
  })

  assert.deepEqual(result.applicableDebts, [])
  assert.deepEqual(result.degradations, [
    { team: { kind: 'team', org: 'acme', teamSlug: 'crashing-team' }, reason: 'UNEXPECTED_ERROR' },
  ])
})
