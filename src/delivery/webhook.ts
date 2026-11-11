import { createHmac, timingSafeEqual } from 'node:crypto'

export type PullRequestJob = { repo: string; headSha: string; author: string; installationId: number }

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

export function parsePullRequestJob(event: string, payload: PullRequestPayload): PullRequestJob | null {
  if (event !== 'pull_request' || !payload.action || !ACTIONS.has(payload.action)) return null

  const repo = payload.repository?.full_name
  const headSha = payload.pull_request?.head?.sha
  const headRepo = payload.pull_request?.head?.repo?.full_name
  const author = payload.pull_request?.user?.login
  const installationId = payload.installation?.id

  if (!repo || !headSha || !author || installationId === undefined) return null
  if (headRepo !== repo) return null
  if (author.endsWith('[bot]')) return null

  return { repo, headSha, author, installationId }
}
