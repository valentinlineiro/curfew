import type { Debt } from '../domain/alert.ts'
import type { GateResult } from '../domain/check.ts'
import { formatOwner } from '../domain/owner.ts'

export function gatePullRequest(input: {
  repo: string
  author: string
  applicableDebts: Debt[]
}): GateResult {
  const { repo, author, applicableDebts } = input

  if (applicableDebts.length === 0) {
    return {
      conclusion: 'success',
      title: 'Within curfew',
      summary: `No overdue dependency alerts for @${author}.`,
    }
  }

  const lines = applicableDebts.map(
    (debt) =>
      `- ${debt.alert.packageName} (${debt.alert.severity}) due ${debt.dueAt.toISOString().slice(0, 10)} [owner: ${formatOwner(debt.owner)}]`,
  )

  return {
    conclusion: 'failure',
    title: `${applicableDebts.length} overdue alert${applicableDebts.length === 1 ? '' : 's'}`,
    summary: `@${author} has overdue dependency alerts in ${repo}:\n\n${lines.join('\n')}`,
  }
}
