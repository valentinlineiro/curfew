import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gatePullRequest } from '../src/application/gate.ts'
import type { Debt } from '../src/domain/alert.ts'

const userDebt: Debt = {
  owner: { kind: 'user', login: 'ana' },
  dueAt: new Date('2026-11-08T00:00:00Z'),
  alert: { id: 1, repo: 'acme/api', packageName: 'lodash', manifestPath: 'package.json',
    severity: 'critical', publishedAt: new Date('2026-11-01T00:00:00Z'), state: 'open', fixAvailable: true },
}

const teamDebt: Debt = {
  owner: { kind: 'team', org: 'acme', teamSlug: 'frontend' },
  dueAt: new Date('2026-11-10T00:00:00Z'),
  alert: { id: 2, repo: 'acme/api', packageName: 'axios', manifestPath: 'package.json',
    severity: 'high', publishedAt: new Date('2026-10-01T00:00:00Z'), state: 'open', fixAvailable: true },
}

test('shouldPassWhenApplicableDebtsIsEmpty', () => {
  const result = gatePullRequest({ repo: 'acme/api', author: 'ana', applicableDebts: [] })
  assert.deepEqual(result, {
    conclusion: 'success',
    title: 'Within curfew',
    summary: 'No overdue dependency alerts for @ana.',
  })
})

test('shouldFailWithSingularTitleWhenOneApplicableDebt', () => {
  const result = gatePullRequest({ repo: 'acme/api', author: 'ana', applicableDebts: [userDebt] })
  assert.equal(result.conclusion, 'failure')
  assert.equal(result.title, '1 overdue alert')
  assert.match(result.summary, /@ana has overdue dependency alerts in acme\/api:/)
  assert.match(result.summary, /- lodash \(critical\) due 2026-11-08 \[owner: @ana\]/)
})

test('shouldFailWithPluralTitleWhenMultipleApplicableDebts', () => {
  const result = gatePullRequest({ repo: 'acme/api', author: 'ana', applicableDebts: [userDebt, teamDebt] })
  assert.equal(result.conclusion, 'failure')
  assert.equal(result.title, '2 overdue alerts')
  assert.match(result.summary, /- lodash \(critical\) due 2026-11-08 \[owner: @ana\]/)
  assert.match(result.summary, /- axios \(high\) due 2026-11-10 \[owner: @acme\/frontend\]/)
})
