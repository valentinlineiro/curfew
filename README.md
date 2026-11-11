# Curfew

Fails a pull request's status check when its author owns overdue Dependabot alerts in that repository.

Ignoring a dependency alert is free today. Curfew puts a price on it: the merge path.

## What it does

- Reads open Dependabot alerts for the repository.
- Attributes each alert to the owner of its manifest: CODEOWNERS, then the last commit author of that file.
- Applies an SLA to each severity, starting at `published_at` but never before Curfew was installed.
- Publishes the `curfew` check on the pull request. It fails only when the **PR author** owns overdue debt.

No owner, no fixable version, or a dismissed alert means no debt.

## Rules

- **No owner → no block.** Unowned debt is not actionable.
- **No patched version → no block.**
- **Fail open.** Any Curfew or GitHub error publishes a passing check with a warning.

## Setup

1. Create a GitHub App (Settings → Developer settings → GitHub Apps).
   - Webhook URL: `https://<your-host>/webhook` (GitHub delivers webhooks over HTTPS only; terminate TLS in front of Curfew)
   - Permissions: `checks: write`, `dependabot alerts: read`, `contents: read`, `members: read`
   - Subscribe to: `pull_request`
2. Install it on the repositories you want covered.
   - Private repos: Dependabot alerts must be enabled for the organization and the app must be allowed to read them. Without access the alerts API returns 403 and Curfew stays green by design.
3. Copy `.env.example` to `.env` and fill in the app id, private key and webhook secret.
4. Run it:

   ```bash
   npm install
   node --env-file=.env src/delivery/server.ts
   ```

5. In each repository's branch protection, add `curfew` as a required status check.

## Policy

Defaults:

```
critical 7 days · high 30 · medium 90 · low exempt
```

Override with `CURFEW_POLICY`:

```json
{ "critical": 3, "high": 14, "medium": 60, "low": null }
```

## Development

```bash
npm test          # node --test
npm run typecheck # tsc --noEmit
```

Node 24+ runs the TypeScript directly; there is no build step.
