# Cloudflare Workers Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Cloudflare Workers runtime while preserving Curfew's local Node server and shared evaluation behavior.

**Architecture:** Extract GitHub App wiring into a processor factory. Keep `server.ts` as the Node adapter and add a Fetch Worker adapter using `ctx.waitUntil()`.

**Tech Stack:** Node.js 24, TypeScript, Cloudflare Workers, Wrangler 4, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-13-cloudflare-workers-design.md`

## Global Constraints
- Preserve domain, application, adapter, SLA, attribution, and check behavior.
- Keep the local Node server.
- Verify signatures over raw bytes and reject bodies over 1,048,576 bytes.
- Never commit credentials.
- Document the 30-second post-response `waitUntil()` ceiling.

## Review Focus
- Missing secrets must fail before evaluation.
- Invalid signatures must never schedule work.
- Oversized requests must be rejected without parsing.
- Bot and fork PRs retain passing skip checks.
- Background failures must not become unhandled promise rejections.

---

### Task 1: Shared processor
**Files:** create `src/delivery/processor.ts`; modify `src/delivery/server.ts`.
- [ ] Extract App auth, adapters, policy, PR processing, and skip-check publication.
- [ ] Preserve Node route behavior and existing tests.
- [ ] Run `npm test` and `npm run typecheck`.

### Task 2: Worker adapter
**Files:** create `src/delivery/worker.ts`; create `test/worker.test.ts`.
- [ ] Test health, invalid signature, valid PR scheduling, and 1 MiB limit.
- [ ] Implement bounded stream reads, HMAC verification, payload parsing, and `ctx.waitUntil()`.
- [ ] Run `npm test` and `npm run typecheck`.

### Task 3: Wrangler and delivery pipeline
**Files:** create `wrangler.jsonc`; create `.github/workflows/deploy.yml`; modify `.github/workflows/test.yml` and `README.md`.
- [ ] Add Worker entrypoint and compatibility date 2026-11-13.
- [ ] Add Wrangler dry-run bundling to CI.
- [ ] Deploy only after successful `main` push CI and when `CLOUDFLARE_AUTO_DEPLOY=true`.
- [ ] Document Worker secrets, webhook URL, deployment, and 30-second limit.
- [ ] Verify GitHub Actions test and Worker build runs.
