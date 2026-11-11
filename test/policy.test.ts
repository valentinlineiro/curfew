import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_POLICY, dueDate, parsePolicy } from '../src/domain/policy.ts'

test('shouldAddCriticalWindowWhenAlertIsPublishedNow', () => {
  const due = dueDate(new Date('2026-11-11T00:00:00Z'), 'critical', DEFAULT_POLICY, new Date('2026-01-01T00:00:00Z'))
  assert.equal(due?.toISOString(), '2026-11-18T00:00:00.000Z')
})

test('shouldExemptLowSeverityFromSla', () => {
  assert.equal(dueDate(new Date(), 'low', DEFAULT_POLICY, new Date(0)), null)
})

test('shouldStartClockAtInstallTimeWhenAlertPredatesInstall', () => {
  const due = dueDate(new Date('2025-01-01T00:00:00Z'), 'critical', DEFAULT_POLICY, new Date('2026-11-11T00:00:00Z'))
  assert.equal(due?.toISOString(), '2026-11-18T00:00:00.000Z')
})

test('shouldUsePolicyOverrideWhenProvided', () => {
  const due = dueDate(new Date('2026-11-11T00:00:00Z'), 'high', { ...DEFAULT_POLICY, high: 1 }, new Date(0))
  assert.equal(due?.toISOString(), '2026-11-12T00:00:00.000Z')
})

test('shouldMergePolicyOverrideWithDefaults', () => {
  assert.deepEqual(parsePolicy('{"critical":3}'), { ...DEFAULT_POLICY, critical: 3 })
})

test('shouldRejectPolicyWithNonPositiveWindow', () => {
  assert.throws(() => parsePolicy('{"critical":-1}'))
})

test('shouldRejectPolicyWithUnknownSeverity', () => {
  assert.throws(() => parsePolicy('{"criticall":3}'))
})
