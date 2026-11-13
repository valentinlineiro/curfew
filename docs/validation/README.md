# Registro de Evidencias de Validación Real

Evidencias obtenidas contra GitHub real en el repositorio de laboratorio [`valentinlineiro/curfew-lab`](https://github.com/valentinlineiro/curfew-lab) y en el piloto de producción [`valentinlineiro/meridian`](https://github.com/valentinlineiro/meridian).

* **Installation ID:** `180829360`
* **App ID:** `5710403`
* **Branch Protection:** `curfew` configurado como **Required Status Check** en la rama `main` (`enforce_admins: true`).

---

## La Demostración en Tres Actos (`curfew-lab`)

Esta secuencia reproducible convierte la tesis de Curfew en una demostración tangible del valor de producto. Se ejecuta con:

```bash
node --env-file=.env scripts/curfew-lab-demo.mjs all
```

| Escenario | Situación | Reloj | Check Curfew | Estado PR (`mergeable_state`) | Run URL | Valor demostrado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A — Sin alertas vencidas** | PR abierto por `@valentinlineiro`. Deuda preexistente dentro del suelo de instalación. | Real | `SUCCESS`<br>`Within curfew` | `CLEAN`<br>✅ Merge habilitado | [Run 131903750005](https://github.com/valentinlineiro/curfew-lab/runs/131903750005) | **Cero fricción inicial:** La deuda histórica no bloquea el trabajo del primer día. El check pasa silenciosamente. |
| **B — Deuda vencida atribuida al autor** | Alertas `high` superan el SLA de 30 días fijado por la política. | Inyectado (+31d) | `FAILURE`<br>`3 overdue alerts` | `BLOCKED`<br>🔒 **Merge bloqueado** | [Run 131903790192](https://github.com/valentinlineiro/curfew-lab/runs/131903790192) | **El coste de ignorar la deuda:** La política pasa de sugerencia a condición de merge requerida. El PR no puede integrarse. |
| **C — Deuda resuelta y sincronización** | Se resuelve la vulnerabilidad o se actualiza la dependencia y se sincroniza el PR. | Real / Alertas resueltas | `SUCCESS`<br>`Within curfew` | `CLEAN`<br>✅ Merge restaurado | [Run 131903827879](https://github.com/valentinlineiro/curfew-lab/runs/131903827879) | **Desbloqueo reactivo:** Sin burocracia ni aprobaciones manuales; el flujo vuelve a verde automáticamente al cumplir la higiene. |

> **Nota sobre el Escenario B:** Este es el momento definitorio del producto. La interfaz de GitHub muestra de manera inequívoca: *"Merging is blocked: Required status check 'curfew' is expected."*

---

## Matriz Completa de Escenarios de Validación

| Escenario | PR | Target SHA | Autor | Tipo / Origen | Reloj | Conclusión | Título | Resumen del Check | Run URL | Qué demuestra |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A — Suelo de instalación** | #1 | `50c37f2e4a126...` | `@valentinlineiro` | Mismo repo | Real (día 0) | `success` | `Within curfew` | `No overdue dependency alerts for @valentinlineiro.` | [Run 131903750005](https://github.com/valentinlineiro/curfew-lab/runs/131903750005) | Alertas preexistentes respetan el inicio de Curfew. |
| **B — Bloqueo por SLA** | #1 | `50c37f2e4a126...` | `@valentinlineiro` | Mismo repo | Inyectado (+31d) | `failure` | `3 overdue alerts` | 3 alertas `high` vencidas de `lodash`. | [Run 131903790192](https://github.com/valentinlineiro/curfew-lab/runs/131903790192) | El check falla y activa el bloqueo de GitHub Branch Protection. |
| **C — Desbloqueo** | #1 | `50c37f2e4a126...` | `@valentinlineiro` | Mismo repo | Sincronización | `success` | `Within curfew` | Deuda resuelta, check en verde. | [Run 131903827879](https://github.com/valentinlineiro/curfew-lab/runs/131903827879) | El PR vuelve a estado `clean`. |
| **Bot PR** | #2 | `6f43735f7c297...` | `dependabot[bot]` | Mismo repo (bot) | Orgánico (webhook) | `success` | `Within curfew` | `curfew does not evaluate pull requests from bots or forks.` | [Run 130476866952](https://github.com/valentinlineiro/curfew-lab/runs/130476866952) | Exclusión automática de bots sin ruido ni bloqueos. |
| **Fork PR** | #3 | `c9fdf3c519c5f...` | `@valentinlineiro` | Fork (`Abell-Systems/...`) | Orgánico (webhook) | `success` | `Within curfew` | `curfew does not evaluate pull requests from bots or forks.` | [Run 130478981450](https://github.com/valentinlineiro/curfew-lab/runs/130478981450) | Exclusión de contribuciones externas desde forks. |

---

## Piloto en Producción: Meridian

| PR | Target SHA | Autor | Evento | Webhook | Check Run ID | Conclusión | Latencia Webhook→Check | Estado PR |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [#165](https://github.com/valentinlineiro/meridian/pull/165) | `73799f6...` | `@valentinlineiro` | `pull_request.opened` | 12:12:19Z | [130514877661](https://github.com/valentinlineiro/meridian/runs/130514877661) | `success` | ~1.2 s (Node local) | `MERGED` |
| Live Edge | `6031d67...` | `@valentinlineiro` | `pull_request.synchronize` | 11:50:50Z | [131868316002](https://github.com/valentinlineiro/meridian/runs/131868316002) | `success` | ~2.0 s (Cloudflare Worker Edge) | Live |

- **Detalle de evidencia piloto Node:** [pilot-meridian-pr-165.json](./pilot-meridian-pr-165.json)
- **Detalle de evidencia producción Cloudflare:** [production-cloudflare-worker-meridian.json](./production-cloudflare-worker-meridian.json)
- **Archivos de evidencia demo:** [scenario-a.json](./scenario-a.json), [scenario-b.json](./scenario-b.json), [scenario-c.json](./scenario-c.json)
