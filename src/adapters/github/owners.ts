import { parseCodeowners, ownerForPath } from '../../application/codeowners.ts'
import type { OwnerLookup } from '../../ports.ts'
import type { Fetcher } from './fetcher.ts'

const DEFAULT_API = 'https://api.github.com'
const CODEOWNERS_PATHS = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']

export function createGitHubOwnerLookup(opts: { token: string; apiUrl?: string; fetch?: Fetcher }): OwnerLookup {
  const apiUrl = opts.apiUrl ?? DEFAULT_API
  const request = opts.fetch ?? ((url, init) => fetch(url, init))
  const headers = {
    authorization: `Bearer ${opts.token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  }

  return {
    // A missing owner never blocks a merge, so every failure resolves to null.
    async ownerFor(repo, manifestPath) {
      try {
        for (const path of CODEOWNERS_PATHS) {
          const response = await request(`${apiUrl}/repos/${repo}/contents/${path}`, { headers })
          if (!response.ok) continue
          const { content } = (await response.json()) as { content: string }
          const rules = parseCodeowners(Buffer.from(content, 'base64').toString('utf8'))
          const owner = ownerForPath(manifestPath, rules)
          if (owner) return owner
        }

        const response = await request(
          `${apiUrl}/repos/${repo}/commits?path=${encodeURIComponent(manifestPath)}&per_page=1`,
          { headers },
        )
        if (!response.ok) return null
        const [last] = (await response.json()) as { author?: { login?: string } }[]
        return last?.author?.login ? `@${last.author.login}` : null
      } catch {
        return null
      }
    },
  }
}
