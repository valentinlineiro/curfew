# Curfew MVP — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`).

**Goal:** un GitHub App que falla el status check de un PR cuando su autor tiene alertas de Dependabot vencidas en ese repo.

**Architecture:** un proceso Node sin framework. Dominio puro (Alert, Policy, Debt) sin HTTP ni JSON. Aplicación con dos funciones puras. Adaptadores GitHub detrás de puertos. Sin base de datos en la semana 1.

**Tech Stack:** Node 24 (type stripping nativo, sin build), TypeScript solo para `tsc --noEmit`, ESM, `node --test`, `node:http`, `node:crypto`. Única dependencia de runtime: `@octokit/auth-app`.

**Spec:** `docs/superpowers/specs/2026-11-11-curfew-design.md`

## Global Constraints

- Node 24+, `"type": "module"`. Los imports llevan extensión `.ts`.
- Runtime deps: solo `@octokit/auth-app`. Dev deps: solo `typescript`.
- Tests con `node --test` y `node:assert/strict`. Nombres `shouldXWhenY`.
- Todo texto visible (checks, logs, README) en inglés.
- **Fallo abierto:** cualquier error propio o de GitHub → conclusión `success`.
- **Sin dueño → no bloquea. Sin fix disponible → no bloquea.**
- Modelo `owner/name` para repos en todo el código.
- No añadir: base de datos, frontend, cola, Docker, ORM, Express, IA.

## Review Focus

1. Repo con Dependabot desactivado o sin permiso (403/404) → el check pasa, nunca rompe.
2. PR desde fork → el check pasa y no se evalúa.
3. Alerta sin `first_patched_version` → no bloquea aunque esté vencida.
4. Alerta dismissada → no cuenta como deuda.
5. Instalación nueva con 200 alertas históricas → nada bloquea el día 1 (suelo `installed_at`).

Cada línea tiene su test en la tarea dueña del código.

---

### Task 1: Esqueleto y política

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `src/domain/policy.ts`, `test/policy.test.ts`

**Interfaces:**
- Produces: `Severity`, `Policy`, `DEFAULT_POLICY`, `dueDate(publishedAt, severity, policy, notBefore)`

- [ ] **Step 1: Crear `package.json`, `tsconfig.json`, `.gitignore`**

`package.json`:

```json
{
  "name": "curfew",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "node --test",
    "typecheck": "tsc --noEmit",
    "start": "node src/delivery/server.ts"
  }
}
```

`tsconfig.json`: `strict: true`, `noEmit: true`, `allowImportingTsExtensions: true`, `module: "nodenext"`, `target: "es2023"`, `types: ["node"]`.

`.gitignore`: `node_modules/`, `.env`.

- [ ] **Step 2: escribir los tests que fallan**

`test/policy.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_POLICY, dueDate } from '../src/domain/policy.ts'

test('shouldAddCriticalWindowWhenAlertIsPublishedNow', () => {
  const due = dueDate(new Date('2026-11-11T00:00:00Z'), 'critical', DEFAULT_POLICY, new Date('2026-01-01T00:00:00Z'))
  assert.equal(due?.toISOString(), '2026-11-18T00:00:00.000Z')
})

test('shouldExemptLowSeverityFromSla', () => {
  assert.equal(dueDate(new Date(), 'low', DEFAULT_POLICY, new Date(0)), null)
})

test('shouldStartClockAtInstallTimeWhenAlertPredatesInstall', () => {
  const due = dueDate(new Date('2025-01-01T00:00:00Z'), 'critical', DEFAULT_POLICY, new Date('2026-11-11T00:00:00Z'))
  assert.equal(due?.toISOString(), '2026-11-18T00:00:00.000Z')
})

test('shouldUsePolicyOverrideWhenProvided', () => {
  const due = dueDate(new Date('2026-11-11T00:00:00Z'), 'high', { ...DEFAULT_POLICY, high: 1 }, new Date(0))
  assert.equal(due?.toISOString(), '2026-11-12T00:00:00.000Z')
})
```

- [ ] **Step 3: ejecutar y ver el fallo**

Run: `node --test test/policy.test.ts`
Expected: FAIL — no existe `src/domain/policy.ts`.

- [ ] **Step 4: implementar `src/domain/policy.ts`**

