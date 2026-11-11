export type CodeownersRule = { pattern: string; owner: string }

export function parseCodeowners(text: string): CodeownersRule[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/)
      // A rule may list several owners; a team cannot author a PR, so attribute to the first user.
      return { pattern, owner: owners.find((owner) => !owner.includes('/')) ?? owners[0] }
    })
    .filter((rule) => Boolean(rule.owner))
}

// shortcut: no `!` negation, no escaped spaces; last matching rule wins as on GitHub.
export function ownerForPath(path: string, rules: CodeownersRule[]): string | null {
  let owner: string | null = null
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
