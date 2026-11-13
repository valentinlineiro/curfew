# Curfew — Soporte para Equipos en CODEOWNERS (@org/team) y Membresía de GitHub

**Fecha:** 2026-11-13  
**Estado:** Especificación de Diseño Aprobada para Planificación

---

## 1. Contexto y Tesis del Sistema

Curfew bloquea el merge path de un pull request cuando su autor tiene alertas de Dependabot vencidas según la política de SLAs del repositorio. 

Hoy, la atribución de deuda en Curfew ignora las reglas de `CODEOWNERS` que definen equipos (`@org/team`) y recurre directamente al autor del último commit en el manifiesto. En entornos empresariales reales, más del 90% de las reglas en `CODEOWNERS` señalan equipos colectivos, provocando que la responsabilidad recaiga arbitrariamente en el último desarrollador que editó el archivo (la "patata caliente").

### Objetivo
Extender Curfew para dar soporte a propietarios colectivos (`@org/team`):
1. Preservar la atribución a equipos definida en `CODEOWNERS` sin descartarla en favor del historial de commits.
2. Resolver en tiempo de evaluación de PR si el autor pertenece al equipo propietario mediante la API de GitHub (`members: read`).
3. Bloquear el PR si el autor pertenece al equipo y existen alertas vencidas asignadas a dicho equipo.
4. Aislar fallos de infraestructura y permisos mediante un esquema determinista de *fail-open* enriquecido con observabilidad estructurada.

### Principio Arquitectural Fundamental
**Separación estricta entre Atribución Estática y Responsabilidad Contextual:**
* **Atribución Estática:** Una deuda pertenece permanentemente a un `Owner` canónico (`UserOwner` o `TeamOwner`). La deuda no muta ni se divide entre los miembros del equipo.
* **Responsabilidad Contextual:** Se calcula dinámicamente durante la evaluación de cada PR. Determina si el autor de ese PR específico debe responder por la deuda aplicable en ese momento.
* **Evaluador Puro:** `gatePullRequest` se mantiene como una función síncrona y pura. Toda consulta de red, resolución de membresía, manejo de errores y observabilidad se resuelve en las capas de aplicación y entrega antes de invocar la compuerta.

---

## 2. Modelo de Dominio (`src/domain/owner.ts`, `src/domain/alert.ts`)

### Tipos de Propietario (`src/domain/owner.ts`)

```typescript
export type UserOwner = {
  kind: 'user'
  login: string // Minúsculas, sin '@' inicial (ej. 'alice')
}

export type TeamOwner = {
  kind: 'team'
  org: string      // Organización normalizada a minúsculas, sin '@'
  teamSlug: string // Slug normalizado a minúsculas
}

export type Owner = UserOwner | TeamOwner
```

### Funciones Puras de Dominio

* `parseOwner(handle: string): Owner | null`:
  * Elimina un único `@` inicial opcional.
  * Valida estrictamente los caracteres admitidos: logins y slugs de GitHub (alfanumérico, guiones medios, sin espacios ni caracteres arbitrarios).
  * Excluye expresamente direcciones de correo (`user@example.com` devuelve `null`).
  * Si contiene un segmento: `UserOwner` (ej. `@alice` o `alice` $\rightarrow$ `{ kind: 'user', login: 'alice' }`).
  * Si contiene exactamente dos segmentos separados por `/`: `TeamOwner` (ej. `@acme/frontend` o `acme/frontend` $\rightarrow$ `{ kind: 'team', org: 'acme', teamSlug: 'frontend' }`).
  * Cero segmentos, más de dos segmentos, segmentos vacíos o strings malformados devuelven `null`.
* `formatOwner(owner: Owner): string`:
  * Salida exhaustiva y canónica:
    * `UserOwner`: `@${owner.login}`
    * `TeamOwner`: `@${owner.org}/${owner.teamSlug}`

### Actualización de `Debt` (`src/domain/alert.ts`)

```typescript
export type Debt = {
  alert: Alert
  owner: Owner
  dueAt: Date
}
```

---

## 3. Parser CODEOWNERS y Precedencia de Atribución (`src/application/codeowners.ts`, `src/adapters/github/owners.ts`)

### Reglas de CODEOWNERS (`src/application/codeowners.ts`)

