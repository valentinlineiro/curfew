import { createServer } from 'node:http'
import { createAppAuth } from '@octokit/auth-app'
import { createGitHubAlertSource } from '../adapters/github/alerts.ts'
import { createGitHubCheckPublisher } from '../adapters/github/checks.ts'
import { createGitHubInstallationClock } from '../adapters/github/installation.ts'
import { createGitHubOwnerLookup } from '../adapters/github/owners.ts'
import { DEFAULT_POLICY, type Policy } from '../domain/policy.ts'
import { handlePullRequest } from './handlePullRequest.ts'
import { parsePullRequestJob, verifySignature, type PullRequestPayload } from './webhook.ts'

const MAX_BODY = 1_048_576

const appId = Number(requireEnv('CURFEW_APP_ID'))
const privateKey = requireEnv('CURFEW_PRIVATE_KEY').replace(/\\n/g, '\n')
const webhookSecret = requireEnv('CURFEW_WEBHOOK_SECRET')
const policy: Policy = process.env.CURFEW_POLICY ? JSON.parse(process.env.CURFEW_POLICY) : DEFAULT_POLICY

const auth = createAppAuth({ appId, privateKey })
const appJwt = async () => (await auth({ type: 'app' })).token
const tokenFor = async (installationId: number) => (await auth({ type: 'installation', installationId })).token

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200).end('ok')
    return
  }
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404).end()
    return
  }

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) {
      res.writeHead(413).end()
      req.destroy()
      return
    }
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks)

  if (!verifySignature(webhookSecret, raw, req.headers['x-github-signature-256'] as string | undefined)) {
    res.writeHead(401).end()
    return
  }

  let payload: PullRequestPayload
  try {
    payload = JSON.parse(raw.toString('utf8')) as PullRequestPayload
  } catch {
    res.writeHead(400).end()
    return
  }

  const job = parsePullRequestJob(String(req.headers['x-github-event']), payload)

  // Acknowledge before working: GitHub retries anything slower than 10 seconds.
  res.writeHead(202).end()
  if (!job) return

  try {
    const token = await tokenFor(job.installationId)
    await handlePullRequest(job, {
      alerts: createGitHubAlertSource({ token }),
      ownerLookup: createGitHubOwnerLookup({ token }),
      clock: createGitHubInstallationClock({ appAuth: appJwt }),
      checks: createGitHubCheckPublisher({ token }),
      policy,
    })
  } catch (error) {
    console.error('curfew failed to process', job.repo, job.headSha, error)
  }
})

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`curfew listening on :${process.env.PORT ?? 3000}`)
})

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}
