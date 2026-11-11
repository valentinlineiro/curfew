import type { Alert } from '../../domain/alert.ts'
import type { AlertSource } from '../../ports.ts'
import type { Fetcher } from './fetcher.ts'

const DEFAULT_API = 'https://api.github.com'

type GitHubAlert = {
  number: number
  state: string
  created_at: string
  dependency: { package: { name: string }; manifest_path: string }
  security_advisory: { severity: Alert['severity']; published_at?: string }
  security_vulnerability: { first_patched_version: unknown | null }
}

export function createGitHubAlertSource(opts: { token: string; apiUrl?: string; fetch?: Fetcher }): AlertSource {
  const apiUrl = opts.apiUrl ?? DEFAULT_API
  const request = opts.fetch ?? ((url, init) => fetch(url, init))

  return {
    async listOpenAlerts(repo) {
      const alerts: Alert[] = []
      let url: string | null = `${apiUrl}/repos/${repo}/dependabot/alerts?state=open&per_page=100`

      while (url) {
        const response = await request(url, {
          headers: {
            authorization: `Bearer ${opts.token}`,
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2022-11-28',
          },
        })
        // Dependabot off or no permission: no alerts, never a failed gate.
        if (response.status === 403 || response.status === 404) return alerts
        if (!response.ok) throw new Error(`github alerts responded ${response.status}`)

        const page = (await response.json()) as GitHubAlert[]
        alerts.push(...page.map((raw) => toAlert(repo, raw)))
        url = nextLink(response.headers.get('link'))
      }

      return alerts
    },
  }
}

function toAlert(repo: string, raw: GitHubAlert): Alert {
  return {
    id: raw.number,
    repo,
    packageName: raw.dependency.package.name,
    manifestPath: raw.dependency.manifest_path,
    severity: raw.security_advisory.severity,
    publishedAt: new Date(raw.security_advisory.published_at ?? raw.created_at),
    state: raw.state === 'dismissed' ? 'dismissed' : 'open',
    fixAvailable: raw.security_vulnerability.first_patched_version != null,
  }
}

function nextLink(header: string | null): string | null {
  if (!header) return null
  const match = header.match(/<([^>]+)>;\s*rel="next"/)
  return match ? match[1] : null
}