```ts
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Policy = Record<Severity, number | null>

export const DEFAULT_POLICY: Policy = { critical: 7, high: 30, medium: 90, low: null }

// The clock starts when the alert is published, but never before Curfew was installed:
// otherwise a new install is red on day one and gets removed.
export function dueDate(publishedAt: Date, severity: Severity, policy: Policy, notBefore: Date): Date | null {
  const days = policy[severity]
  if (days === null) return null
  const start = Math.max(publishedAt.getTime(), notBefore.getTime())
  return new Date(start + days * 86_400_000)
}
```

- [ ] **Step 5: ejecutar y ver el verde**

Run: `node --test test/policy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: commit**

```bash
git add package.json tsconfig.json .gitignore src/domain/policy.ts test/policy.test.ts
git commit -m "feat: add sla policy with install-time floor"
```

---

### Task 2: Alerta, deuda y evaluación

**Files:**
- Create: `src/domain/alert.ts`, `src/domain/check.ts`, `src/ports.ts`, `src/application/evaluateSla.ts`, `test/evaluateSla.test.ts`

**Interfaces:**
- Consumes: `Severity`, `Policy`, `dueDate` (Task 1)
- Produces: `Alert`, `Debt`, `GateResult`, `evaluateSla({ alerts, owners, policy, now, notBefore }): Debt[]`, y las interfaces de puertos `AlertSource`, `CheckPublisher`, `OwnerLookup`, `InstallationClock`

- [ ] **Step 1: escribir el test que falla**

`test/evaluateSla.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_POLICY } from '../src/domain/policy.ts'
import type { Alert } from '../src/domain/alert.ts'
import { evaluateSla } from '../src/application/evaluateSla.ts'

const now = new Date('2026-11-11T00:00:00Z')
const notBefore = new Date('2025-01-01T00:00:00Z')
const owners = new Map([[1, 'ana'], [2, 'ana'], [3, 'ana']])

const base: Alert = {
  id: 1, repo: 'acme/api', packageName: 'lodash', manifestPath: 'package.json',
  severity: 'critical', publishedAt: new Date('2026-11-01T00:00:00Z'),
  state: 'open', fixAvailable: true,
}

test('shouldReturnDebtWhenDueDateHasPassed', () => {
  assert.equal(evaluateSla({ alerts: [base], owners, policy: DEFAULT_POLICY, now, notBefore }).length, 1)
})

test('shouldNotReturnDebtWhenAlertIsDismissed', () => {
  const alert = { ...base, state: 'dismissed' as const }
  assert.deepEqual(evaluateSla({ alerts: [alert], owners, policy: DEFAULT_POLICY, now, notBefore }), [])
})

test('shouldNotReturnDebtWhenNoFixIsAvailable', () => {
  const alert = { ...base, fixAvailable: false }
  assert.deepEqual(evaluateSla({ alerts: [alert], owners, policy: DEFAULT_POLICY, now, notBefore }), [])
})

test('shouldNotReturnDebtWhenOwnerIsUnknown', () => {
  assert.deepEqual(evaluateSla({ alerts: [base], owners: new Map(), policy: DEFAULT_POLICY, now, notBefore }), [])
})

test('shouldNotReturnDebtWhenWithinWindow', () => {
  const alert = { ...base, publishedAt: new Date('2026-11-10T00:00:00Z') }
  assert.deepEqual(evaluateSla({ alerts: [alert], owners, policy: DEFAULT_POLICY, now, notBefore }), [])
})

test('shouldReturnOwnerAndDueDateWithEachDebt', () => {
  const [debt] = evaluateSla({ alerts: [base], owners, policy: DEFAULT_POLICY, now, notBefore })
  assert.equal(debt.owner, 'ana')
  assert.equal(debt.dueAt.toISOString(), '2026-11-08T00:00:00.000Z')
})
```

- [ ] **Step 2: ejecutar y ver el fallo**

Run: `node --test test/evaluateSla.test.ts`
Expected: FAIL — no existen `alert.ts` ni `evaluateSla.ts`.

- [ ] **Step 3: implementar `src/domain/alert.ts` y `src/ports.ts`**

`alert.ts`:

```ts
import type { Severity } from './policy.ts'

