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

test('shouldPreferCodeownersOverCommitAuthor', async () => {
  const urls: string[] = []
  const lookup = createGitHubOwnerLookup({
    token: 't',
    fetch: async (url) => {
      urls.push(String(url))
      if (String(url).includes('/commits')) return new Response(JSON.stringify([{ author: { login: 'luis' } }]), { status: 200 })
      if (String(url).endsWith('/contents/.github/CODEOWNERS')) return codeowners('/package.json @ana')
      return notFound()
    },
  })
  assert.equal(await lookup.ownerFor('acme/api', 'package.json'), '@ana')
  assert.equal(urls.some((url) => url.includes('/commits')), false)
})

test('shouldTryCodeownersPathsInOrderUntilOneExists', async () => {
  const lookup = createGitHubOwnerLookup({
    token: 't',
    fetch: async (url) => {
      const path = String(url)
      if (path.endsWith('/contents/CODEOWNERS')) return codeowners('/package.json @ana')
      if (path.endsWith('/contents/docs/CODEOWNERS')) return codeowners('/package.json @luis')
      return notFound()
    },
  })
  assert.equal(await lookup.ownerFor('acme/api', 'package.json'), '@ana')
})

test('shouldFallBackToCommitAuthorWhenCodeownersOwnsATeam', async () => {
  const lookup = createGitHubOwnerLookup({
    token: 't',
    fetch: async (url) =>
      String(url).includes('/contents/')
        ? codeowners('/package.json @acme/team')
        : new Response(JSON.stringify([{ author: { login: 'luis' } }]), { status: 200 }),
  })
  assert.equal(await lookup.ownerFor('acme/api', 'package.json'), '@luis')
})

test('shouldUseOnlyTheFirstExistingCodeownersFile', async () => {
  const lookup = createGitHubOwnerLookup({
    token: 't',
    fetch: async (url) => {
      const path = String(url)
      if (path.endsWith('/contents/.github/CODEOWNERS')) return codeowners('/web/** @ana')
      if (path.endsWith('/contents/CODEOWNERS')) return codeowners('/package.json @luis')
      return new Response(JSON.stringify([]), { status: 200 })
    },
  })
  assert.equal(await lookup.ownerFor('acme/api', 'package.json'), null)
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
