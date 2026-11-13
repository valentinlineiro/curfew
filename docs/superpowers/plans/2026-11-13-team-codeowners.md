# Team CODEOWNERS & GitHub Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Curfew to support team owners (`@org/team`) in CODEOWNERS, verify PR author membership via GitHub REST API (`members: read`), and enforce collective debt during PR status check gating with fail-open resilience.

**Architecture:** Hexagonal architecture preserving strict separation between static attribution (`Owner = UserOwner | TeamOwner`) and contextual responsibility (resolved via `TeamMembership` port). `gatePullRequest` remains a pure synchronous evaluator fed by application orchestration with in-flight request coalescing and structured non-intrusive logging.

**Tech Stack:** TypeScript (Node.js 24+ native execution, `node:test`, `node:assert/strict`), GitHub REST API v2022-11-28.

## Global Constraints

- **Node.js 24+ native TS execution:** Run tests via `node --test` (or `npm test`) and typecheck via `npm run typecheck` (`tsc --noEmit`). No build step.
- **Fail-open invariant:** Verification uncertainties (`UNKNOWN` via 403, 5xx, timeout, network error) never block a PR merge path.
- **Pure gate invariant:** `gatePullRequest` is pure and synchronous; network, errors, and membership resolution must be resolved beforehand.
- **Determinism:** Preserve original order of debts in `applicableDebts`.
- **First valid owner policy:** In CODEOWNERS rules with multiple owners, Curfew strictly uses the first syntactically valid owner (`parseOwner`).

---

### Task 1: Domain Owner Model (`src/domain/owner.ts`, `src/domain/alert.ts`, `src/application/evaluateSla.ts`)

**Files:**
- Create: `src/domain/owner.ts`
- Modify: `src/domain/alert.ts:14`
- Modify: `src/application/evaluateSla.ts:1-19`
- Create: `test/owner.test.ts`
- Modify: `test/evaluateSla.test.ts:1-44`

**Interfaces:**
- Produces:
  - `UserOwner = { kind: 'user'; login: string }`
  - `TeamOwner = { kind: 'team'; org: string; teamSlug: string }`
  - `Owner = UserOwner | TeamOwner`
  - `parseOwner(handle: string): Owner | null`
  - `formatOwner(owner: Owner): string`
  - `Debt = { alert: Alert; owner: Owner; dueAt: Date }`
  - `evaluateSla(input: { alerts: Alert[]; owners: ReadonlyMap<number, Owner>; policy: Policy; now: Date; notBefore: Date }): Debt[]`

- [ ] **Step 1: Write the failing tests in `test/owner.test.ts` and update `test/evaluateSla.test.ts`**

Create `test/owner.test.ts` testing:
- Valid `UserOwner` parsing: `@alice` -> `{ kind: 'user', login: 'alice' }`, `alice` -> `{ kind: 'user', login: 'alice' }`.
- Valid `TeamOwner` parsing: `@acme/frontend-team` -> `{ kind: 'team', org: 'acme', teamSlug: 'frontend-team' }`, `acme/frontend` -> `{ kind: 'team', org: 'acme', teamSlug: 'frontend' }`.
- Invalid handles returning `null`: `user@example.com`, `@`, `@acme/`, `@acme/frontend/core`, spaces `acme/team core`, uppercase normalization to lowercase.
- Canonical formatting with `formatOwner`: `UserOwner` -> `@alice`, `TeamOwner` -> `@acme/frontend-team`.
Update `test/evaluateSla.test.ts` to pass `owners: new Map([[1, { kind: 'user', login: 'ana' }]])` and assert `debt.owner` deep equality.

- [ ] **Step 2: Run test suite to verify tests fail**

Run `node --test test/owner.test.ts` and `npm run typecheck` to confirm the missing module and type mismatches fail.

- [ ] **Step 3: Implement `src/domain/owner.ts` and update `src/domain/alert.ts` & `src/application/evaluateSla.ts`**

Write `src/domain/owner.ts` with strict regex validation for GitHub logins and org/slug identifiers. Update `Debt` in `src/domain/alert.ts` to use `Owner`. Update `evaluateSla` signature and implementation in `src/application/evaluateSla.ts` to map `Owner`.

- [ ] **Step 4: Run tests and typecheck**

Run `node --test test/owner.test.ts test/evaluateSla.test.ts` and `npm run typecheck` to confirm all tests pass.

- [ ] **Step 5: Commit changes**

Commit: `git add src/domain/owner.ts src/domain/alert.ts src/application/evaluateSla.ts test/owner.test.ts test/evaluateSla.test.ts && git commit -m "feat(domain): add Owner model and update Debt attribution"`

---

### Task 2: CODEOWNERS Parser & Static Precedence (`src/application/codeowners.ts`, `src/ports.ts`, `src/adapters/github/owners.ts`)

