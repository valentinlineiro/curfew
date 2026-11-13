# Curfew

> **Curfew doesn't detect vulnerabilities. It makes sure dependency debt has an owner and a deadline.**

Vulnerabilities do not linger because engineering teams lack detection tools; they linger because nobody has clear ownership and a deadline to resolve them.

Curfew connects GitHub Dependabot alerts to the people responsible for fixing them. Every pull request becomes an opportunity to enforce dependency hygiene:

- **Ownership through CODEOWNERS** (direct user and team attribution).
- **Deadlines based on vulnerability severity** (with an installation floor).
- **Automated GitHub Checks** on pull requests.
- **Optional merge enforcement** through branch protection.

> *Detect it. Assign it. Set a deadline. Enforce it.*

---

## Six Engineering Use Cases

1. **The developer with overdue alerts**  
   A developer opens a pull request. Curfew detects they own a critical Dependabot alert that exceeds its 7-day SLA.  
   *Value:* Dependency debt stops being invisible—it is attributed to a person and tied to a deadline on the merge path.

2. **A team sharing component responsibility**  
   `CODEOWNERS` assigns a manifest to `@org/backend`. If the PR author belongs to that team, Curfew attributes the team's debt to them.  
   *Value:* Collective responsibility becomes an automated, verifiable rule rather than an informal convention.

3. **Maintaining hygiene across feature delivery**  
   A pull request is well-engineered and all unit tests pass, but its author has overdue vulnerabilities in that repo.  
   *Value:* Adds a security hygiene dimension to standard code review without adding reviewer cognitive load.

4. **An organization needing to know who should act**  
   A repository has dozens of manifests and multiple teams. `CODEOWNERS` maps alerts to owners.  
   *Value:* Eliminates ambiguity between detecting a vulnerability and knowing who is responsible for resolving it.

5. **Security policy embedded into merge rules**  
   The team configures `curfew` as a Required Status Check in GitHub Branch Protection.  
   *Value:* Security policy shifts from an advisory suggestion to an automated condition for code integration.

6. **Gradual, low-friction adoption**  
   The team installs Curfew in informative mode first (evaluate without blocking), monitors checks, and decides later whether to require it for merge.  
   *Value:* Progressive adoption without unexpected delivery blockages or developer friction.

---

## The Three-Act Demonstration (`curfew-lab`)

Curfew's behavior is verified against real GitHub APIs in [`valentinlineiro/curfew-lab`](https://github.com/valentinlineiro/curfew-lab) with `curfew` configured as a Required Status Check on `main`:

| Act | Scenario | Condition | Check Output | PR Merge State | Live Run |
|---|---|---|---|---|---|
| **A** | **Within Curfew** | No overdue alerts (within install floor) | `SUCCESS`<br>`Within curfew` | `CLEAN`<br>✅ Ready to merge | [Run 131903750005](https://github.com/valentinlineiro/curfew-lab/runs/131903750005) |
| **B** | **The Value Moment** | High/Critical alert exceeds SLA (+31d) | `FAILURE`<br>`3 overdue alerts` | `BLOCKED`<br>🔒 **Merge blocked** | [Run 131903790192](https://github.com/valentinlineiro/curfew-lab/runs/131903790192) |
| **C** | **Reactive Unblock** | Dependency patched & PR synchronized | `SUCCESS`<br>`Within curfew` | `CLEAN`<br>✅ Merge unblocked | [Run 131903827879](https://github.com/valentinlineiro/curfew-lab/runs/131903827879) |

To reproduce the sequence in one command:

```bash
node --env-file=.env scripts/curfew-lab-demo.mjs all
```

> **Why Act B matters:** Passing checks show operational correctness; a blocked merge path is what demonstrates commercial value. When `curfew` is a required status check, GitHub explicitly blocks merging until the owner addresses the debt.

---

## How It Works

1. **Reads open Dependabot alerts** for the repository.
2. **Attributes each alert** to the owner of its manifest: `.github/CODEOWNERS` (first valid owner, supporting `@username` and `@org/team-slug`), falling back to the last commit author. When an alert belongs to a team, any PR author who is an active member in GitHub inherits the debt.
3. **Applies an SLA to each severity**, starting at `published_at` but *never before Curfew was installed* (install floor prevents legacy debt from blocking day-one PRs).
4. **Publishes the `curfew` check** on the pull request. It fails *only* when the PR author owns overdue debt.

---

## Core Rules

- **No owner → no block.** Unowned debt is not actionable.
- **No patched version → no block.** Unfixable vulnerabilities do not penalize developers.
- **Collective responsibility & fail open.** Team alerts apply to authors belonging to that team (`members: read`). Any verification uncertainty (403, 5xx, timeout, network error) fails open without blocking the PR.
- **Fail open on evaluator errors.** Any unhandled evaluation error publishes a passing check with an explicit warning.

---

## Policy

Defaults:

```
critical 7 days · high 30 · medium 90 · low exempt
```

Override with `CURFEW_POLICY`:

```json
{ "critical": 3, "high": 14, "medium": 60, "low": null }
```

---

## Setup

1. **Create a GitHub App** (Settings → Developer settings → GitHub Apps):
   - Webhook URL: `https://<your-host>/webhook`
   - Permissions:
     - `checks: write`
     - `dependabot alerts: read` (in app manifest: `vulnerability_alerts`)
     - `contents: read`
     - `members: read`
     - `pull requests: read`
   - Subscribe to: `pull_request`
2. **Install it** on target repositories.
3. **Configure environment:** Copy `.env.example` to `.env` and fill in `CURFEW_APP_ID`, `CURFEW_PRIVATE_KEY` and `CURFEW_WEBHOOK_SECRET`.
4. **Run locally:**

   ```bash
   npm install
   node --env-file=.env src/delivery/server.ts
   ```

5. **(Optional) Enforce in Branch Protection:** Add `curfew` as a required status check in repository branch protection settings.

---

## Production on Cloudflare Workers

Curfew includes a native Cloudflare Worker adapter sharing the same evaluation engine:

1. Authenticate Wrangler: `npx wrangler login`.
2. Set Worker secrets:

   ```bash
   npx wrangler secret put CURFEW_APP_ID
   npx wrangler secret put CURFEW_PRIVATE_KEY
   npx wrangler secret put CURFEW_WEBHOOK_SECRET
   ```

3. Deploy: `npx wrangler deploy`.
4. Point the GitHub App webhook URL to `https://<worker-host>/webhook`.

### Background Processing

The Worker acknowledges webhooks with HTTP 202 and processes evaluations via `ctx.waitUntil()` (up to 30 seconds).

---

## Empirical Evidence

Tested live against real GitHub events in `curfew-lab` and our production pilot repository:

| Scenario | Condition | Expected Result | Observed |
|---|---|---|---|
| Installation-time floor | Day 0 alerts | Pass | Pass ([Run 131903750005](https://github.com/valentinlineiro/curfew-lab/runs/131903750005)) |
| High-severity overdue SLA | Expired SLA (+31d) | Fail (Merge blocked) | Fail ([Run 131903790192](https://github.com/valentinlineiro/curfew-lab/runs/131903790192)) |
| Resolved debt | Patched dependency | Pass (Merge restored) | Pass ([Run 131903827879](https://github.com/valentinlineiro/curfew-lab/runs/131903827879)) |
| Bot pull request | `dependabot[bot]` | Excluded, pass | Pass ([Run 130476866952](https://github.com/valentinlineiro/curfew-lab/runs/130476866952)) |
| Fork pull request | External contributor | Excluded, pass | Pass ([Run 130478981450](https://github.com/valentinlineiro/curfew-lab/runs/130478981450)) |

*Live pilot observation (Meridian):* Evaluated and published checks in **~1.2 – 2.0 seconds** on Cloudflare Workers edge runtime.

---

## Known Limitations

- **Concurrent evaluations for the same commit:** Two webhooks for the same head SHA can finish out of order; the later one wins.
- **CODEOWNERS globs:** Supports `*`, `**`, `?` and leading-`/` anchors; negation (`!`) and escaped spaces are not supported.
- **Serverless execution window:** `ctx.waitUntil()` is limited to 30 seconds after the response.
- **At-least-once delivery:** Webhook retries can cause repeated evaluations.

---

## Development

```bash
npm test          # node --test (91 unit tests)
npm run typecheck # tsc --noEmit
```
