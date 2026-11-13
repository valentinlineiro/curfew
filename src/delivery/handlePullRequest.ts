import { evaluateSla } from '../application/evaluateSla.ts'
import { gatePullRequest } from '../application/gate.ts'
import { resolveApplicableDebts } from '../application/applicableDebts.ts'
import type { GateResult } from '../domain/check.ts'
import type { Owner } from '../domain/owner.ts'
import type { Policy } from '../domain/policy.ts'
import type {
  AlertSource,
  CheckPublisher,
  InstallationClock,
  OwnerLookup,
  TeamMembership,
  Logger,
} from '../ports.ts'
import type { PullRequestJob } from './webhook.ts'

export type PullRequestDeps = {
  alerts: AlertSource
  ownerLookup: OwnerLookup
  teamMembership: TeamMembership
  clock: InstallationClock
  checks: CheckPublisher
  policy: Policy
  logger?: Logger
  now?: () => Date
}

function safeErrorContext(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, code: (err as { code?: unknown }).code }
  }
  return { message: String(err) }
}

export async function handlePullRequest(job: PullRequestJob, deps: PullRequestDeps): Promise<void> {
  const safeLogger: Logger = {
    info(msg, ctx) { try { deps.logger?.info(msg, ctx) } catch {} },
    warn(msg, ctx) { try { deps.logger?.warn(msg, ctx) } catch {} },
    error(msg, ctx) { try { deps.logger?.error(msg, ctx) } catch {} },
  }

  const author = job.author.replace(/^@/, '').toLowerCase()

  let result: GateResult
  try {
    const now = deps.now?.() ?? new Date()
    const notBefore = await deps.clock.installedAt(job.installationId)
    const alerts = await deps.alerts.listOpenAlerts(job.repo)

    // Parallel lookup for distinct manifests
    const uniqueManifests = Array.from(new Set(alerts.map((a) => a.manifestPath)))
    const manifestOwnerEntries = await Promise.all(
      uniqueManifests.map(async (path) => [path, await deps.ownerLookup.ownerFor(job.repo, path)] as const),
    )
    const ownerByManifest = new Map<string, Owner | null>(manifestOwnerEntries)

    const owners = new Map<number, Owner>()
    for (const alert of alerts) {
      const owner = ownerByManifest.get(alert.manifestPath)
      if (owner) owners.set(alert.id, owner)
    }

    const overdueDebts = evaluateSla({ alerts, owners, policy: deps.policy, now, notBefore })

    const { applicableDebts, degradations } = await resolveApplicableDebts({
      author,
      debts: overdueDebts,
      teamMembership: deps.teamMembership,
    })

    if (degradations.length > 0) {
      for (const deg of degradations) {
        safeLogger.warn('Team membership check degraded; failing open for team debt', {
          repo: job.repo,
          headSha: job.headSha,
          author,
          team: `${deg.team.org}/${deg.team.teamSlug}`,
          reason: deg.reason,
        })
      }
    }

    result = gatePullRequest({ repo: job.repo, author, applicableDebts })
  } catch (evalError) {
    safeLogger.error('curfew could not evaluate pull request; failing open', {
      repo: job.repo,
      headSha: job.headSha,
      error: safeErrorContext(evalError),
    })
    result = {
      conclusion: 'success',
      title: 'Curfew could not evaluate this pull request',
      summary: 'curfew could not evaluate this pull request; failing open.',
    }
  }

  // Publication error propagates to delivery runtime
  try {
    await deps.checks.publish({ repo: job.repo, headSha: job.headSha, result })
  } catch (publishError) {
    safeLogger.error('curfew failed to publish check run', {
      repo: job.repo,
      headSha: job.headSha,
      error: safeErrorContext(publishError),
    })
    throw publishError
  }
}
