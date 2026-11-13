import { createAppAuth } from '@octokit/auth-app'
import { writeFileSync } from 'node:fs'
import { createGitHubAlertSource } from '../src/adapters/github/alerts.ts'
import { createGitHubCheckPublisher } from '../src/adapters/github/checks.ts'
import { createGitHubInstallationClock } from '../src/adapters/github/installation.ts'
import { createGitHubOwnerLookup } from '../src/adapters/github/owners.ts'
import { evaluateSla } from '../src/application/evaluateSla.ts'
import { DEFAULT_POLICY, dueDate } from '../src/domain/policy.ts'
import { handlePullRequest } from '../src/delivery/handlePullRequest.ts'

const REPO = process.env.LAB_REPO ?? 'valentinlineiro/curfew-lab'
const PR_NUMBER = Number(process.env.LAB_PR_NUMBER ?? 1)
const INSTALLATION_ID = Number(process.env.LAB_INSTALLATION_ID ?? 180829360)

if (!process.env.CURFEW_APP_ID || !process.env.CURFEW_PRIVATE_KEY) {
  console.error('Error: CURFEW_APP_ID and CURFEW_PRIVATE_KEY must be set in environment.')
  process.exit(1)
}

const auth = createAppAuth({
  appId: Number(process.env.CURFEW_APP_ID),
  privateKey: process.env.CURFEW_PRIVATE_KEY.replace(/\\n/g, '\n'),
})

const { token } = await auth({ type: 'installation', installationId: INSTALLATION_ID })

async function api(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      ...options.headers,
    },
  })
  return res.json()
}

// Fetch PR info
const pr = await api(`/repos/${REPO}/pulls/${PR_NUMBER}`)
if (!pr.head) {
  console.error(`Could not fetch PR #${PR_NUMBER} on ${REPO}:`, pr)
  process.exit(1)
}

const headSha = pr.head.sha
const author = pr.user.login

console.log(`\n======================================================`)
console.log(`Curfew Lab Demo: ${REPO} (PR #${PR_NUMBER})`)
console.log(`Target SHA: ${headSha} | Author: @${author}`)
console.log(`======================================================\n`)

const clock = createGitHubInstallationClock({ appAuth: async () => (await auth({ type: 'app' })).token })
const alerts = createGitHubAlertSource({ token })
const ownerLookup = createGitHubOwnerLookup({ token })
const checks = createGitHubCheckPublisher({ token })

const installedAt = await clock.installedAt(INSTALLATION_ID)

async function runScenario(scenarioKey) {
  let isRealClock = true
  let simulatedOffsetDays = 0
  let simulatedAlertFilter = (a) => true
  let description = ''

  if (scenarioKey === 'scenario-a') {
    description = 'Escenario A: Sin alertas vencidas (reloj real / suelo de instalación)'
    isRealClock = true
  } else if (scenarioKey === 'scenario-b') {
    description = 'Escenario B: Alerta crítica/high vencida atribuida al autor (+31 días)'
    isRealClock = false
    simulatedOffsetDays = 31
  } else if (scenarioKey === 'scenario-c') {
    description = 'Escenario C: Deuda resuelta y sincronización / nueva evaluación'
    isRealClock = true
  } else {
    throw new Error(`Unknown scenario: ${scenarioKey}`)
  }

  console.log(`--- [ ${scenarioKey.toUpperCase()} ] ---`)
  console.log(`Descripción: ${description}`)

  const now = isRealClock
    ? new Date()
    : new Date(installedAt.getTime() + simulatedOffsetDays * 86_400_000)

  // Execute handlePullRequest
  await handlePullRequest(
    { repo: REPO, headSha, author, installationId: INSTALLATION_ID },
    {
      alerts,
      ownerLookup,
      clock,
      checks,
      policy: DEFAULT_POLICY,
      ...(isRealClock ? {} : { now: () => now }),
    },
  )

  // Fetch updated check run
  const runs = await api(`/repos/${REPO}/commits/${headSha}/check-runs`)
  const matchingRuns = (runs.check_runs ?? []).filter((r) => r.name === 'curfew').sort((a, b) => a.id - b.id)
  const latestRun = matchingRuns.at(-1)

  // Fetch PR mergeable status with branch protection
  const updatedPr = await api(`/repos/${REPO}/pulls/${PR_NUMBER}`)

  console.log(`Check Conclusion: ${latestRun?.conclusion?.toUpperCase()} (Status: ${latestRun?.status})`)
  console.log(`Check Title:      ${latestRun?.output?.title}`)
  console.log(`Check Run URL:    ${latestRun?.html_url}`)
  console.log(`PR Mergeable:     ${updatedPr?.mergeable}`)
  console.log(`PR Merge State:   ${updatedPr?.mergeable_state?.toUpperCase()}`)

  if (updatedPr?.mergeable_state === 'blocked') {
    console.log(`🔒 MERGE BLOCKED: Branch protection enforces 'curfew' required status check.`)
  } else if (updatedPr?.mergeable_state === 'clean') {
    console.log(`✅ MERGE UNBLOCKED: PR is ready to merge into main.`)
  }

  // Save evidence
  const openAlerts = await alerts.listOpenAlerts(REPO)
  const ownerByManifest = new Map()
  const owners = new Map()
  for (const alert of openAlerts) {
    if (!ownerByManifest.has(alert.manifestPath)) {
      ownerByManifest.set(alert.manifestPath, await ownerLookup.ownerFor(REPO, alert.manifestPath))
    }
    const owner = ownerByManifest.get(alert.manifestPath)
    if (owner) owners.set(alert.id, owner)
  }
  const debts = evaluateSla({ alerts: openAlerts, owners, policy: DEFAULT_POLICY, now, notBefore: installedAt })

  const evidence = {
    scenario: scenarioKey,
    description,
    repo: REPO,
    prNumber: PR_NUMBER,
    headSha,
    author,
    installedAt: installedAt.toISOString(),
    evaluatedNow: now.toISOString(),
    clockMode: isRealClock ? 'real' : 'injected',
    branchProtection: {
      requiredStatusCheck: 'curfew',
      enforceAdmins: true,
      mergeableState: updatedPr?.mergeable_state,
    },
    check: {
      id: latestRun?.id,
      name: latestRun?.name,
      status: latestRun?.status,
      conclusion: latestRun?.conclusion,
      title: latestRun?.output?.title,
      summary: latestRun?.output?.summary,
      completedAt: latestRun?.completed_at,
      url: latestRun?.html_url,
    },
    recordedAt: new Date().toISOString(),
  }

  const evidencePath = `/home/valentin/code/active/curfew/docs/validation/${scenarioKey}.json`
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n')
  console.log(`Saved evidence to ${evidencePath}\n`)

  return evidence
}

const target = process.argv[2] ?? 'all'
if (target === 'all') {
  console.log('Running complete 3-step demonstration sequence (A -> B -> C):\n')
  await runScenario('scenario-a')
  await new Promise((r) => setTimeout(r, 1500))
  await runScenario('scenario-b')
  await new Promise((r) => setTimeout(r, 1500))
  await runScenario('scenario-c')
  console.log('Sequence completed successfully.')
} else {
  await runScenario(target)
}
