import { dueDate, type Policy } from '../domain/policy.ts'
import type { Alert, Debt } from '../domain/alert.ts'

export function evaluateSla(input: {
  alerts: Alert[]
  owners: ReadonlyMap<number, string>
  policy: Policy
  now: Date
  notBefore: Date
}): Debt[] {
  const debts: Debt[] = []
  for (const alert of input.alerts) {
    const owner = input.owners.get(alert.id)
    if (alert.state !== 'open' || !alert.fixAvailable || !owner) continue
    const due = dueDate(alert.publishedAt, alert.severity, input.policy, input.notBefore)
    if (due && due.getTime() < input.now.getTime()) debts.push({ alert, owner, dueAt: due })
  }
  return debts
}
