import type { TeamMembership, MembershipResult } from '../../ports.ts'
import type { Fetcher } from './fetcher.ts'

const DEFAULT_API = 'https://api.github.com'

export function createGitHubTeamMembership(opts: {
  token: string
  apiUrl?: string
  fetch?: Fetcher
}): TeamMembership {
  const apiUrl = opts.apiUrl ?? DEFAULT_API
  const request = opts.fetch ?? ((url, init) => fetch(url, init))
  const headers = {
    authorization: `Bearer ${opts.token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'curfew',
  }

  return {
    async checkMembership(org, teamSlug, username): Promise<MembershipResult> {
      const url = `${apiUrl}/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`
      try {
        const response = await request(url, {
          headers,
          signal: AbortSignal.timeout(10_000),
        })

        if (response.status === 200) {
          try {
            const data = (await response.json()) as { state?: string }
            if (data.state === 'active') return { status: 'MEMBER' }
            if (data.state === 'pending') return { status: 'NOT_MEMBER' }
            return { status: 'UNKNOWN', reason: 'UNEXPECTED_ERROR' }
          } catch {
            return { status: 'UNKNOWN', reason: 'UNEXPECTED_ERROR' }
          }
        }

        if (response.status === 404) {
          return { status: 'NOT_MEMBER' }
        }

        if (response.status === 403) {
          if (response.headers.get('x-ratelimit-remaining') === '0') {
            return { status: 'UNKNOWN', reason: 'RATE_LIMITED' }
          }
          return { status: 'UNKNOWN', reason: 'FORBIDDEN' }
        }

        if (response.status === 429) {
          return { status: 'UNKNOWN', reason: 'RATE_LIMITED' }
        }

        if (response.status >= 500) {
          return { status: 'UNKNOWN', reason: 'SERVER_ERROR' }
        }

        return { status: 'UNKNOWN', reason: 'UNEXPECTED_ERROR' }
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'TimeoutError' || error.name === 'AbortError')
        ) {
          return { status: 'UNKNOWN', reason: 'TIMEOUT' }
        }
        if (error instanceof TypeError) {
          return { status: 'UNKNOWN', reason: 'NETWORK_ERROR' }
        }
        return { status: 'UNKNOWN', reason: 'UNEXPECTED_ERROR' }
      }
    },
  }
}
