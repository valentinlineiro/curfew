# Registro de Evidencias de Validación Real

Evidencias obtenidas contra GitHub real en el repositorio [`valentinlineiro/curfew-lab`](https://github.com/valentinlineiro/curfew-lab).

* **Installation ID:** `180829360`
* **App ID:** `5710403`

---

## Matriz de Escenarios

| Escenario | PR | Target SHA | Autor | Tipo / Origen | Reloj | Conclusión | Título | Resumen del Check | Run URL | Qué demuestra |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A — Reloj real** | #1 | `50c37f2e4a126...` | `@valentinlineiro` | Mismo repo | Real (día 0) | `success` | `Within curfew` | `No overdue dependency alerts for @valentinlineiro.` | [Run 130455924220](https://github.com/valentinlineiro/curfew-lab/runs/130455924220) | **Suelo de instalación:** Alertas preexistentes no bloquean el PR en el día 1. |
| **B — Reloj inyectado** | #1 | `50c37f2e4a126...` | `@valentinlineiro` | Mismo repo | Inyectado (+31d) | `failure` | `Curfew passed: 3 alerts` | Muestra 3 alertas `high` y sus fechas de vencimiento. | [Run 130456023142](https://github.com/valentinlineiro/curfew-lab/runs/130456023142) | **Regla temporal:** Al expirar el SLA (30d), el check publica en rojo en el SHA real. |
| **C — Deuda resuelta** | #1 | `50c37f2e4a126...` | `@valentinlineiro` | Mismo repo | Inyectado (+31d) | `success` | `Within curfew` | `No overdue dependency alerts for @valentinlineiro.` | [Run 130456180361](https://github.com/valentinlineiro/curfew-lab/runs/130456180361) | **Desbloqueo reactivo:** Con las mismas condiciones temporales, resolver la deuda devuelve el check a verde. |
| **Bot PR (Escenario 6)** | #2 | `6f43735f7c297...` | `dependabot[bot]` | Mismo repo (bot) | Orgánico (webhook) | `success` | `Within curfew` | `curfew does not evaluate pull requests from bots or forks.` | [Run 130476866952](https://github.com/valentinlineiro/curfew-lab/runs/130476866952) | **Exclusión de bots:** Webhook real de PR abierto por bot; omite evaluación y publica verde. |
| **Fork PR** | #3 | `c9fdf3c519c5f...` | `@valentinlineiro` | Fork (`Abell-Systems/...`) | Orgánico (webhook) | `success` | `Within curfew` | `curfew does not evaluate pull requests from bots or forks.` | [Run 130478981450](https://github.com/valentinlineiro/curfew-lab/runs/130478981450) | **Exclusión de forks:** PR cruzado desde fork con autor humano; omite evaluación y publica check verde en el SHA del fork. |

---

## Piloto en Producción: Meridian

| PR | Target SHA | Autor | Evento | Webhook | Check Run ID | Conclusión | Latencia Webhook→Check | Estado PR |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [#165](https://github.com/valentinlineiro/meridian/pull/165) | `73799f6...` | `@valentinlineiro` | `pull_request.opened` | 12:12:19Z | [130514877661](https://github.com/valentinlineiro/meridian/runs/130514877661) | `success` | ~1.2 s (completado a las 12:12:21Z) | `MERGED` |

- **Detalle de evidencia:** [pilot-meridian-pr-165.json](./pilot-meridian-pr-165.json)
- **Observación operativa:** Curfew publicó su resultado informativo a las **12:12:21Z**, dos segundos antes de que el workflow de CI (`test`) siquiera comenzara a ejecutarse (`12:12:23Z`). Cero errores reportados en API ni en el túnel.

---

## Archivos de Evidencia JSON

1. [scenario-a-real-clock.json](./scenario-a-real-clock.json): Registro con reloj real y detalle de las 5 alertas evaluadas.
2. [scenario-b-injected-clock.json](./scenario-b-injected-clock.json): Registro con reloj adelantado a 2026-12-12 y listado de las 3 alertas vencidas en el summary.
3. [scenario-c-resolved-alerts.json](./scenario-c-resolved-alerts.json): Registro con alertas resueltas en Dependabot bajo el mismo reloj inyectado.
4. [scenario-bot-pr.json](./scenario-bot-pr.json): Registro del PR #2 orgánico de Dependabot con check de omisión por bot.
5. [scenario-fork-pr.json](./scenario-fork-pr.json): Registro del PR #3 orgánico desde fork (`Abell-Systems/curfew-lab`) con autor humano y check de omisión por fork.
6. [pilot-meridian-pr-165.json](./pilot-meridian-pr-165.json): Primer PR orgánico (#165) evaluado en el piloto real de Meridian.

---

## Conclusión de Validación Funcional

Con estos 5 escenarios queda validado contra GitHub en producción:
- El cálculo de vencimientos según SLA y el respeto del suelo de instalación.
- El ciclo completo de publicación de status checks en rojo (`failure`) y en verde (`success`).
- La actualización reactiva del estado del PR al resolverse las alertas.
- Los dos mecanismos de exclusión funcional aislados por separado: bots y forks.
