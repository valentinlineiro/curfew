import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGitHubCheckPublisher } from '../src/adapters/github/checks.ts'

test('shouldPostCompletedCheckWithGateConclusion', async () => {
  let seenUrl = ''
  let seenMethod = ''
  let seenBody: unknown
  const publisher = createGitHubCheckPublisher({
    token: 't',
    fetch: async (url, init) => {
      seenUrl = String(url)
      seenMethod = String(init?.method)
      seenBody = JSON.parse(String(init?.body))
      return new Response('{}', { status: 201 })
    },
  })

  await publisher.publish({
    repo: 'acme/api',
    headSha: 'abc',
    result: { conclusion: 'failure', title: 'Curfew passed: 1 alert', summary: 'lodash due 2026-11-08' },
  })

  assert.match(seenUrl, /\/repos\/acme\/api\/check-runs$/)
  assert.equal(seenMethod, 'POST')
  assert.deepEqual(seenBody, {
    name: 'curfew',
    head_sha: 'abc',
    status: 'completed',
    conclusion: 'failure',
    output: { title: 'Curfew passed: 1 alert', summary: 'lodash due 2026-11-08' },
  })
})

test('shouldThrowOnApiErrorSoTheCallerCanFailOpen', async () => {
  const publisher = createGitHubCheckPublisher({
    token: 't',
    fetch: async () => new Response('{}', { status: 500 }),
  })
  await assert.rejects(() =>
    publisher.publish({
      repo: 'acme/api',
      headSha: 'abc',
      result: { conclusion: 'success', title: 'Within curfew', summary: '' },
    }),
  )
})
