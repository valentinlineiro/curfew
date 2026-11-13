import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createCurfewProcessor } from './processor.ts'
import { parsePullRequestJob, verifySignature, type PullRequestPayload } from './webhook.ts'

const MAX_BODY = 1_048_576

const processor = createCurfewProcessor({
  CURFEW_APP_ID: requireEnv('CURFEW_APP_ID'),
  CURFEW_PRIVATE_KEY: requireEnv('CURFEW_PRIVATE_KEY'),
  CURFEW_WEBHOOK_SECRET: requireEnv('CURFEW_WEBHOOK_SECRET'),
  CURFEW_POLICY: process.env.CURFEW_POLICY,
})

const server = createServer((req, res) => {
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
  const signature = (req.headers['x-hub-signature-256'] ?? req.headers['x-github-signature-256']) as string | undefined
  if (!verifySignature(processor.webhookSecret, raw, signature)) {
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
  res.writeHead(202).end()

  if (!job) {
    await processor.publishSkipCheck(event, payload)
    return
  }
  try {
    await processor.handlePullRequest(job)
  } catch (error) {
    console.error('curfew failed to process', job.repo, job.headSha, error)
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