**Files:**
- Modify: `src/application/codeowners.ts:1-24`
- Modify: `src/ports.ts:5`
- Modify: `src/adapters/github/owners.ts:1-46`
- Modify: `test/codeowners.test.ts:1-27`
- Modify: `test/githubOwners.test.ts:1-104`

**Interfaces:**
- Consumes: `Owner`, `parseOwner`, `UserOwner`, `TeamOwner` from `src/domain/owner.ts`.
- Produces:
  - `CodeownersRule = { pattern: string; owner: Owner }`
  - `parseCodeowners(text: string): CodeownersRule[]`
  - `ownerForPath(path: string, rules: CodeownersRule[]): Owner | null`
  - `OwnerLookup.ownerFor(repo: string, manifestPath: string): Promise<Owner | null>`

- [ ] **Step 1: Write failing tests for team preservation and first-valid-owner parsing**

In `test/codeowners.test.ts`:
- Replace old `shouldPickFirstUserOwnerWhenRuleListsATeamFirst` with `shouldPickFirstValidOwnerEvenWhenTeam`: `/package.json @acme/frontend @alice` -> `{ pattern: '/package.json', owner: { kind: 'team', org: 'acme', teamSlug: 'frontend' } }`.
- Test skipping invalid handles: `/package.json user@example.com @acme/core` -> owner is `@acme/core`.
- Test precedence: later rules override earlier rules.
In `test/githubOwners.test.ts`:
- Update `shouldFallBackToCommitAuthorWhenCodeownersOwnsATeam` -> now expects `ownerFor` to return `TeamOwner` directly and NOT call commits endpoint.
- Assert return types are `Owner | null`.

- [ ] **Step 2: Run tests to confirm failures**

Run `node --test test/codeowners.test.ts test/githubOwners.test.ts` to confirm test failures against current code.

- [ ] **Step 3: Implement updated CODEOWNERS parser and GitHub Owner Lookup adapter**

In `src/application/codeowners.ts`:
- Iterate owner tokens and take the first token where `parseOwner(token) !== null`.
- Update `ownerForPath` to return `Owner | null`.
In `src/ports.ts`:
- Update `OwnerLookup.ownerFor` return type to `Promise<Owner | null>`.
In `src/adapters/github/owners.ts`:
- If `ownerForPath` returns an `Owner` (`UserOwner` or `TeamOwner`), return it immediately.
- If first existing CODEOWNERS file has no match, fall back to commit author: `{ kind: 'user', login: last.author.login }`.

- [ ] **Step 4: Run tests and typecheck**

Run `node --test test/codeowners.test.ts test/githubOwners.test.ts` and `npm run typecheck` to verify all pass.

- [ ] **Step 5: Commit changes**

Commit: `git add src/application/codeowners.ts src/ports.ts src/adapters/github/owners.ts test/codeowners.test.ts test/githubOwners.test.ts && git commit -m "feat(codeowners): preserve team owners and update OwnerLookup port"`

---

### Task 3: TeamMembership Port & GitHub REST Adapter (`src/ports.ts`, `src/adapters/github/membership.ts`)

**Files:**
- Modify: `src/ports.ts`
- Create: `src/adapters/github/membership.ts`
- Create: `test/githubMembership.test.ts`

**Interfaces:**
- Produces:
  - `MembershipFailureReason = 'FORBIDDEN' | 'RATE_LIMITED' | 'SERVER_ERROR' | 'TIMEOUT' | 'NETWORK_ERROR' | 'UNEXPECTED_ERROR'`
  - `MembershipResult = { status: 'MEMBER' } | { status: 'NOT_MEMBER' } | { status: 'UNKNOWN'; reason: MembershipFailureReason }`
  - `TeamMembership` interface with `checkMembership(org: string, teamSlug: string, username: string): Promise<MembershipResult>`
  - `createGitHubTeamMembership(opts: { token: string; apiUrl?: string; fetch?: Fetcher }): TeamMembership`

- [ ] **Step 1: Write unit tests covering HTTP status codes and transport errors in `test/githubMembership.test.ts`**

Test scenarios:
- HTTP 200 `{ state: 'active' }` -> `{ status: 'MEMBER' }`
- HTTP 200 `{ state: 'pending' }` -> `{ status: 'NOT_MEMBER' }`
- HTTP 200 with malformed JSON or unknown state -> `{ status: 'UNKNOWN', reason: 'UNEXPECTED_ERROR' }`
- HTTP 404 -> `{ status: 'NOT_MEMBER' }`
- HTTP 403 with `x-ratelimit-remaining: '0'` -> `{ status: 'UNKNOWN', reason: 'RATE_LIMITED' }`
- HTTP 403 without rate limit -> `{ status: 'UNKNOWN', reason: 'FORBIDDEN' }`
- HTTP 429 -> `{ status: 'UNKNOWN', reason: 'RATE_LIMITED' }`
- HTTP 500, 502, 503 -> `{ status: 'UNKNOWN', reason: 'SERVER_ERROR' }`
- AbortError (timeout) -> `{ status: 'UNKNOWN', reason: 'TIMEOUT' }`
- TypeError (network) -> `{ status: 'UNKNOWN', reason: 'NETWORK_ERROR' }`

