# Curfew Design Partner Pilot Playbook

A structured, 4-week engineering pilot designed to validate whether connecting dependency debt to ownership and deadlines changes team remediation behavior.

---

## 1. Candidate Team Profile

We look for an engineering team that meets these criteria:
- **Stack:** GitHub repositories using GitHub Dependabot for dependency security alerts.
- **Team:** 5 to 30 engineers with active pull request activity and multi-owner manifests.
- **Current State:** Accumulating dependency debt with no formal SLA or explicit individual ownership.
- **Commitment:** Willing to run Curfew across 1 agreed repository for 4 weeks and provide qualitative and quantitative feedback.

---

## 2. Four-Week Pilot Protocol

```
Week 1: Baseline  →  Week 2: Observation  →  Week 3: Enforcement  →  Week 4: Evaluation
(Inventory debt)     (Informative Checks)    (Required Check)        (Metrics & Interview)
```

### Week 1 — Baseline & Setup
- **Objective:** Quantify existing dependency debt and ownership coverage before any intervention.
- **Actions:**
  1. Inspect existing Dependabot alerts: count open alerts, breakdown by severity (`critical`, `high`, `medium`), and age.
  2. Verify manifest ownership coverage via `.github/CODEOWNERS` (individual `@username` or team `@org/team-slug`).
  3. Install the Curfew GitHub App on the target repository.
  4. Ensure `curfew` status check is **NOT** configured as a required check in branch protection.

### Week 2 — Observational Mode
- **Objective:** Introduce Curfew into the daily pull request workflow with zero disruption.
- **Actions:**
  1. Curfew evaluates every PR opened or synchronized.
  2. The check publishes as informational:
     - `Within curfew` when author has no overdue debt.
     - `X overdue alerts` when author (or author's team) owns debt past SLA.
  3. **Zero merge blocking:** PRs can merge regardless of check result.
  4. Observe team reaction: Do developers notice the check? Is attribution accurate?

### Week 3 — Target Enforcement
- **Objective:** Measure the effect of making dependency hygiene an explicit condition for merging.
- **Actions:**
  1. With team agreement, add `curfew` as a **Required Status Check** in branch protection on the target branch.
  2. PR authors with overdue alerts must either:
     - Update the vulnerable dependency in that manifest.
     - Dismiss the alert with a documented reason if it is a false positive or unexploitable.
     - Coordinate with the team if ownership is misconfigured.
  3. Monitor unblocking latency: When debt is patched and PR synchronized, does the check turn green seamlessly?

### Week 4 — Evaluation & Feedback
- **Objective:** Compare baseline vs. final metrics, conduct an engineering manager interview, and document findings.
- **Actions:**
  1. Extract quantitative metrics (see scorecard below).
  2. Conduct a 20-minute qualitative debrief with the Engineering Manager and at least one contributing developer.
  3. Determine next steps: Keep Curfew active, adjust SLA windows, or uninstall.

---

## 3. Honest Metric Scorecard

We measure practical engineering indicators, not vanity metrics:

| Metric | Baseline (Week 1) | Final (Week 4) | What It Demonstrates |
| :--- | :---: | :---: | :--- |
| **Open Overdue Alerts** | — | — | Magnitude of debt reduction |
| **Attributed Alerts (%)** | — | — | Accuracy of CODEOWNERS attribution |
| **Resolved During Pilot** | — | — | Remediation velocity during active enforcement |
| **Mean Time to Resolution** | — | — | SLA adherence shift |
| **PRs Evaluated** | — | — | Integration depth into normal PR flow |
| **Merge Blocks Encountered** | — | — | Actual friction introduced to engineering velocity |
| **Developer False Positives** | — | — | Instances where attribution was contested |

---

## 4. Engineering Manager Qualitative Interview

Four core questions to capture the qualitative reality:

1. **Previous Process:** *How did your team handle Dependabot alerts before Curfew? Was there an assigned owner or was it addressed opportunistically?*
2. **Behavioral Shift:** *Did having the check on pull requests change how engineers prioritized dependency updates?*
3. **Friction vs. Hygiene:** *Did branch protection enforcement cause blocking frustration, or was it accepted as part of standard code quality like CI tests?*
4. **Remaining Gaps:** *What friction or dependency issues remain unresolved that Curfew didn't address?*

---

## 5. Technical Boundaries & Scoped Fail-Open

To guarantee that Curfew never harms engineering delivery during the pilot:

1. **Configurable Enforcement:** Curfew never blocks a pull request on its own. Blocking is strictly controlled by repository administrators via GitHub Branch Protection.
2. **SLA Installation Floor:** Historic alerts published before Curfew installation do not immediately expire on Day 1. The clock starts at installation time.
3. **Scoped Fail-Open:**
   - If GitHub returns errors when querying team membership, Curfew fails open and records an informational degradation notice without failing the check.
   - If an alert has no identifiable owner or no patched version exists upstream, it does not count as actionable debt.
   - Any internal evaluation error publishes a passing check with a warning rather than blocking code integration.

---

## 6. Publication & Data Confidentiality

- **Public Case Study:** Published only with explicit, written authorization from the partner organization.
- **Default Privacy:** If the partner prefers confidentiality, results will be published in anonymized, aggregated form (e.g., *"A B2B SaaS engineering team of 14 developers..."*).
- **No Source Code Access:** Curfew only requests metadata permissions (`checks: write`, `dependabot alerts: read`, `contents: read`, `members: read`, `pull requests: read`) and inspects manifest file paths and CODEOWNERS rules. Repository source code is never read or stored.
