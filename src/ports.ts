import type { Alert } from './domain/alert.ts'
import type { GateResult } from './domain/check.ts'
import type { Owner } from './domain/owner.ts'

export interface AlertSource { listOpenAlerts(repo: string): Promise<Alert[]> }
export interface OwnerLookup { ownerFor(repo: string, manifestPath: string): Promise<Owner | null> }
export interface InstallationClock { installedAt(installationId: number): Promise<Date> }
export interface CheckPublisher {
  publish(input: { repo: string; headSha: string; result: GateResult }): Promise<void>
}
