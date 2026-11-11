import type { InstallationClock } from '../../ports.ts'
import type { Fetcher } from './fetcher.ts'

const DEFAULT_API = 'https://api.github.com'

export function createGitHubInstallationClock(opts: {
  appAuth: () => Promise<string>
  apiUrl?: string
  fetch?: Fetcher
}): InstallationClock {
  const apiUrl = opts.apiUrl ?? DEFAULT_API
  const request = opts.fetch ?? ((url, init) => fetch(url, init))

  return {
    async installedAt(installationId) {
      const jwt = await opts.appAuth()
      const response = await request(`${apiUrl}/app/installations/${installationId}`, {
        headers: {
          authorization: `Bearer ${jwt}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
        },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`github installations responded ${response.status}`)
      const { created_at } = (await response.json()) as { created_at: string }
      return new Date(created_at)
    },
  }
}