```typescript
export type CodeownersRule = {
  pattern: string
  owner: Owner
}
```

* **Política del primer propietario:** Curfew adopta deliberadamente el **primer propietario sintácticamente válido** (`parseOwner`) que aparezca en la línea de la regla. Los propietarios secundarios o inválidos se descartan.
* **Precedencia de reglas (Last matching rule wins):** Si múltiples reglas coinciden con la ruta del manifiesto, la última regla del archivo determina el propietario.
* **Patrones soportados:** Globbing estándar aproximado (`*`, `**`, `?`, y anclas `/`). No soporta negación (`!`) ni espacios escapados.

### Puerto `OwnerLookup` (`src/ports.ts`)

```typescript
export interface OwnerLookup {
  ownerFor(repo: string, manifestPath: string): Promise<Owner | null>
}
```

### Precedencia de Búsqueda de Archivos (`src/adapters/github/owners.ts`)

El orden de inspección es estrictamente:
1. `.github/CODEOWNERS`
2. `CODEOWNERS` (raíz)
3. `docs/CODEOWNERS`

**Tabla de Decisiones:**

| Escenario | Comportamiento |
|---|---|
| No existe ningún archivo `CODEOWNERS` | Fallback al autor del último commit del manifiesto |
| El primer archivo encontrado tiene regla coincidente (`UserOwner`) | Devuelve `UserOwner` inmediatamente |
| El primer archivo encontrado tiene regla coincidente (`TeamOwner`) | Devuelve `TeamOwner` inmediatamente (no salta a commit) |
| El primer archivo encontrado NO tiene regla coincidente | Fallback al autor del último commit del manifiesto (no lee archivos posteriores) |
| Fallback a commit encuentra autor en GitHub | Devuelve `UserOwner(last.author.login)` |
| Fallback a commit no encuentra autor o falla la API | Devuelve `null` (deuda sin dueño no bloquea) |

---

## 4. Puerto `TeamMembership` y Adaptador GitHub REST (`src/ports.ts`, `src/adapters/github/membership.ts`)

### Contrato del Puerto (`src/ports.ts`)

```typescript
export type MembershipFailureReason =
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'UNEXPECTED_ERROR'

export type MembershipResult =
  | { status: 'MEMBER' }
  | { status: 'NOT_MEMBER' }
  | { status: 'UNKNOWN'; reason: MembershipFailureReason }

export interface TeamMembership {
  checkMembership(org: string, teamSlug: string, username: string): Promise<MembershipResult>
}
```

### Adaptador GitHub REST (`src/adapters/github/membership.ts`)

* **Endpoint:** `GET https://api.github.com/orgs/{org}/teams/{team_slug}/memberships/{username}`
* **Permiso de GitHub App:** `Organization permissions: Members: Read-only` (`members: read`).
* **Headers:**
  * `Authorization: Bearer <installation_token>`
  * `Accept: application/vnd.github+json`
  * `X-GitHub-Api-Version: 2022-11-28`
* **Timeout:** 10 segundos vía `AbortSignal.timeout(10_000)`.
* **Mapeo de Respuestas:**

| Respuesta HTTP / Transporte | Condición adicional | Resultado Curfew |
|---|---|---|
| `200 OK` | `json.state === 'active'` | `{ status: 'MEMBER' }` |
| `200 OK` | `json.state === 'pending'` | `{ status: 'NOT_MEMBER' }` |
| `200 OK` | JSON malformado o `state` desconocido | `{ status: 'UNKNOWN', reason: 'UNEXPECTED_ERROR' }` |
| `404 Not Found` | Equipo visible sin membresía o equipo no visible | `{ status: 'NOT_MEMBER' }` (decisión explícita de diseño sin segunda llamada) |
| `429 Too Many Requests` | Cualquier cabecera | `{ status: 'UNKNOWN', reason: 'RATE_LIMITED' }` |
| `403 Forbidden` | `x-ratelimit-remaining === '0'` | `{ status: 'UNKNOWN', reason: 'RATE_LIMITED' }` |
| `403 Forbidden` | Estándar / Falta de permisos | `{ status: 'UNKNOWN', reason: 'FORBIDDEN' }` |
| `5xx Server Error` | Códigos 500, 502, 503, 504 | `{ status: 'UNKNOWN', reason: 'SERVER_ERROR' }` |
| `AbortError` / Timeout | Señal de 10s disparada | `{ status: 'UNKNOWN', reason: 'TIMEOUT' }` |
| `TypeError` / Red / DNS | Rechazo de `fetch` de transporte | `{ status: 'UNKNOWN', reason: 'NETWORK_ERROR' }` |
| Error inesperado | Excepción no clasificada | `{ status: 'UNKNOWN', reason: 'UNEXPECTED_ERROR' }` |

