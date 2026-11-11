import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gatePullRequest } from '../src/application/gate.ts'
import type { Debt } from '../src/domain/alert.ts'

const debt: Debt = {
  owner: 'ana',
  dueAt: new Date('2026-11-08T00:00:00Z'),
  alert: { id: 1, repo: 'acme/api', packageName: 'lodash', manifestPath: 'package.json',
    severity: 'critical', publishedAt: new Date('2026-11-01T00:00:00Z'), state: 'open', fixAvailable: true },
}

test('shouldFailWhenAuthorOwnsOverdueDebt', () => {
  assert.equal(gatePullRequest({ repo: 'acme/api', author: 'ana', debts: [debt] }).conclusion, 'failure')
})

test('shouldPassWhenDebtBelongsToAnotherOwner', () => {
  assert.equal(gatePullRequest({ repo: 'acme/api', author: 'luis', debts: [debt] }).conclusion, 'success')
})

test('shouldPassWhenThereIsNoDebt', () => {
  const result = gatePullRequest({ repo: 'acme/api', author: 'ana', debts: [] })
  assert.deepEqual(result, {
    conclusion: 'success',
    title: 'Within curfew',
    summary: 'No overdue dependency alerts for @ana.',
  })
})

test('shouldMatchOwnerCaseInsensitively', () => {
  assert.equal(gatePullRequest({ repo: 'acme/api', author: 'Ana', debts: [debt] }).conclusion, 'failure')
})

test('shouldListEachOverduePackageInSummary', () => {
  const result = gatePullRequest({ repo: 'acme/api', author: 'ana', debts: [debt, debt] })
  assert.equal(result.title, 'Curfew passed: 2 alerts')
  assert.match(result.summary, /lodash \(critical\) due 2026-11-08/)
})
