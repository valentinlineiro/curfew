import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGitHubAlertSource } from '../src/adapters/github/alerts.ts'

const payload = [{
  number: 7, state: 'open',
  dependency: { package: { name: 'lodash' }, manifest_path: 'package.json' },
  security_advisory: { severity: 'critical', published_at: '2026-11-01T00:00:00Z' },
  security_vulnerability: { first_patched_version: { identifier: '4.17.21' } },
}]

const ok = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers })

test('shouldMapAlertPayloadToDomainAlert', async () => {
  const source = createGitHubAlertSource({ token: 't', fetch: async () => ok(payload) })
  const [alert] = await source.listOpenAlerts('acme/api')
  assert.deepEqual(alert, {
    id: 7, repo: 'acme/api', packageName: 'lodash', manifestPath: 'package.json',
    severity: 'critical', publishedAt: new Date('2026-11-01T00:00:00Z'),
    state: 'open', fixAvailable: true,
  })
})

test('shouldMarkAlertWithoutPatchAsNotFixable', async () => {
  const body = [{ ...payload[0], security_vulnerability: { first_patched_version: null } }]
  const source = createGitHubAlertSource({ token: 't', fetch: async () => ok(body) })
  assert.equal((await source.listOpenAlerts('acme/api'))[0].fixAvailable, false)
})

test('shouldFollowPaginationWhenResponseHasNextLink', async () => {
  const calls: string[] = []
  const source = createGitHubAlertSource({
    token: 't', apiUrl: 'https://api.github.test',
    fetch: async (url) => {
      calls.push(String(url))
      return calls.length === 1
        ? ok(payload, { link: '<https://api.github.test/repos/acme/api/dependabot/alerts?page=2>; rel="next"' })
        : ok([])
    },
  })
  await source.listOpenAlerts('acme/api')
  assert.equal(calls.length, 2)
  assert.match(calls[1], /page=2/)
})

test('shouldReturnEmptyListWhenDependabotIsUnavailable', async () => {
  const source = createGitHubAlertSource({ token: 't', fetch: async () => new Response('{}', { status: 403 }) })
  assert.deepEqual(await source.listOpenAlerts('acme/api'), [])
})

test('shouldThrowOnServerErrorSoTheGateCanFailOpen', async () => {
  const source = createGitHubAlertSource({ token: 't', fetch: async () => new Response('{}', { status: 500 }) })
  await assert.rejects(() => source.listOpenAlerts('acme/api'))
})
