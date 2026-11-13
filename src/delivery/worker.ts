import { Buffer } from 'node:buffer'
import { createCurfewProcessor, type CurfewConfig, type CurfewProcessor } from './processor.ts'
import { parseCheckTarget, parsePullRequestJob, verifySignature, type PullRequestPayload } from './webhook.ts'

const MAX_BODY = 1_048_576

export type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void
}
type ProcessorFactory = (env: CurfewConfig) => CurfewProcessor

export function createWorkerHandler(processorFactory: ProcessorFactory = createCurfewProcessor) {
  return async function fetchHandler(
    request: Request,
    env: CurfewConfig,
    ctx: WorkerExecutionContext,
  ): Promise<Response> {
    const pathname = new URL(request.url).pathname
    if (request.method === 'GET' && pathname === '/health') return new Response('ok')
    if (request.method !== 'POST' || pathname !== '/webhook') return new Response(null, { status: 404 })
    if (!env.CURFEW_WEBHOOK_SECRET) return new Response(null, { status: 500 })

    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > MAX_BODY) return new Response(null, { status: 413 })
    const body = await readBody(request)
    if (body === null) return new Response(null, { status: 413 })

    const signature =
      request.headers.get('x-hub-signature-256') ??
      request.headers.get('x-github-signature-256') ??
      undefined
    if (!verifySignature(env.CURFEW_WEBHOOK_SECRET, body, signature)) {
      return new Response(null, { status: 401 })
    }

    let payload: PullRequestPayload
    try {
      payload = JSON.parse(body.toString('utf8')) as PullRequestPayload
    } catch {
      return new Response(null, { status: 400 })
    }

    const event = request.headers.get('x-github-event') ?? ''
    const job = parsePullRequestJob(event, payload)
    if (!job) {
      if (parseCheckTarget(event, payload)) {
        const processor = processorFactory(env)
        ctx.waitUntil(processor.publishSkipCheck(event, payload))
      }
      return new Response(null, { status: 202 })
    }

    const processor = processorFactory(env)
    ctx.waitUntil(processor.handlePullRequest(job).catch((error) => {
      console.error('curfew failed to process', job.repo, job.headSha, error)
    }))
    return new Response(null, { status: 202 })
  }
}

async function readBody(request: Request): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0)
  const reader = request.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

export default { fetch: createWorkerHandler() }
