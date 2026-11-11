import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGitHubOwnerLookup } from '../src/adapters/github/owners.ts'

const codeowners = (text: string) =>
  new Response(JSON.stringify({ content: Buffer.from(text).toString('base64') }), { status: 200 })

const notFound = () => new Response('{}', { status: 404 })

test('shouldUseCodeownersMatchWhenPresent', async () => {
  const lookup = createGitHubOwnerLookup({
    token: 't',
    fetch: async (url) =>
      String(url).includes('/contents/') ? codeowners('/package.json @ana') : notFound(),
  })
  assert.equal(await lookup.ownerFor('acme/api', 'package.json'), '@ana')
})

test('shouldResolveNestedManifestThroughCodeownersGlob', async () => {
  const lookup = createGitHubOwnerLookup({
    token: 't',
    fetch: async (url) =>
      String(url).includes('/contents/') ? codeowners('/services/** @ana') : notFound(),
  })
  assert.equal(await lookup.ownerFor('acme/api', 'services/api/package.json'), '@ana')
})

test('shouldFallBackToLastCommitAuthor', async () => {
  const lookup = createGitHubOwnerLookup({
    token: 't',
    fetch: async (url) =>
      String(url).includes('/commits')
        ? new Response(JSON.stringify([{ author: { login: 'luis' } }]), { status: 200 })
        : notFound(),
  })
  assert.equal(await lookup.ownerFor('acme/api', 'package.json'), '@luis')
})

test('shouldReturnNullWhenNeitherCodeownersNorCommitsExist', async () => {
  const lookup = createGitHubOwnerLookup({ token: 't', fetch: async () => notFound() })
  assert.equal(await lookup.ownerFor('acme/api', 'package.json'), null)
})

test('shouldReturnNullWhenGitHubThrows', async () => {
  const lookup = createGitHubOwnerLookup({
    token: 't',
    fetch: async () => {
      throw new Error('network down')
    },
  })
  assert.equal(await lookup.ownerFor('acme/api', 'package.json'), null)
})
