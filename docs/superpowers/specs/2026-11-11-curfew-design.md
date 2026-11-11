# Curfew — diseño

**Tesis:** ignorar una alerta de dependencias es gratis; Curfew le pone precio bloqueando el merge de quien la ignora.

## Por qué

Dolor medido: 11,3% de proyectos abandonan Dependabot; 62,5% de los cambios de configuración existen para que abra menos PRs; en r/devsecops la única intervención que cambió el comportamiento fue que los PRs del dueño empezaran a fallar un status check. Eso hoy no se vende como producto: es un script casero. El coste de upgrade crece de forma superlineal con la deuda acumulada, así que el incentivo por defecto es no empezar nunca.

## Objetivo

Que una empresa con un SLA de vulnerabilidades escrito (SOC 2, ISO 27001, contrato) pueda hacerlo cumplir en el camino del merge y probar que se cumplió.

## No-objetivos

- No escribe codemods ni arregla nada.
- No escanea SBOMs ni descubre vulnerabilidades: lee las de Dependabot.
- No es un dashboard de seguridad.
- Sin GitLab ni Azure DevOps en el MVP.
- Sin IA.

**Anti-objetivo:** si el producto acaba siendo "mejor que Dependabot arreglando cosas", hemos perdido. El foso es la política y la prueba.

## Comportamiento

1. GitHub App en la organización (`checks:write`, `dependabot_alerts:read`, `contents:read`, `members:read`).
2. Política: `critical 7d · high 30d · medium 90d · low exento`, sobreescribible.
3. Cada alerta abierta se atribuye: CODEOWNERS del manifiesto → último autor del fichero. (El equipo de fallback llega con los avisos, semana 2; sin dueño no hay deuda accionable.)
4. El reloj arranca en `published_at`, con suelo en `installed_at` (las alertas anteriores a la instalación no bloquean el día 1).
5. Un required status check falla cuando el autor del PR tiene alertas vencidas en ese repo.
6. Aviso antes del vencimiento, no después.
7. Al cerrar la alerta en GitHub, la mora desaparece sola en el siguiente sync.
8. Export del libro de deuda para el auditor (semana 3).

## Reglas que deciden si te desinstalan

- **Sin dueño no bloquea.** La deuda huérfana va al equipo de fallback y nunca bloquea.
- **Sin fix disponible no bloquea.** Una alerta que no se puede cerrar no es deuda accionable.
- **Fallo abierto ante error propio.** Si GitHub falla o el sync falla, el check pasa con aviso.
- Repos de bots y forks excluidos. Un dismissal cuenta como cierre solo con motivo y caducidad.

## Arquitectura

```
GitHub App (webhook + checks)
        ↓
  Application: EvaluateSla · GatePullRequest
        ↓
  Domain: Alert · Policy · Debt
        ↓
  Ports: AlertSource · CheckPublisher · OwnerLookup · InstallationClock
        ↓
  Adapters: GitHub REST
```

Un proceso. Sin cola, sin frontend, sin base de datos en la semana 1.

## Éxito

5 empresas instalan y a los 30 días siguen instaladas. Métrica: % de moras cerradas dentro de SLA. Métrica de fracaso: desinstalaciones por bloqueos injustos.
