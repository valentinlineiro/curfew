import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createWorkerHandler, type WorkerExecutionContext } from '../src/delivery/worker.ts'
import type { CurfewConfig, CurfewProcessor } from '../src/delivery/processor.ts'

const secret = 'worker-secret'
const env: CurfewConfig = {
  CURFEW_APP_ID: '1',
  CURFEW_PRIVATE_KEY: 'test-key',
  CURFEW_WEBHOOK_SECRET: secret,
}

function signedRequest(payload: unknown, event = 'pull_request'): Request {
  const body = JSON.stringify(payload)
  const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
  return new Request('https://curfew.example/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-github-event': event, 'x-hub-signature-256': signature },
    body,
  })
}

function payload() {
  return {
    action: 'opened',
    repository: { full_name: 'acme/api' },
    installation: { id: 42 },
    pull_request: { head: { sha: 'abc123', repo: { full_name: 'acme/api' } }, user: { login: 'ana' } },
  }
}

function context(tasks: Promise<unknown>[]): WorkerExecutionContext {
  return { waitUntil(promise) { tasks.push(promise) } }
}

test('returns health response without creating a processor', async () => {
  const handler = createWorkerHandler(() => { throw new Error('should not construct processor') })
  const response = await handler(new Request('https://curfew.example/health'), env, context([]))
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'ok')
})

test('rejects invalid signatures before scheduling work', async () => {
  const handler = createWorkerHandler()
  const request = new Request('https://curfew.example/webhook', {
    method: 'POST',
    headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': 'sha256=bad' },
    body: JSON.stringify(payload()),
  })
  const tasks: Promise<unknown>[] = []
  const response = await handler(request, env, context(tasks))
  assert.equal(response.status, 401)
  assert.equal(tasks.length, 0)
})

test('acknowledges a valid pull request and schedules evaluation with waitUntil', async () => {
  const jobs: unknown[] = []
  const processor = {
    webhookSecret: secret,
    async handlePullRequest(job: unknown) { jobs.push(job) },
    async publishSkipCheck() {},
  } as unknown as CurfewProcessor
  const handler = createWorkerHandler(() => processor)
  const tasks: Promise<unknown>[] = []
  const response = await handler(signedRequest(payload()), env, context(tasks))
  assert.equal(response.status, 202)
  assert.equal(tasks.length, 1)
  await Promise.all(tasks)
  assert.deepEqual(jobs, [{ repo: 'acme/api', headSha: 'abc123', author: 'ana', installationId: 42 }])
})

test('rejects webhook bodies larger than one mebibyte', async () => {
  const handler = createWorkerHandler()
  const response = await handler(
    new Request('https://curfew.example/webhook', { method: 'POST', body: 'x'.repeat(1_048_577) }),
    env,
    context([]),
  )
  assert.equal(response.status, 413)
})
