import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createAppAuth } from '@octokit/auth-app'
import { createGitHubAlertSource } from '../adapters/github/alerts.ts'
import { createGitHubCheckPublisher } from '../adapters/github/checks.ts'
import { createGitHubInstallationClock } from '../adapters/github/installation.ts'
import { createGitHubOwnerLookup } from '../adapters/github/owners.ts'
import { parsePolicy, type Policy } from '../domain/policy.ts'
import { handlePullRequest } from './handlePullRequest.ts'
import { parseCheckTarget, parsePullRequestJob, verifySignature, type PullRequestPayload } from './webhook.ts'

const MAX_BODY = 1_048_576

const appId = Number(requireEnv('CURFEW_APP_ID'))
if (!Number.isInteger(appId)) throw new Error('CURFEW_APP_ID must be an integer')
const privateKey = requireEnv('CURFEW_PRIVATE_KEY').replace(/\\n/g, '\n')
const webhookSecret = requireEnv('CURFEW_WEBHOOK_SECRET')
const policy: Policy = parsePolicy(process.env.CURFEW_POLICY)

const auth = createAppAuth({ appId, privateKey })
const appJwt = async () => (await auth({ type: 'app' })).token
const tokenFor = async (installationId: number) => (await auth({ type: 'installation', installationId })).token

const server = createServer((req, res) => {
  // A dropped connection must not take the process down.
  handleRequest(req, res).catch((error) => {
    console.error('curfew request failed', error)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
})

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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

  const event = String(req.headers['x-github-event'])
  const job = parsePullRequestJob(event, payload)

  // Acknowledge before working: GitHub retries anything slower than 10 seconds.
  res.writeHead(202).end()

  if (!job) {
    await publishSkipCheck(event, payload)
    return
  }

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
}

// Bots and forks are not evaluated, but a required check must still be reported,
// otherwise GitHub leaves the pull request pending forever.
async function publishSkipCheck(event: string, payload: PullRequestPayload): Promise<void> {
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
}

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`curfew listening on :${process.env.PORT ?? 3000}`)
})

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}
