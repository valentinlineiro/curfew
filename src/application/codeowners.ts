import { parseOwner, type Owner } from '../domain/owner.ts'

export type CodeownersRule = { pattern: string; owner: Owner }

export function parseCodeowners(text: string): CodeownersRule[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/)
      let validOwner: Owner | null = null
      for (const token of owners) {
        const parsed = parseOwner(token)
        if (parsed) {
          validOwner = parsed
          break
        }
      }
      return validOwner ? { pattern, owner: validOwner } : null
    })
    .filter((rule): rule is CodeownersRule => rule !== null)
}

// shortcut: no `!` negation, no escaped spaces; last matching rule wins as on GitHub.
export function ownerForPath(path: string, rules: CodeownersRule[]): Owner | null {
  let owner: Owner | null = null
  for (const rule of rules) {
    if (matches(rule.pattern, path)) owner = rule.owner
  }
  return owner
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.startsWith('/') || pattern.includes('/')
  const body = pattern.replace(/^\//, '')
  let source = ''
  for (let i = 0; i < body.length; i++) {
    const char = body[i]
    if (char === '*' && body[i + 1] === '*') {
      source += '.*'
      i++
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`${anchored ? '^' : '(^|.*/)'}${source}$`).test(path)
}
