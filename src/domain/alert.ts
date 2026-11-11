import type { Severity } from './policy.ts'

export type Alert = {
  id: number
  repo: string
  packageName: string
  manifestPath: string
  severity: Severity
  publishedAt: Date
  state: 'open' | 'dismissed'
  fixAvailable: boolean
}

export type Debt = { alert: Alert; owner: string; dueAt: Date }
