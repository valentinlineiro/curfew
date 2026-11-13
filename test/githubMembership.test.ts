import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGitHubTeamMembership } from '../src/adapters/github/membership.ts'

test('shouldReturnMemberWhenStateIsActive', async () => {
  const membership = createGitHubTeamMembership({
    token: 'tok',
    fetch: async (url, init) => {
      assert.equal(
        String(url),
        'https://api.github.com/orgs/acme/teams/frontend/memberships/alice',
      )
      const headers = init?.headers as Record<string, string>
      assert.equal(headers.authorization, 'Bearer tok')
      assert.equal(headers.accept, 'application/vnd.github+json')
      assert.equal(headers['x-github-api-version'], '2022-11-28')
      return new Response(JSON.stringify({ state: 'active', role: 'member' }), { status: 200 })
    },
  })

  const result = await membership.checkMembership('acme', 'frontend', 'alice')
  assert.deepEqual(result, { status: 'MEMBER' })
})

test('shouldReturnNotMemberWhenStateIsPending', async () => {
  const membership = createGitHubTeamMembership({
    token: 'tok',
    fetch: async () => new Response(JSON.stringify({ state: 'pending' }), { status: 200 }),
  })
  const result = await membership.checkMembership('acme', 'frontend', 'bob')
  assert.deepEqual(result, { status: 'NOT_MEMBER' })
})

test('shouldReturnUnknownUnexpectedWhenStateIsUnknownOrMalformed', async () => {
  const membership = createGitHubTeamMembership({
    token: 'tok',
    fetch: async () => new Response('{ invalid json', { status: 200 }),
  })
  const result = await membership.checkMembership('acme', 'frontend', 'bob')
  assert.deepEqual(result, { status: 'UNKNOWN', reason: 'UNEXPECTED_ERROR' })
})

test('shouldReturnNotMemberOn404', async () => {
  const membership = createGitHubTeamMembership({
    token: 'tok',
    fetch: async () => new Response('{"message": "Not Found"}', { status: 404 }),
  })
  const result = await membership.checkMembership('acme', 'frontend', 'charlie')
  assert.deepEqual(result, { status: 'NOT_MEMBER' })
})

test('shouldReturnUnknownRateLimitedOn403WhenRateLimitRemainingIsZero', async () => {
  const membership = createGitHubTeamMembership({
    token: 'tok',
    fetch: async () =>
      new Response('{"message": "rate limited"}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      }),
  })
  const result = await membership.checkMembership('acme', 'frontend', 'david')
  assert.deepEqual(result, { status: 'UNKNOWN', reason: 'RATE_LIMITED' })
})

test('shouldReturnUnknownForbiddenOnStandard403', async () => {
  const membership = createGitHubTeamMembership({
    token: 'tok',
    fetch: async () =>
      new Response('{"message": "forbidden"}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '50' },
      }),
  })
  const result = await membership.checkMembership('acme', 'frontend', 'david')
  assert.deepEqual(result, { status: 'UNKNOWN', reason: 'FORBIDDEN' })
})

test('shouldReturnUnknownRateLimitedOn429', async () => {
  const membership = createGitHubTeamMembership({
    token: 'tok',
    fetch: async () => new Response('{"message": "too many requests"}', { status: 429 }),
  })
  const result = await membership.checkMembership('acme', 'frontend', 'david')
  assert.deepEqual(result, { status: 'UNKNOWN', reason: 'RATE_LIMITED' })
})

test('shouldReturnUnknownServerErrorOn5xx', async () => {
  const membership = createGitHubTeamMembership({
    token: 'tok',
    fetch: async () => new Response('{"message": "server error"}', { status: 503 }),
  })
  const result = await membership.checkMembership('acme', 'frontend', 'david')
  assert.deepEqual(result, { status: 'UNKNOWN', reason: 'SERVER_ERROR' })
})

test('shouldReturnUnknownTimeoutWhenSignalAborts', async () => {
  const membership = createGitHubTeamMembership({
    token: 'tok',
    fetch: async () => {
      const err = new Error('The operation was aborted')
      err.name = 'TimeoutError'
      throw err
    },
  })
  const result = await membership.checkMembership('acme', 'frontend', 'david')
  assert.deepEqual(result, { status: 'UNKNOWN', reason: 'TIMEOUT' })
})

test('shouldReturnUnknownNetworkErrorOnFetchNetworkFailure', async () => {
  const membership = createGitHubTeamMembership({
    token: 'tok',
    fetch: async () => {
      throw new TypeError('fetch failed: network down')
    },
  })
  const result = await membership.checkMembership('acme', 'frontend', 'david')
  assert.deepEqual(result, { status: 'UNKNOWN', reason: 'NETWORK_ERROR' })
})
