import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_POLICY } from '../src/domain/policy.ts'
import type { Alert } from '../src/domain/alert.ts'
import { evaluateSla } from '../src/application/evaluateSla.ts'

const now = new Date('2026-11-11T00:00:00Z')
const notBefore = new Date('2025-01-01T00:00:00Z')
const owners = new Map([[1, 'ana'], [2, 'ana'], [3, 'ana']])

const base: Alert = {
  id: 1, repo: 'acme/api', packageName: 'lodash', manifestPath: 'package.json',
  severity: 'critical', publishedAt: new Date('2026-11-01T00:00:00Z'),
  state: 'open', fixAvailable: true,
}

test('shouldReturnDebtWhenDueDateHasPassed', () => {
  assert.equal(evaluateSla({ alerts: [base], owners, policy: DEFAULT_POLICY, now, notBefore }).length, 1)
})

test('shouldNotReturnDebtWhenAlertIsDismissed', () => {
  const alert = { ...base, state: 'dismissed' as const }
  assert.deepEqual(evaluateSla({ alerts: [alert], owners, policy: DEFAULT_POLICY, now, notBefore }), [])
})

test('shouldNotReturnDebtWhenNoFixIsAvailable', () => {
  const alert = { ...base, fixAvailable: false }
  assert.deepEqual(evaluateSla({ alerts: [alert], owners, policy: DEFAULT_POLICY, now, notBefore }), [])
})

test('shouldNotReturnDebtWhenOwnerIsUnknown', () => {
  assert.deepEqual(evaluateSla({ alerts: [base], owners: new Map(), policy: DEFAULT_POLICY, now, notBefore }), [])
})

test('shouldNotReturnDebtWhenWithinWindow', () => {
  const alert = { ...base, publishedAt: new Date('2026-11-10T00:00:00Z') }
  assert.deepEqual(evaluateSla({ alerts: [alert], owners, policy: DEFAULT_POLICY, now, notBefore }), [])
})

test('shouldReturnOwnerAndDueDateWithEachDebt', () => {
  const [debt] = evaluateSla({ alerts: [base], owners, policy: DEFAULT_POLICY, now, notBefore })
  assert.equal(debt.owner, 'ana')
  assert.equal(debt.dueAt.toISOString(), '2026-11-08T00:00:00.000Z')
})
