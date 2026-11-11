import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const PORT = 3987
const ROOT = fileURLToPath(new URL('..', import.meta.url))

test('shouldStayAliveWhenClientAbortsMidBody', async () => {
  const child = spawn(process.execPath, ['src/delivery/server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      CURFEW_APP_ID: '1',
      CURFEW_PRIVATE_KEY: 'key',
      CURFEW_WEBHOOK_SECRET: 's3cret',
      PORT: String(PORT),
    },
    stdio: 'ignore',
  })

  try {
    await waitForHealth()
    await abortMidBody()
    await new Promise((resolve) => setTimeout(resolve, 200))

    assert.equal((await fetch(`http://127.0.0.1:${PORT}/health`)).status, 200)
    assert.equal(child.exitCode, null, 'server exited after an aborted request')
  } finally {
    child.kill()
  }
})

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('curfew server did not start')
}

function abortMidBody(): Promise<void> {
  return new Promise((resolve) => {
    const socket = net.connect(PORT, '127.0.0.1', () => {
      socket.write(
        'POST /webhook HTTP/1.1\r\nHost: x\r\nContent-Length: 1000\r\nContent-Type: application/json\r\n\r\n{"partial":',
      )
      setTimeout(() => {
        socket.destroy()
        resolve()
      }, 50)
    })
    socket.on('error', () => {})
  })
}
