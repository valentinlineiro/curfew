# Curfew

Fails a pull request's status check when its author owns overdue Dependabot alerts in that repository.

Ignoring a dependency alert is free today. Curfew puts a price on it: the merge path.

## What it does

- Reads open Dependabot alerts for the repository.
- Attributes each alert to the owner of its manifest: CODEOWNERS, then the last commit author of that file.

Attribution follows GitHub's rules where they are simple: only the **first** CODEOWNERS file found is used (`.github/CODEOWNERS`, then root, then `docs/`); when a rule lists several owners, the first syntactically valid owner is used. Both user owners (`@username`) and team owners (`@org/team-slug`) are supported. If a manifest has no matching rule or no CODEOWNERS file exists, Curfew falls back to the last commit author. When an alert belongs to a team, any PR author who is an active member of that team in GitHub inherits the debt. Supported globs are `*`, `**`, `?` and leading-`/` anchors; `!` negation and escaped spaces are not supported.
- Applies an SLA to each severity, starting at `published_at` but never before Curfew was installed.
- Publishes the `curfew` check on the pull request. It fails when the **PR author** owns overdue debt (directly or via team membership).

No owner, no fixable version, or a dismissed alert means no debt.

## Rules

- **No owner → no block.** Unowned debt is not actionable.
- **No patched version → no block.**
- **Collective responsibility & fail open.** Team alerts apply to authors belonging to that team (`members: read`). Any verification uncertainty (403, 5xx, timeout, network error) fails open without blocking the PR.
- **Fail open on evaluator errors.** Any unhandled evaluation error publishes a passing check with a warning. A failure to publish the check propagates to the delivery runtime.

## Setup

1. Create a GitHub App (Settings → Developer settings → GitHub Apps).
   - Webhook URL: `https://<your-host>/webhook` (GitHub delivers webhooks over HTTPS only; terminate TLS in front of Curfew)
   - Permissions: `checks: write`, `dependabot alerts: read`, `contents: read`, `members: read`, `pull requests: read` (in an app manifest the Dependabot alerts permission is spelled `vulnerability_alerts`)
   - Subscribe to: `pull_request`
2. Install it on the repositories you want covered.
   - Private repos: Dependabot alerts must be enabled for the organization and the app must be allowed to read them. Without access the alerts API returns 403 and Curfew publishes a passing check warning that it could not evaluate.
3. Copy `.env.example` to `.env` and fill in the app id, private key and webhook secret.
4. Run it:

   ```bash
   npm install
   node --env-file=.env src/delivery/server.ts
   ```

5. In each repository's branch protection, add `curfew` as a required status check.

## Production on Cloudflare Workers

Curfew has two delivery adapters: the local Node HTTP server and a native Cloudflare Worker. Both use the same GitHub App processor and evaluation logic.

1. Authenticate Wrangler with `npx wrangler login`.
2. Add the GitHub App credentials as Worker secrets:

   ```bash
   npx wrangler secret put CURFEW_APP_ID
   npx wrangler secret put CURFEW_PRIVATE_KEY
   npx wrangler secret put CURFEW_WEBHOOK_SECRET
   ```

   Set `CURFEW_POLICY` as a Worker variable only if you need to override the defaults.
3. Deploy with `npx wrangler deploy`.
4. Set the GitHub App webhook URL to `https://<worker-host>/webhook`, using the HTTPS `workers.dev` URL printed by Wrangler.

The Worker exposes `GET /health` and `POST /webhook`. Its request body limit and HMAC signature validation match the Node adapter.

### Automatic deployment

The deployment workflow runs after the `test` workflow succeeds on a push to `main`. Configure GitHub repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit) and `CLOUDFLARE_ACCOUNT_ID`, then set repository variable `CLOUDFLARE_AUTO_DEPLOY` to `true`. Manual deployment is also available through the `deploy` workflow on `main`.

### Background processing limitation

The Worker acknowledges a valid webhook with HTTP 202 and schedules evaluation through `ctx.waitUntil()`. Cloudflare allows that work to continue for up to 30 seconds after the response; work that exceeds this window can be cancelled. This is not durable queue delivery. If real workloads approach that limit, the next step is Cloudflare Queues with retry and idempotency handling.

## Policy

Defaults:

```
critical 7 days · high 30 · medium 90 · low exempt
```

Override with `CURFEW_POLICY`:

```json
{ "critical": 3, "high": 14, "medium": 60, "low": null }
```

## Validation

Curfew has been exercised against real GitHub webhooks and Dependabot alerts in a dedicated lab repository:

| Scenario | Expected result | Observed |
|---|---|---|
| Installation-time floor, before SLA expiry | Pass | Pass |
| High-severity alerts after the SLA window | Fail | Fail |
| Overdue alerts resolved or dismissed | Pass | Pass |
| Bot-authored pull request | Excluded, pass | Pass |
| Human-authored pull request from a fork | Excluded, pass | Pass |

The fork exclusion was verified organically with [lab PR #3](https://github.com/valentinlineiro/curfew-lab/pull/3) and its [Curfew check run](https://github.com/valentinlineiro/curfew-lab/runs/130478981450). The bot exclusion was verified with [lab PR #2](https://github.com/valentinlineiro/curfew-lab/pull/2).

A first production pilot event in Meridian published its check about 1.2 seconds after webhook delivery. This is an initial observation, not a latency benchmark.

## Known limitations

- **Concurrent evaluations for the same commit.** Two webhooks for the same head SHA can finish out of order, and the later one wins. Alerts, manifest ownership and the evaluation clock may differ between the two runs.
- **Owner lookup failures look like "no owner".** A transient GitHub error while reading CODEOWNERS or the last commit makes Curfew skip that alert rather than publish a warning.
- **CODEOWNERS globs are approximated.** `*`, `**`, `?` and leading-`/` anchors are supported; `!` negation and escaped spaces are not.
- **No durable queue.** The Node runtime acknowledges before processing, and the Worker uses `ctx.waitUntil()`, which is limited to 30 seconds after the response. An interrupted background task can be lost.
- **At-least-once delivery is not deduplicated.** GitHub retries can cause repeated evaluation and check publication.

## Development

```bash
npm test          # node --test
npm run typecheck # tsc --noEmit
```

Node 24+ runs the TypeScript directly; there is no build step.