- [ ] **Step 2: Run test suite to verify test failure**

Run `node --test test/githubMembership.test.ts` to confirm failure.

- [ ] **Step 3: Implement `src/adapters/github/membership.ts` and update `src/ports.ts`**

Define `MembershipFailureReason`, `MembershipResult`, and `TeamMembership` in `src/ports.ts`.
Implement `createGitHubTeamMembership` using `fetch` with `AbortSignal.timeout(10_000)`, `x-github-api-version: 2022-11-28`, and the exact response mapping.

- [ ] **Step 4: Run tests and typecheck**

Run `node --test test/githubMembership.test.ts` and `npm run typecheck` to verify 100% green.

- [ ] **Step 5: Commit changes**

Commit: `git add src/ports.ts src/adapters/github/membership.ts test/githubMembership.test.ts && git commit -m "feat(adapters): implement GitHub team membership adapter with typed failure reasons"`

---

### Task 4: Applicable Debts Resolution with Request Coalescing (`src/application/applicableDebts.ts`)

**Files:**
- Create: `src/application/applicableDebts.ts`
- Create: `test/applicableDebts.test.ts`

**Interfaces:**
- Consumes: `Debt` from `src/domain/alert.ts`, `TeamOwner` from `src/domain/owner.ts`, `TeamMembership`, `MembershipResult`, `MembershipFailureReason` from `src/ports.ts`.
- Produces:
  - `MembershipDegradation = { team: TeamOwner; reason: MembershipFailureReason }`
  - `ApplicableDebtsResult = { applicableDebts: Debt[]; degradations: MembershipDegradation[] }`
  - `resolveApplicableDebts(input: { author: string; debts: Debt[]; teamMembership: TeamMembership }): Promise<ApplicableDebtsResult>`

- [ ] **Step 1: Write test suite covering all 10 resolution scenarios in `test/applicableDebts.test.ts`**

Scenarios:
1. Matching `UserOwner` included in `applicableDebts`.
2. Non-matching `UserOwner` excluded.
3. `TeamOwner` with `MEMBER` included with original `owner` intact.
4. `TeamOwner` with `NOT_MEMBER` excluded.
5. `TeamOwner` with `UNKNOWN` excluded and 1 degradation recorded.
6. Request coalescing: 10 alerts for same team trigger exactly 1 `checkMembership` call.
7. Concurrent queries for multiple distinct teams.
8. Non-neutralization: verified user debt or team A `MEMBER` debt is included even if team B is `UNKNOWN`.
9. Deterministic order: `applicableDebts` matches original order in `debts`.
10. Fail-open on unhandled port exception: converted to `UNKNOWN / UNEXPECTED_ERROR`.

- [ ] **Step 2: Run tests to verify failure**

Run `node --test test/applicableDebts.test.ts` to confirm module absence.

- [ ] **Step 3: Implement `src/application/applicableDebts.ts`**

Normalize `author` at entry (`author.replace(/^@/, '').toLowerCase()`).
Create a local `membershipPromises = new Map<string, Promise<MembershipResult>>()`.
For each unique team key `${org}/${teamSlug}`, initiate one call wrapped with a try/catch returning `{ status: 'UNKNOWN', reason: 'UNEXPECTED_ERROR' }` on throw.
Filter `debts` in original order to assemble `applicableDebts`.
Collect unique degradations (one per team).

- [ ] **Step 4: Run tests and typecheck**

Run `node --test test/applicableDebts.test.ts` and `npm run typecheck` to verify passing.

- [ ] **Step 5: Commit changes**

Commit: `git add src/application/applicableDebts.ts test/applicableDebts.test.ts && git commit -m "feat(application): implement resolveApplicableDebts with request coalescing"`

---

### Task 5: Pure Gating & Check Formatting (`src/application/gate.ts`)

**Files:**
- Modify: `src/application/gate.ts:1-20`
- Modify: `test/gate.test.ts:1-38`

**Interfaces:**
- Consumes: `Debt` from `src/domain/alert.ts`, `formatOwner` from `src/domain/owner.ts`, `GateResult` from `src/domain/check.ts`.
- Produces: `gatePullRequest(input: { repo: string; author: string; applicableDebts: Debt[] }): GateResult`