export type Alert = {
  id: number
  repo: string
  packageName: string
  manifestPath: string
  severity: Severity
  publishedAt: Date
  state: 'open' | 'dismissed'
  fixAvailable: boolean
}

export type Debt = { alert: Alert; owner: string; dueAt: Date }
```

`check.ts`:

```ts
export type GateResult = { conclusion: 'success' | 'failure'; title: string; summary: string }
```

`ports.ts` (solo tipos; las implementaciones llegan en tareas 5–7):

```ts
import type { Alert } from './domain/alert.ts'
import type { GateResult } from './domain/check.ts'

export interface AlertSource { listOpenAlerts(repo: string): Promise<Alert[]> }
export interface OwnerLookup { ownerFor(repo: string, manifestPath: string): Promise<string | null> }
export interface InstallationClock { installedAt(installationId: number): Promise<Date> }
export interface CheckPublisher {
  publish(input: { repo: string; headSha: string; result: GateResult }): Promise<void>
}
```

- [ ] **Step 4: implementar `src/application/evaluateSla.ts`**

```ts
import { dueDate, type Policy } from '../domain/policy.ts'
import type { Alert, Debt } from '../domain/alert.ts'

export function evaluateSla(input: {
  alerts: Alert[]
  owners: ReadonlyMap<number, string>
  policy: Policy
  now: Date
  notBefore: Date
}): Debt[] {
  const debts: Debt[] = []
  for (const alert of input.alerts) {
    const owner = input.owners.get(alert.id)
    if (alert.state !== 'open' || !alert.fixAvailable || !owner) continue
    const due = dueDate(alert.publishedAt, alert.severity, input.policy, input.notBefore)
    if (due && due.getTime() < input.now.getTime()) debts.push({ alert, owner, dueAt: due })
  }
  return debts
}
```

- [ ] **Step 5: ejecutar y ver el verde**

Run: `node --test test/evaluateSla.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: commit**

```bash
git add src/domain/alert.ts src/domain/check.ts src/ports.ts src/application/evaluateSla.ts test/evaluateSla.test.ts
git commit -m "feat: evaluate dependabot alerts into overdue debt"
```

---

### Task 3: Decisión del check

**Files:**
- Create: `src/application/gate.ts`, `test/gate.test.ts`

**Interfaces:**
- Consumes: `Debt` (Task 2), `GateResult` (Task 2)
- Produces: `gatePullRequest({ repo, author, debts }): GateResult`

- [ ] **Step 1: escribir el test que falla**

`test/gate.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gatePullRequest } from '../src/application/gate.ts'
import type { Debt } from '../src/domain/alert.ts'

const debt: Debt = {
  owner: 'ana',
  dueAt: new Date('2026-11-08T00:00:00Z'),
  alert: { id: 1, repo: 'acme/api', packageName: 'lodash', manifestPath: 'package.json',
    severity: 'critical', publishedAt: new Date('2026-11-01T00:00:00Z'), state: 'open', fixAvailable: true },
}

test('shouldFailWhenAuthorOwnsOverdueDebt', () => {
  assert.equal(gatePullRequest({ repo: 'acme/api', author: 'ana', debts: [debt] }).conclusion, 'failure')
})

test('shouldPassWhenDebtBelongsToAnotherOwner', () => {
  assert.equal(gatePullRequest({ repo: 'acme/api', author: 'luis', debts: [debt] }).conclusion, 'success')
})

test('shouldPassWhenThereIsNoDebt', () => {
  const result = gatePullRequest({ repo: 'acme/api', author: 'ana', debts: [] })
  assert.deepEqual(result, {
    conclusion: 'success',
    title: 'Within curfew',
    summary: 'No overdue dependency alerts for @ana.',
  })
})

test('shouldMatchOwnerCaseInsensitively', () => {
  assert.equal(gatePullRequest({ repo: 'acme/api', author: 'Ana', debts: [debt] }).conclusion, 'failure')
})

test('shouldListEachOverduePackageInSummary', () => {
  const result = gatePullRequest({ repo: 'acme/api', author: 'ana', debts: [debt, debt] })
  assert.equal(result.title, 'Curfew passed: 2 alerts')
  assert.match(result.summary, /lodash \(critical\) due 2026-11-08/)
})
```

