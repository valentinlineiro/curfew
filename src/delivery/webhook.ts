import { createHmac, timingSafeEqual } from 'node:crypto'

export type PullRequestJob = { repo: string; headSha: string; author: string; installationId: number }
export type PullRequestTarget = { repo: string; headSha: string; installationId: number }

const ACTIONS = new Set(['opened', 'synchronize', 'reopened'])

export type PullRequestPayload = {
  action?: string
  repository?: { full_name?: string }
  installation?: { id?: number }
  pull_request?: {
    head?: { sha?: string; repo?: { full_name?: string } }
    user?: { login?: string }
  }
}

export function verifySignature(secret: string, rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex'))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

// The commit that must end up with a check, whatever the author turns out to be.
export function parseCheckTarget(event: string, payload: PullRequestPayload): PullRequestTarget | null {
  if (event !== 'pull_request' || !payload.action || !ACTIONS.has(payload.action)) return null

  const repo = payload.repository?.full_name
  const headSha = payload.pull_request?.head?.sha
  const installationId = payload.installation?.id

  if (!repo || !headSha || installationId === undefined) return null
  return { repo, headSha, installationId }
}

export function parsePullRequestJob(event: string, payload: PullRequestPayload): PullRequestJob | null {
  const target = parseCheckTarget(event, payload)
  const author = payload.pull_request?.user?.login

  if (!target || !author) return null
  if (payload.pull_request?.head?.repo?.full_name !== target.repo) return null
  // A bot cannot pay its debt, so it is skipped, but it still gets a passing check.
  if (author.endsWith('[bot]')) return null

  return { ...target, author }
}
