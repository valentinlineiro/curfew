export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Policy = Record<Severity, number | null>

export const DEFAULT_POLICY: Policy = { critical: 7, high: 30, medium: 90, low: null }

// The clock starts when the alert is published, but never before Curfew was installed:
// otherwise a new install is red on day one and gets removed.
export function dueDate(publishedAt: Date, severity: Severity, policy: Policy, notBefore: Date): Date | null {
  const days = policy[severity]
  if (days === null) return null
  const start = Math.max(publishedAt.getTime(), notBefore.getTime())
  return new Date(start + days * 86_400_000)
}

// Reject a bad override at boot: a NaN window silently disables a severity.
export function parsePolicy(raw: string | undefined): Policy {
  if (!raw) return DEFAULT_POLICY
  const parsed = JSON.parse(raw) as Record<string, unknown>
  for (const [severity, days] of Object.entries(parsed)) {
    if (!Object.hasOwn(DEFAULT_POLICY, severity)) throw new Error(`unknown severity in CURFEW_POLICY: ${severity}`)
    if (days !== null && !(typeof days === 'number' && Number.isInteger(days) && days > 0)) {
      throw new Error(`invalid window for ${severity} in CURFEW_POLICY: ${String(days)}`)
    }
  }
  return { ...DEFAULT_POLICY, ...(parsed as Partial<Policy>) }
}