- [ ] **Step 2: ejecutar y ver el fallo**

Run: `node --test test/gate.test.ts`
Expected: FAIL — no existe `gate.ts`.

- [ ] **Step 3: implementar `src/application/gate.ts`**

Regla: solo bloquea la deuda del autor del PR (comparación sin distinguir mayúsculas). `title` singular/plural: `Curfew passed: 1 alert` / `N alerts`. El summary lista una línea por deuda: `- <package> (<severity>) due YYYY-MM-DD`.

- [ ] **Step 4: ejecutar y ver el verde**

Run: `node --test test/gate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: commit**

```bash
git add src/application/gate.ts test/gate.test.ts
git commit -m "feat: gate pull requests on the author's overdue debt"
```

---

### Task 4: CODEOWNERS (puro)

**Files:**
- Create: `src/application/codeowners.ts`, `test/codeowners.test.ts`

**Interfaces:**
- Produces: `CodeownersRule = { pattern: string; owner: string }`, `parseCodeowners(text): CodeownersRule[]`, `ownerForPath(path, rules): string | null`

- [ ] **Step 1: escribir el test que falla**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCodeowners, ownerForPath } from '../src/application/codeowners.ts'

test('shouldIgnoreCommentsAndBlankLines', () => {
  assert.deepEqual(parseCodeowners('# owners\n\n*.json @ana\n'), [{ pattern: '*.json', owner: '@ana' }])
})

test('shouldReturnLastMatchingRule', () => {
  const rules = parseCodeowners('* @ana\n/package.json @luis')
  assert.equal(ownerForPath('package.json', rules), '@luis')
})

test('shouldMatchNestedPathsWithDoubleStar', () => {
  const rules = parseCodeowners('/services/** @ana')
  assert.equal(ownerForPath('services/api/package.json', rules), '@ana')
})

test('shouldReturnNullWhenNoRuleMatches', () => {
  const rules = parseCodeowners('/web/** @ana')
  assert.equal(ownerForPath('services/api/package.json', rules), null)
})
```

- [ ] **Step 2: ejecutar y ver el fallo**

Run: `node --test test/codeowners.test.ts`
Expected: FAIL.

- [ ] **Step 3: implementar `src/application/codeowners.ts`**

Soporte: `*`, `**`, `?`, patrón ancla con `/` inicial, y último match gana (semántica de GitHub). Sin negación ni escapes.

`shortcut: sin `!` ni escapes en CODEOWNERS, añadir si algún cliente los usa.`

- [ ] **Step 4: ejecutar y ver el verde**

Run: `node --test test/codeowners.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: commit**

```bash
git add src/application/codeowners.ts test/codeowners.test.ts
git commit -m "feat: resolve owners from codeowners rules"
```

---

### Task 5: Adaptador de alertas de GitHub

**Files:**
- Create: `src/adapters/github/alerts.ts`, `test/githubAlerts.test.ts`

**Interfaces:**
- Consumes: `AlertSource` (Task 2), `Alert`
- Produces: `createGitHubAlertSource({ token, apiUrl?, fetch? }): AlertSource`

- [ ] **Step 1: escribir el test que falla**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGitHubAlertSource } from '../src/adapters/github/alerts.ts'

const payload = [{
  number: 7, state: 'open',
  dependency: { package: { name: 'lodash' }, manifest_path: 'package.json' },
  security_advisory: { severity: 'critical', published_at: '2026-11-01T00:00:00Z' },
  security_vulnerability: { first_patched_version: { identifier: '4.17.21' } },
}]

const ok = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers })

test('shouldMapAlertPayloadToDomainAlert', async () => {
  const source = createGitHubAlertSource({ token: 't', fetch: async () => ok(payload) })
  const [alert] = await source.listOpenAlerts('acme/api')
  assert.deepEqual(alert, {
    id: 7, repo: 'acme/api', packageName: 'lodash', manifestPath: 'package.json',
    severity: 'critical', publishedAt: new Date('2026-11-01T00:00:00Z'),
    state: 'open', fixAvailable: true,
  })
})

test('shouldMarkAlertWithoutPatchAsNotFixable', async () => {
  const body = [{ ...payload[0], security_vulnerability: { first_patched_version: null } }]
  const source = createGitHubAlertSource({ token: 't', fetch: async () => ok(body) })
  assert.equal((await source.listOpenAlerts('acme/api'))[0].fixAvailable, false)
})

test('shouldFollowPaginationWhenResponseHasNextLink', async () => {
  const calls: string[] = []
  const source = createGitHubAlertSource({
    token: 't', apiUrl: 'https://api.github.test',
    fetch: async (url) => {
      calls.push(url)
      return calls.length === 1
        ? ok(payload, { link: '<https://api.github.test/repos/acme/api/dependabot/alerts?page=2>; rel="next"' })
        : ok([])
    },
  })
  await source.listOpenAlerts('acme/api')
  assert.equal(calls.length, 2)
  assert.match(calls[1], /page=2/)
})

test('shouldReturnEmptyListWhenDependabotIsUnavailable', async () => {
  const source = createGitHubAlertSource({ token: 't', fetch: async () => new Response('{}', { status: 403 }) })
  assert.deepEqual(await source.listOpenAlerts('acme/api'), [])
})

test('shouldThrowOnServerErrorSoTheGateCanFailOpen', async () => {
  const source = createGitHubAlertSource({ token: 't', fetch: async () => new Response('{}', { status: 500 }) })
  await assert.rejects(() => source.listOpenAlerts('acme/api'))
})
```

