import type { CheckPublisher } from '../../ports.ts'
import type { Fetcher } from './fetcher.ts'

const DEFAULT_API = 'https://api.github.com'

export function createGitHubCheckPublisher(opts: { token: string; apiUrl?: string; fetch?: Fetcher }): CheckPublisher {
  const apiUrl = opts.apiUrl ?? DEFAULT_API
  const request = opts.fetch ?? ((url, init) => fetch(url, init))

  return {
    async publish({ repo, headSha, result }) {
      const response = await request(`${apiUrl}/repos/${repo}/check-runs`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opts.token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'curfew',
          head_sha: headSha,
          status: 'completed',
          conclusion: result.conclusion,
          output: { title: result.title, summary: result.summary },
        }),
      })
      if (!response.ok) throw new Error(`github check-runs responded ${response.status}`)
    },
  }
}
