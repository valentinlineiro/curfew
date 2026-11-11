import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGitHubInstallationClock } from '../src/adapters/github/installation.ts'

test('shouldReturnInstallationCreatedAt', async () => {
  let seenUrl = ''
  let seenAuth = ''
  const clock = createGitHubInstallationClock({
    appAuth: async () => 'jwt',
    fetch: async (url, init) => {
      seenUrl = String(url)
      seenAuth = String((init?.headers as Record<string, string>)?.authorization)
      return new Response(JSON.stringify({ created_at: '2026-11-11T00:00:00Z' }), { status: 200 })
    },
  })
  const installedAt = await clock.installedAt(42)
  assert.equal(installedAt.toISOString(), '2026-11-11T00:00:00.000Z')
  assert.match(seenUrl, /\/app\/installations\/42$/)
  assert.equal(seenAuth, 'Bearer jwt')
})
