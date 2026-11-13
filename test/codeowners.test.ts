import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCodeowners, ownerForPath } from '../src/application/codeowners.ts'

test('shouldIgnoreCommentsAndBlankLines', () => {
  assert.deepEqual(parseCodeowners('# owners\n\n*.json @ana\n'), [
    { pattern: '*.json', owner: { kind: 'user', login: 'ana' } },
  ])
})

test('shouldReturnLastMatchingRule', () => {
  const rules = parseCodeowners('* @ana\n/package.json @luis')
  assert.deepEqual(ownerForPath('package.json', rules), { kind: 'user', login: 'luis' })
})

test('shouldMatchNestedPathsWithDoubleStar', () => {
  const rules = parseCodeowners('/services/** @ana')
  assert.deepEqual(ownerForPath('services/api/package.json', rules), { kind: 'user', login: 'ana' })
})

test('shouldPickFirstValidOwnerEvenWhenTeam', () => {
  const rules = parseCodeowners('/package.json @acme/team @ana')
  assert.deepEqual(ownerForPath('package.json', rules), {
    kind: 'team',
    org: 'acme',
    teamSlug: 'team',
  })
})

test('shouldSkipInvalidHandlesLikeEmailsAndPickNextValidOwner', () => {
  const rules = parseCodeowners('/package.json user@example.com @acme/frontend')
  assert.deepEqual(ownerForPath('package.json', rules), {
    kind: 'team',
    org: 'acme',
    teamSlug: 'frontend',
  })
})

test('shouldIgnoreRuleWhenNoOwnerIsValid', () => {
  assert.deepEqual(parseCodeowners('/package.json user@example.com @'), [])
})

test('shouldReturnNullWhenNoRuleMatches', () => {
  const rules = parseCodeowners('/web/** @ana')
  assert.equal(ownerForPath('services/api/package.json', rules), null)
})