- [ ] **Step 1: Update tests in `test/gate.test.ts` to reflect the pure input and corrected title**

Test:
- Empty `applicableDebts`: `{ conclusion: 'success', title: 'Within curfew', summary: 'No overdue dependency alerts for @ana.' }`.
- Non-empty `applicableDebts`:
  - `conclusion: 'failure'`
  - Title: `'1 overdue alert'` (singular) and `'2 overdue alerts'` (plural) — NEVER `'Curfew passed'`.
  - Summary lines formatted as `- ${packageName} (${severity}) due ${dueAt} [owner: ${formatOwner(debt.owner)}]`.

- [ ] **Step 2: Run tests to confirm failure**

Run `node --test test/gate.test.ts` to observe differences in title and input shape.

- [ ] **Step 3: Update `src/application/gate.ts`**

Update `gatePullRequest` signature to accept `applicableDebts: Debt[]`. Format lines with `[owner: ${formatOwner(debt.owner)}]`. Update failure title to `${applicableDebts.length} overdue alert${applicableDebts.length === 1 ? '' : 's'}`.

- [ ] **Step 4: Run tests and typecheck**

Run `node --test test/gate.test.ts` and `npm run typecheck`.

- [ ] **Step 5: Commit changes**

Commit: `git add src/application/gate.ts test/gate.test.ts && git commit -m "refactor(application): update gatePullRequest to receive applicableDebts and fix failure title"`

---

### Task 6: Logger Contract & Pull Request Orchestration (`src/ports.ts`, `src/delivery/handlePullRequest.ts`, `src/delivery/server.ts`)

**Files:**
- Modify: `src/ports.ts`
- Modify: `src/delivery/handlePullRequest.ts:1-48`
- Modify: `src/delivery/server.ts:1-123`
- Modify: `test/handlePullRequest.test.ts:1-63`

**Interfaces:**
- Produces:
  - `Logger` interface in `src/ports.ts`: `info`, `warn`, `error`.
  - `PullRequestDeps` updated with `teamMembership: TeamMembership` and optional `logger?: Logger`.
  - Safe error context normalization in `handlePullRequest`.
  - Separation of evaluation error (publishes fail-open success check) vs publication error (propagates/throws).

- [ ] **Step 1: Write integration tests in `test/handlePullRequest.test.ts`**

Test scenarios:
1. Author with team debts where `teamMembership` returns `MEMBER`: check fails with `1 overdue alert` and owner tag.
2. Team debts where `teamMembership` returns `NOT_MEMBER`: check passes.
3. Team debts where `teamMembership` returns `UNKNOWN`: check passes fail-open, logger records warning with context.
4. Verified user debt + degraded team debt: check fails due to verified user debt.
5. Parallel resolution of distinct manifests via `Promise.all`.
6. Evaluation error publishes fail-open check.
7. Publication error throws and is not caught by fail-open handler.

- [ ] **Step 2: Run tests to observe failures**

Run `node --test test/handlePullRequest.test.ts`.

- [ ] **Step 3: Implement `Logger` and update `handlePullRequest.ts` & `server.ts`**

Define `Logger` interface. In `handlePullRequest`:
- Normalize author once at entry (`job.author.replace(/^@/, '').toLowerCase()`).
- Resolve unique manifest owners with `Promise.all`.
- Call `resolveApplicableDebts`.
- Log degradations with safe serialization (`name`, `message`, `code`).
- Separate `gatePullRequest` evaluation error handling (publishes fail-open check) from `checks.publish` (re-throws).
In `server.ts`:
- Instantiate `createGitHubTeamMembership({ token })` and pass it into `handlePullRequest`.

- [ ] **Step 4: Run tests and typecheck**

Run `node --test test/handlePullRequest.test.ts` and `npm run typecheck`.

- [ ] **Step 5: Commit changes**

Commit: `git add src/ports.ts src/delivery/handlePullRequest.ts src/delivery/server.ts test/handlePullRequest.test.ts && git commit -m "feat(delivery): integrate team membership, safe logging, and resilient orchestration in handlePullRequest"`

---

### Task 7: Full System Verification & Regression Suite

**Files:**
- Verify: all test files in `test/`
- Run full test runner and linter

- [ ] **Step 1: Run complete test suite**

Run `npm test` (`node --test`). Verify all unit and integration tests pass without warnings or errors.

- [ ] **Step 2: Run typecheck**

Run `npm run typecheck` (`tsc --noEmit`). Ensure 0 type errors.

- [ ] **Step 3: Update README and documentation**

Modify: `README.md` to document the team CODEOWNERS support, the `members: read` GitHub App permission requirement, and the collective responsibility behavior.

- [ ] **Step 4: Final verification and commit**

Commit: `git add README.md && git commit -m "docs: document team CODEOWNERS support and members permission in README"`
