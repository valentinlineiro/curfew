import { createAppAuth } from '@octokit/auth-app'
import { createGitHubAlertSource } from '../adapters/github/alerts.ts'
import { createGitHubCheckPublisher } from '../adapters/github/checks.ts'
import { createGitHubInstallationClock } from '../adapters/github/installation.ts'
import { createGitHubOwnerLookup } from '../adapters/github/owners.ts'
import { createGitHubTeamMembership } from '../adapters/github/membership.ts'
import { parsePolicy } from '../domain/policy.ts'
import { handlePullRequest as evaluatePullRequest } from './handlePullRequest.ts'
import { parseCheckTarget, type PullRequestJob, type PullRequestPayload } from './webhook.ts'

export type CurfewConfig = {
  CURFEW_APP_ID: string
  CURFEW_PRIVATE_KEY: string
  CURFEW_WEBHOOK_SECRET: string
  CURFEW_POLICY?: string
}

export function createCurfewProcessor(config: CurfewConfig) {
  if (!config.CURFEW_APP_ID.trim()) throw new Error('missing CURFEW_APP_ID')
  if (!config.CURFEW_PRIVATE_KEY.trim()) throw new Error('missing CURFEW_PRIVATE_KEY')
  if (!config.CURFEW_WEBHOOK_SECRET.trim()) throw new Error('missing CURFEW_WEBHOOK_SECRET')

  const appId = Number(config.CURFEW_APP_ID)
  if (!Number.isInteger(appId)) throw new Error('CURFEW_APP_ID must be an integer')

  const privateKey = config.CURFEW_PRIVATE_KEY.replace(/\\n/g, '\n')
  const auth = createAppAuth({ appId, privateKey })
  const appJwt = async () => (await auth({ type: 'app' })).token
  const tokenFor = async (installationId: number) =>
    (await auth({ type: 'installation', installationId })).token
  const policy = parsePolicy(config.CURFEW_POLICY)

  return {
    webhookSecret: config.CURFEW_WEBHOOK_SECRET,

    async handlePullRequest(job: PullRequestJob): Promise<void> {
      const token = await tokenFor(job.installationId)
      await evaluatePullRequest(job, {
        alerts: createGitHubAlertSource({ token }),
        ownerLookup: createGitHubOwnerLookup({ token }),
        teamMembership: createGitHubTeamMembership({ token }),
        clock: createGitHubInstallationClock({ appAuth: appJwt }),
        checks: createGitHubCheckPublisher({ token }),
        policy,
      })
    },

    async publishSkipCheck(event: string, payload: PullRequestPayload): Promise<void> {
      const target = parseCheckTarget(event, payload)
      if (!target) return
      try {
        const token = await tokenFor(target.installationId)
        await createGitHubCheckPublisher({ token }).publish({
          repo: target.repo,
          headSha: target.headSha,
          result: {
            conclusion: 'success',
            title: 'Within curfew',
            summary: 'curfew does not evaluate pull requests from bots or forks.',
          },
        })
      } catch (error) {
        console.error('curfew could not publish a skip check', target.repo, target.headSha, error)
      }
    },
  }
}

export type CurfewProcessor = ReturnType<typeof createCurfewProcessor>