---

## 5. Resolución de Deuda Aplicable (`src/application/applicableDebts.ts`)

El caso de uso `resolveApplicableDebts` toma las deudas vencidas y determina cuáles corresponden al autor del PR.

```typescript
export type MembershipDegradation = {
  team: TeamOwner
  reason: MembershipFailureReason
}

export type ApplicableDebtsResult = {
  applicableDebts: Debt[]
  degradations: MembershipDegradation[]
}

export async function resolveApplicableDebts(input: {
  author: string // Normalizado a minúsculas y sin '@'
  debts: Debt[]
  teamMembership: TeamMembership
}): Promise<ApplicableDebtsResult>
```

### Reglas de Ejecución:
1. **Normalización estricta:** `author` se procesa normalizado a minúsculas y sin `@`.
2. **Request Coalescing:** Para evitar consultas redundantes y saturación de API, las deudas que apuntan al mismo equipo comparten una única promesa en memoria durante la evaluación:
   ```typescript
   const membershipPromises = new Map<string, Promise<MembershipResult>>()
   ```
   El mapa tiene ámbito exclusivo a la evaluación del PR actual; **no persiste como caché entre ejecuciones**.
3. **Tratamiento de `UNKNOWN` (Fail-Open):** Si la consulta de membresía devuelve `UNKNOWN`, las deudas de ese equipo **se omiten** de `applicableDebts` y se registra **exactamente una degradación por equipo único** en `degradations`.
4. **No neutralización de deudas verificadas:** Una degradación en un equipo jamás anula las deudas individuales verificadas del autor ni las de otros equipos donde la membresía sea `MEMBER`.
5. **Determinismo:** El orden original de los elementos en `applicableDebts` coincide con el orden del array `debts` de entrada.

---

## 6. Orquestación, Observabilidad y Gating (`src/application/gate.ts`, `src/delivery/handlePullRequest.ts`)

### Evaluador Puro (`src/application/gate.ts`)

```typescript
export function gatePullRequest(input: {
  repo: string
  author: string
  applicableDebts: Debt[]
}): GateResult
```

* **Sin deuda aplicable (`applicableDebts.length === 0`):**
  * `conclusion: 'success'`
  * `title: 'Within curfew'`
  * `summary: 'No overdue dependency alerts for @${author}.'`
* **Con deuda aplicable (`applicableDebts.length > 0`):**
  * `conclusion: 'failure'`
  * `title: `${count} overdue alert${count === 1 ? '' : 's'}`` *(Corrección de título: no usar "Curfew passed" en fallo)*
  * Cada línea detalla: `- ${packageName} (${severity}) due ${date} [owner: ${formatOwner(debt.owner)}]`

### Observabilidad no intrusiva (`src/ports.ts`)

```typescript
export interface Logger {
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}
```

* Las implementaciones de `Logger` deben ser seguras y no lanzar excepciones jamás.
* El contexto de logging normaliza los errores a campos seguros (`name`, `message`, `code`), sin volcar objetos complejos ni tokens.

### Separación de Errores en `handlePullRequest`

1. **Fase de Evaluación:** Si ocurre un error inesperado al listar alertas o calcular deudas, se registra con `logger.error` y se publica un check con `conclusion: 'success'` (Fail-open: *un fallo en el evaluador nunca bloquea un merge*).
2. **Fase de Publicación:** Si falla `checks.publish`, el error se registra con `logger.error` y **se propaga arrojando la excepción** para que la infraestructura de entrega/webhooks lo gestione. Nunca se intenta publicar un segundo check ante un fallo de publicación.

---

## 7. Plan de Verificación y Testing

