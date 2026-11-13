export type UserOwner = {
  kind: 'user'
  login: string
}

export type TeamOwner = {
  kind: 'team'
  org: string
  teamSlug: string
}

export type Owner = UserOwner | TeamOwner

const USER_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i
const SLUG_REGEX = /^[a-z0-9_.-]+$/i

export function parseOwner(handle: string): Owner | null {
  if (!handle || typeof handle !== 'string') return null
  const trimmed = handle.trim()
  if (!trimmed || /\s/.test(trimmed)) return null

  let raw = trimmed
  if (raw.startsWith('@')) {
    raw = raw.slice(1)
  }
  if (!raw || raw.includes('@')) {
    return null
  }

  const parts = raw.split('/')
  if (parts.length === 1) {
    const login = parts[0].toLowerCase()
    if (!USER_REGEX.test(login)) return null
    return { kind: 'user', login }
  }

  if (parts.length === 2) {
    const [org, slug] = parts.map((p) => p.toLowerCase())
    if (!org || !slug) return null
    if (!USER_REGEX.test(org) || !SLUG_REGEX.test(slug)) return null
    return { kind: 'team', org, teamSlug: slug }
  }

  return null
}

export function formatOwner(owner: Owner): string {
  switch (owner.kind) {
    case 'user':
      return `@${owner.login}`
    case 'team':
      return `@${owner.org}/${owner.teamSlug}`
  }
}
