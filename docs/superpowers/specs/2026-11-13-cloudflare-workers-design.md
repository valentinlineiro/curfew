# Curfew on Cloudflare Workers — design

## Intent
Run Curfew without a permanently managed Node server while retaining the local Node runtime.

## Goals
- Expose `GET /health` and `POST /webhook` through a Cloudflare Worker.
- Reuse the same GitHub App processor, adapters, domain, and application logic.
- Verify HMAC signatures over raw request bytes and preserve the 1 MiB body limit.
- Acknowledge accepted webhooks with HTTP 202 and schedule evaluation with `ctx.waitUntil()`.
- Keep credentials in Cloudflare Worker secrets.
- Build in CI and deploy only after successful main-branch CI.

## Non-goals
- No change to SLA, attribution, CODEOWNERS, or check semantics.
- No database, queue, dashboard, or removal of the local Node server.

## Approaches
1. **Node HTTP server adapter:** rejected because the detached processing path has no direct access to Worker execution context.
2. **Native Fetch entrypoint plus shared processor factory:** selected; it shares business logic, exposes `ctx.waitUntil()`, and preserves local Node execution.
3. **Cloudflare Queues immediately:** deferred; durable delivery and retries introduce a resource and at-least-once/idempotency concerns. Revisit if workloads approach the `waitUntil()` window.

## Runtime behavior
The Worker validates method, route, request size, HMAC, and JSON; evaluates human same-repository PRs; and retains passing skip checks for bots and forks. It returns 202 and registers the work with `ctx.waitUntil()`. Cloudflare limits post-response work to 30 seconds, so this is not durable queue delivery.

## Operations
Secrets: `CURFEW_APP_ID`, `CURFEW_PRIVATE_KEY`, `CURFEW_WEBHOOK_SECRET`; optional `CURFEW_POLICY`. Compatibility date: 2026-11-13. Deployment is gated on successful CI and explicit repository configuration.

## Acceptance
Existing Node tests remain green; Worker routes, signatures, size limit, acknowledgement, and waitUntil behavior have tests; Wrangler dry-run bundles in CI; README documents secrets, webhook URL, deployment, and the waitUntil ceiling.