- [ ] **Step 2: ejecutar y ver el fallo**

Run: `node --test test/githubAlerts.test.ts`
Expected: FAIL.

- [ ] **Step 3: implementar `src/adapters/github/alerts.ts`**

`GET {apiUrl}/repos/{repo}/dependabot/alerts?state=open&per_page=100` con headers `Authorization: Bearer`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`. Sigue `link` `rel="next"`. 403/404 → `[]`. Otros no-2xx → `throw`.

Mapeo exacto: `id = number`, `severity = security_advisory.severity`, `publishedAt = security_advisory.published_at ?? created_at`, `fixAvailable = security_vulnerability.first_patched_version !== null`.

- [ ] **Step 4: ejecutar y ver el verde**

Run: `node --test test/githubAlerts.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: commit**

```bash
git add src/adapters/github/alerts.ts test/githubAlerts.test.ts
git commit -m "feat: read open dependabot alerts with pagination"
```

---

### Task 6: Dueños e instalación desde GitHub

**Files:**
- Create: `src/adapters/github/owners.ts`, `src/adapters/github/installation.ts`, `test/githubOwners.test.ts`, `test/githubInstallation.test.ts`

**Interfaces:**
- Consumes: `OwnerLookup`, `InstallationClock`, `parseCodeowners`, `ownerForPath` (Tasks 2, 4)
- Produces: `createGitHubOwnerLookup({ token, apiUrl?, fetch? }): OwnerLookup`, `createGitHubInstallationClock({ appAuth, apiUrl?, fetch? }): InstallationClock`

- [ ] **Step 1: escribir los tests que fallan**

`test/githubOwners.test.ts`: con un `fetch` falso que responde según la URL.

```ts
test('shouldUseCodeownersMatchWhenPresent', async () => {
  // GET /repos/acme/api/contents/.github/CODEOWNERS → { content: base64('/package.json @ana') }
  // espera ownerFor('acme/api', 'package.json') === '@ana'
})

test('shouldFallBackToLastCommitAuthor', async () => {
  // CODEOWNERS 404; GET /repos/acme/api/commits?path=package.json&per_page=1 → [{ author: { login: 'luis' } }]
  // espera '@luis'
})

test('shouldReturnNullWhenNeitherExists', async () => {
  // 404 en ambos → null
})
```

`test/githubInstallation.test.ts`:

```ts
test('shouldReturnInstallationCreatedAt', async () => {
  // GET /app/installations/42 → { created_at: '2026-11-11T00:00:00Z' }
  // espera Date('2026-11-11T00:00:00Z')
})
```

- [ ] **Step 2: ejecutar y ver el fallo**

Run: `node --test test/githubOwners.test.ts test/githubInstallation.test.ts`
Expected: FAIL.

- [ ] **Step 3: implementar ambos adaptadores**

