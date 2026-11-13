import type { Severity } from './policy.ts'
import type { Owner } from './owner.ts'

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

export type Debt = { alert: Alert; owner: Owner; dueAt: Date }