### Matriz de Pruebas Unitarias y de Integración

| Módulo | Escenario de prueba | Resultado esperado |
|---|---|---|
| `owner.test.ts` | Parsing `@alice`, `alice` | `UserOwner('alice')` |
| `owner.test.ts` | Parsing `@org/team`, `org/team` | `TeamOwner('org', 'team')` |
| `owner.test.ts` | Parsing inválidos: `user@example.com`, `@org/team/extra`, espacios, vacíos | `null` |
| `owner.test.ts` | Formateo canónico `formatOwner` | `@alice`, `@org/team` |
| `codeowners.test.ts` | Regla con equipo: `/pkg.json @acme/core @alice` | Toma primer dueño: `@acme/core` |
| `codeowners.test.ts` | Regla con email primero: `/pkg.json user@example.com @acme/core` | Salta email y toma `@acme/core` |
| `codeowners.test.ts` | Precedencia última regla en el archivo | La última regla coincidente gana |
| `codeowners.test.ts` | Precedencia de archivos `.github/` vs raíz | El primer archivo encontrado prevalece íntegramente |
| `applicableDebts.test.ts` | Autor coincide con `UserOwner` | Incluida en `applicableDebts` |
| `applicableDebts.test.ts` | Autor no coincide con `UserOwner` | Excluida |
| `applicableDebts.test.ts` | Autor es `MEMBER` de `TeamOwner` | Incluida conservando `owner` original |
| `applicableDebts.test.ts` | Autor es `NOT_MEMBER` de `TeamOwner` | Excluida |
| `applicableDebts.test.ts` | Respuesta `UNKNOWN` de `TeamOwner` | Excluida, 1 sola degradación en array |
| `applicableDebts.test.ts` | 10 alertas del mismo equipo | 1 sola llamada a `checkMembership` (request coalescing) |
| `applicableDebts.test.ts` | Mixto: deuda User verified + Team UNKNOWN | Check final FALLA por la deuda verificada |
| `applicableDebts.test.ts` | Mixto: Team A MEMBER + Team B UNKNOWN | Deudas de Team A aplicadas, Team B omitido |
| `applicableDebts.test.ts` | Orden determinista | `applicableDebts` respeta orden de entrada |
| `githubMembership.test.ts` | Simulación HTTP 200 active / 200 pending | `MEMBER` / `NOT_MEMBER` |
| `githubMembership.test.ts` | Simulación HTTP 404 | `NOT_MEMBER` |
| `githubMembership.test.ts` | Simulación HTTP 403 con rate-limit = 0 | `UNKNOWN(RATE_LIMITED)` |
| `githubMembership.test.ts` | Simulación HTTP 403 estándar | `UNKNOWN(FORBIDDEN)` |
| `githubMembership.test.ts` | Simulación HTTP 429 | `UNKNOWN(RATE_LIMITED)` |
| `githubMembership.test.ts` | Simulación HTTP 500 / 502 / 503 | `UNKNOWN(SERVER_ERROR)` |
| `githubMembership.test.ts` | AbortSignal timeout | `UNKNOWN(TIMEOUT)` |
| `githubMembership.test.ts` | Error de red (fetch TypeError) | `UNKNOWN(NETWORK_ERROR)` |
| `handlePullRequest.test.ts` | PR sin deuda | Check `conclusion: 'success'`, title 'Within curfew' |
| `handlePullRequest.test.ts` | PR con 2 deudas vencidas | Check `conclusion: 'failure'`, title '2 overdue alerts' |
| `handlePullRequest.test.ts` | Fallo en evaluación | Check `conclusion: 'success'` (fail-open) |
| `handlePullRequest.test.ts` | Fallo en checks.publish | Lanza excepción hacia el runtime |

---

## 8. Limitaciones Asumidas y Documentadas

1. **Semántica de 404:** Se interpreta como `NOT_MEMBER`. No se efectúa una consulta adicional para distinguir entre falta de membresía y equipo invisible/inexistente.
2. **Sintaxis CODEOWNERS:** Soporte de patrones aproximado (sin negación `!` ni espacios escapados).
3. **Ámbito de Coalescing:** El coalescing de membresías reside en la memoria de cada ejecución de webhook. No se mantiene caché entre peticiones.
