import { evaluateSla } from '../application/evaluateSla.ts'
import { gatePullRequest } from '../application/gate.ts'
import type { Owner } from '../domain/owner.ts'
import type { Policy } from '../domain/policy.ts'
import type { AlertSource, CheckPublisher, InstallationClock, OwnerLookup } from '../ports.ts'
import type { PullRequestJob } from './webhook.ts'

export type PullRequestDeps = {
  alerts: AlertSource
  ownerLookup: OwnerLookup
  clock: InstallationClock
  checks: CheckPublisher
  policy: Policy
  now?: () => Date
}

export async function handlePullRequest(job: PullRequestJob, deps: PullRequestDeps): Promise<void> {
  try {
    const now = deps.now?.() ?? new Date()
    const notBefore = await deps.clock.installedAt(job.installationId)
    const alerts = await deps.alerts.listOpenAlerts(job.repo)

    const owners = new Map<number, Owner>()
    const ownerByManifest = new Map<string, Owner | null>()
    for (const alert of alerts) {
      if (!ownerByManifest.has(alert.manifestPath)) {
        ownerByManifest.set(alert.manifestPath, await deps.ownerLookup.ownerFor(job.repo, alert.manifestPath))
      }
      const owner = ownerByManifest.get(alert.manifestPath)
      if (owner) owners.set(alert.id, owner)
    }

    const debts = evaluateSla({ alerts, owners, policy: deps.policy, now, notBefore })
    const result = gatePullRequest({ repo: job.repo, author: job.author, debts })
    await deps.checks.publish({ repo: job.repo, headSha: job.headSha, result })
  } catch (error) {
    // Fail open: a broken gate must never block a merge.
    console.error('curfew could not evaluate', job.repo, job.headSha, error)
    await deps.checks.publish({
      repo: job.repo,
      headSha: job.headSha,
      result: {
        conclusion: 'success',
        title: 'Curfew could not evaluate this pull request',
        summary: 'curfew could not evaluate this pull request; failing open.',
      },
    })
  }
}
