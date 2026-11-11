import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { verifySignature, parsePullRequestJob } from '../src/delivery/webhook.ts'

const body = Buffer.from('{"zen":"x"}')
const sign = (s: string) => 'sha256=' + createHmac('sha256', s).update(body).digest('hex')

test('shouldAcceptWhenSignatureMatches', () => {
  assert.equal(verifySignature('secret', body, sign('secret')), true)
})

test('shouldRejectWhenSignatureDoesNotMatch', () => {
  assert.equal(verifySignature('secret', body, 'sha256=deadbeef'), false)
})

test('shouldRejectWhenSignatureIsMissing', () => {
  assert.equal(verifySignature('secret', body, undefined), false)
})

test('shouldIgnoreNonPullRequestEvents', () => {
  assert.equal(parsePullRequestJob('push', {}), null)
})

test('shouldIgnorePullRequestFromFork', () => {
  const payload = {
    action: 'opened',
    repository: { full_name: 'acme/api' },
    installation: { id: 42 },
    pull_request: { head: { sha: 'abc', repo: { full_name: 'fork/api' } }, user: { login: 'ana' } },
  }
  assert.equal(parsePullRequestJob('pull_request', payload), null)
})

test('shouldIgnoreBotPullRequests', () => {
  const payload = {
    action: 'opened',
    repository: { full_name: 'acme/api' },
    installation: { id: 42 },
    pull_request: { head: { sha: 'abc', repo: { full_name: 'acme/api' } }, user: { login: 'renovate[bot]' } },
  }
  assert.equal(parsePullRequestJob('pull_request', payload), null)
})

test('shouldReturnJobWhenPullRequestIsFromSameRepo', () => {
  const payload = {
    action: 'synchronize',
    repository: { full_name: 'acme/api' },
    installation: { id: 42 },
    pull_request: { head: { sha: 'abc', repo: { full_name: 'acme/api' } }, user: { login: 'ana' } },
  }
  assert.deepEqual(parsePullRequestJob('pull_request', payload), {
    repo: 'acme/api',
    headSha: 'abc',
    author: 'ana',
    installationId: 42,
  })
})
