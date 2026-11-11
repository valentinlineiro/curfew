import type { Alert } from './domain/alert.ts'
import type { GateResult } from './domain/check.ts'

export interface AlertSource { listOpenAlerts(repo: string): Promise<Alert[]> }
export interface OwnerLookup { ownerFor(repo: string, manifestPath: string): Promise<string | null> }
export interface InstallationClock { installedAt(installationId: number): Promise<Date> }
export interface CheckPublisher {
  publish(input: { repo: string; headSha: string; result: GateResult }): Promise<void>
}
