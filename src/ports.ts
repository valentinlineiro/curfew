import type { Alert } from './domain/alert.ts'
import type { GateResult } from './domain/check.ts'
import type { Owner } from './domain/owner.ts'

export type MembershipFailureReason =
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'UNEXPECTED_ERROR'

export type MembershipResult =
  | { status: 'MEMBER' }
  | { status: 'NOT_MEMBER' }
  | { status: 'UNKNOWN'; reason: MembershipFailureReason }

export interface AlertSource { listOpenAlerts(repo: string): Promise<Alert[]> }
export interface OwnerLookup { ownerFor(repo: string, manifestPath: string): Promise<Owner | null> }
export interface TeamMembership {
  checkMembership(org: string, teamSlug: string, username: string): Promise<MembershipResult>
}
export interface InstallationClock { installedAt(installationId: number): Promise<Date> }
export interface CheckPublisher {
  publish(input: { repo: string; headSha: string; result: GateResult }): Promise<void>
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}
