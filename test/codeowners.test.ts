import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCodeowners, ownerForPath } from '../src/application/codeowners.ts'

test('shouldIgnoreCommentsAndBlankLines', () => {
  assert.deepEqual(parseCodeowners('# owners\n\n*.json @ana\n'), [{ pattern: '*.json', owner: '@ana' }])
})

test('shouldReturnLastMatchingRule', () => {
  const rules = parseCodeowners('* @ana\n/package.json @luis')
  assert.equal(ownerForPath('package.json', rules), '@luis')
})

test('shouldMatchNestedPathsWithDoubleStar', () => {
  const rules = parseCodeowners('/services/** @ana')
  assert.equal(ownerForPath('services/api/package.json', rules), '@ana')
})

test('shouldPickFirstUserOwnerWhenRuleListsATeamFirst', () => {
  const rules = parseCodeowners('/package.json @acme/team @ana')
  assert.equal(ownerForPath('package.json', rules), '@ana')
})

test('shouldReturnNullWhenNoRuleMatches', () => {
  const rules = parseCodeowners('/web/** @ana')
  assert.equal(ownerForPath('services/api/package.json', rules), null)
})