`owners.ts`: prueba `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS` en ese orden; decodifica `content` base64 (`node:buffer`); si no hay match, `GET /repos/{repo}/commits?path={manifestPath}&per_page=1` y usa `author.login` con prefijo `@`; si no, `null`. Cualquier error de red → `null` (nunca bloquea).

`installation.ts`: recibe `appAuth: () => Promise<string>` que devuelve un JWT; `GET /app/installations/{id}` con `Authorization: Bearer <jwt>`; devuelve `new Date(created_at)`.

- [ ] **Step 4: ejecutar y ver el verde**

Run: `node --test test/githubOwners.test.ts test/githubInstallation.test.ts`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/adapters/github/owners.ts src/adapters/github/installation.ts test/githubOwners.test.ts test/githubInstallation.test.ts
git commit -m "feat: resolve owners and installation age from github"
```

---

### Task 7: Publicar el check

**Files:**
- Create: `src/adapters/github/checks.ts`, `test/githubChecks.test.ts`

**Interfaces:**
- Consumes: `CheckPublisher`, `GateResult` (Tasks 2, 3)
- Produces: `createGitHubCheckPublisher({ token, apiUrl?, fetch? }): CheckPublisher`

- [ ] **Step 1: escribir el test que falla**

```ts
test('shouldPostCompletedCheckWithGateConclusion', async () => {
  // captura body de POST /repos/acme/api/check-runs
  // espera { name: 'curfew', head_sha: 'abc', status: 'completed', conclusion: 'failure',
  //          output: { title: 'Curfew passed: 1 alert', summary: '...' } }
})

test('shouldThrowOnApiErrorSoTheCallerCanFailOpen', async () => {
  // 500 → assert.rejects
})
```

- [ ] **Step 2: ejecutar y ver el fallo** — `node --test test/githubChecks.test.ts` → FAIL.

- [ ] **Step 3: implementar `src/adapters/github/checks.ts`**

`POST {apiUrl}/repos/{repo}/check-runs` con `{ name: 'curfew', head_sha, status: 'completed', conclusion, output: { title, summary } }`. No-2xx → `throw`.

- [ ] **Step 4: ejecutar y ver el verde** — PASS.

- [ ] **Step 5: commit**

```bash
git add src/adapters/github/checks.ts test/githubChecks.test.ts
git commit -m "feat: publish curfew status checks"
```

---

### Task 8: Webhook

**Files:**
- Create: `src/delivery/webhook.ts`, `test/webhook.test.ts`

**Interfaces:**
- Produces: `verifySignature(secret, rawBody, signature): boolean`, `PullRequestJob = { repo, headSha, author, installationId }`, `parsePullRequestJob(event, payload): PullRequestJob | null`

- [ ] **Step 1: escribir el test que falla**

```ts
import { createHmac } from 'node:crypto'

const body = Buffer.from('{"zen":"x"}')
const sign = (s: string) => 'sha256=' + createHmac('sha256', s).update(body).digest('hex')

test('shouldAcceptWhenSignatureMatches', () => {
  assert.equal(verifySignature('secret', body, sign('secret')), true)
})

test('shouldRejectWhenSignatureDoesNotMatch', () => {
  assert.equal(verifySignature('secret', body, 'sha256=deadbeef'), false)
})

test('shouldRejectWhenSignatureIsMissing', () => {
  assert.equal(verifySignature('secret', body, undefined), false)
})

test('shouldIgnoreNonPullRequestEvents', () => {
  assert.equal(parsePullRequestJob('push', {}), null)
})

test('shouldIgnorePullRequestFromFork', () => {
  const payload = { action: 'opened', repository: { full_name: 'acme/api' }, installation: { id: 42 },
    pull_request: { head: { sha: 'abc', repo: { full_name: 'fork/api' } }, user: { login: 'ana' } } }
  assert.equal(parsePullRequestJob('pull_request', payload), null)
})

test('shouldIgnoreBotPullRequests', () => {
  const payload = { action: 'opened', repository: { full_name: 'acme/api' }, installation: { id: 42 },
    pull_request: { head: { sha: 'abc', repo: { full_name: 'acme/api' } }, user: { login: 'renovate[bot]' } } }
  assert.equal(parsePullRequestJob('pull_request', payload), null)
})

