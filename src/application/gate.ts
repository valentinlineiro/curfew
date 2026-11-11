import type { Debt } from '../domain/alert.ts'
import type { GateResult } from '../domain/check.ts'

export function gatePullRequest(input: { repo: string; author: string; debts: Debt[] }): GateResult {
  const author = input.author.toLowerCase()
  const mine = input.debts.filter((debt) => debt.owner.replace(/^@/, '').toLowerCase() === author)

  if (mine.length === 0) {
    return { conclusion: 'success', title: 'Within curfew', summary: `No overdue dependency alerts for @${input.author}.` }
  }

  const lines = mine.map((debt) =>
    `- ${debt.alert.packageName} (${debt.alert.severity}) due ${debt.dueAt.toISOString().slice(0, 10)}`)

  return {
    conclusion: 'failure',
    title: `Curfew passed: ${mine.length} alert${mine.length === 1 ? '' : 's'}`,
    summary: `@${input.author} has overdue dependency alerts in ${input.repo}:\n\n${lines.join('\n')}`,
  }
}
