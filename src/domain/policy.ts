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
