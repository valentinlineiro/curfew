import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOwner, formatOwner } from '../src/domain/owner.ts'

test('shouldParseValidUserOwnerWithOrWithoutAtPrefix', () => {
  assert.deepEqual(parseOwner('@alice'), { kind: 'user', login: 'alice' })
  assert.deepEqual(parseOwner('alice'), { kind: 'user', login: 'alice' })
})

test('shouldNormalizeLoginsAndSlugsToLowerCase', () => {
  assert.deepEqual(parseOwner('@Alice'), { kind: 'user', login: 'alice' })
  assert.deepEqual(parseOwner('@Acme/Frontend-Team'), {
    kind: 'team',
    org: 'acme',
    teamSlug: 'frontend-team',
  })
})

test('shouldParseValidTeamOwnerWithOrWithoutAtPrefix', () => {
  assert.deepEqual(parseOwner('@acme/frontend-team'), {
    kind: 'team',
    org: 'acme',
    teamSlug: 'frontend-team',
  })
  assert.deepEqual(parseOwner('acme/core'), {
    kind: 'team',
    org: 'acme',
    teamSlug: 'core',
  })
})

test('shouldRejectEmailAddresses', () => {
  assert.equal(parseOwner('user@example.com'), null)
  assert.equal(parseOwner('alice@corp.io'), null)
})

test('shouldRejectMalformedOrIncompleteHandles', () => {
  assert.equal(parseOwner(''), null)
  assert.equal(parseOwner('@'), null)
  assert.equal(parseOwner('@acme/'), null)
  assert.equal(parseOwner('/core'), null)
  assert.equal(parseOwner('@acme/frontend/extra'), null)
  assert.equal(parseOwner('acme/team slug'), null)
  assert.equal(parseOwner('@team!'), null)
})

test('shouldFormatOwnersCanonically', () => {
  assert.equal(formatOwner({ kind: 'user', login: 'alice' }), '@alice')
  assert.equal(formatOwner({ kind: 'team', org: 'acme', teamSlug: 'frontend-team' }), '@acme/frontend-team')
})