test('shouldReturnJobWhenPullRequestIsFromSameRepo', () => {
  const payload = { action: 'synchronize', repository: { full_name: 'acme/api' }, installation: { id: 42 },
    pull_request: { head: { sha: 'abc', repo: { full_name: 'acme/api' } }, user: { login: 'ana' } } }
  assert.deepEqual(parsePullRequestJob('pull_request', payload),
    { repo: 'acme/api', headSha: 'abc', author: 'ana', installationId: 42 })
})
```

- [ ] **Step 2: ejecutar y ver el fallo** — FAIL.

- [ ] **Step 3: implementar `src/delivery/webhook.ts`**

`verifySignature`: `timingSafeEqual` sobre el hex de `createHmac('sha256', secret)`; longitud distinta → `false`. `parsePullRequestJob`: solo `pull_request` con `action` en `opened | synchronize | reopened`; descarta forks comparando `head.repo.full_name` con `repository.full_name`; descarta autores cuyo login termina en `[bot]`.

- [ ] **Step 4: ejecutar y ver el verde** — PASS (7 tests).

- [ ] **Step 5: commit**

```bash
git add src/delivery/webhook.ts test/webhook.test.ts
git commit -m "feat: verify and parse github webhooks"
```

---

### Task 9: Cableado, servidor y puesta en marcha

**Files:**
- Create: `src/delivery/server.ts`, `src/delivery/handlePullRequest.ts`, `test/handlePullRequest.test.ts`, `README.md`, `.env.example`

**Interfaces:**
- Consumes: todo lo anterior
- Produces: `handlePullRequest(job, deps): Promise<void>` con `deps = { alerts, ownerLookup, clock, checks, policy, now? }`

- [ ] **Step 1: escribir el test que falla**

```ts
test('shouldPublishFailureWhenAuthorHasOverdueAlerts', async () => {
  // alerts: una alerta vencida; ownerLookup: '@ana' para su manifestPath; clock: 2025-01-01
  // espera que checks.publish reciba conclusion 'failure'
})

test('shouldPublishSuccessWhenAlertSourceThrows', async () => {
  // alerts.listOpenAlerts rechaza con Error('boom')
  // espera conclusion 'success' y summary que mencione 'curfew could not evaluate'
})

test('shouldPublishSuccessWhenPullRequestAuthorHasNoDebt', async () => {
  // deuda de '@luis', autor 'ana' → 'success'
})
```

- [ ] **Step 2: ejecutar y ver el fallo** — FAIL.

- [ ] **Step 3: implementar `handlePullRequest` y `server.ts`**

`handlePullRequest`: `try { alerts → ownerLookup (map id→owner, null se omite) → evaluateSla → gatePullRequest → publish } catch { publish success con summary 'curfew could not evaluate this pull request; failing open.' }`.

`server.ts`: `node:http`, `POST /webhook`, cuerpo máximo 1 MB, verifica firma, parsea, y responde `202` antes de procesar (no bloquea a GitHub). Tokens de instalación con `@octokit/auth-app` usando `installationId`. `GET /health` → `200 ok`. Variables: `CURFEW_APP_ID`, `CURFEW_PRIVATE_KEY`, `CURFEW_WEBHOOK_SECRET`, `CURFEW_POLICY` (JSON opcional).

- [ ] **Step 4: ejecutar todo**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, 0 errores de tipos.

- [ ] **Step 5: aceptación manual contra un repo real**

1. Crear GitHub App con permisos `checks:write`, `dependabot_alerts:read`, `contents:read`, `members:read`; webhook a `/webhook`.
2. Instalar en un repo con una alerta de Dependabot antigua.
3. Abrir un PR: el check `curfew` debe aparecer y fallar con el paquete listado.
4. Cerrar la alerta (o actualizar la dependencia) y re-ejecutar: debe pasar.

- [ ] **Step 6: escribir `README.md` y `.env.example`**

Pasos de creación de la App, variables, y cómo marcar `curfew` como required status check. Sin capturas, sin marketing.

- [ ] **Step 7: commit**

```bash
git add src/delivery README.md .env.example test/handlePullRequest.test.ts
git commit -m "feat: wire the curfew gate end to end"
```

---

## Fuera de este plan

Avisos previos al vencimiento, `.curfew.yml`, libro de deuda y export, onboarding web, facturación, GitLab. Cada uno es un plan propio.
