import type { Debt } from '../domain/alert.ts'
import type { TeamOwner } from '../domain/owner.ts'
import type { TeamMembership, MembershipFailureReason, MembershipResult } from '../ports.ts'

export type MembershipDegradation = {
  team: TeamOwner
  reason: MembershipFailureReason
}

export type ApplicableDebtsResult = {
  applicableDebts: Debt[]
  degradations: MembershipDegradation[]
}

export async function resolveApplicableDebts(input: {
  author: string
  debts: Debt[]
  teamMembership: TeamMembership
}): Promise<ApplicableDebtsResult> {
  const normalizedAuthor = input.author.replace(/^@/, '').toLowerCase()

  const membershipPromises = new Map<string, Promise<MembershipResult>>()
  const teamOwners = new Map<string, TeamOwner>()

  const getMembership = (team: TeamOwner): Promise<MembershipResult> => {
    const key = `${team.org}/${team.teamSlug}`
    if (!membershipPromises.has(key)) {
      teamOwners.set(key, team)
      const promise = (async () => {
        try {
          return await input.teamMembership.checkMembership(
            team.org,
            team.teamSlug,
            normalizedAuthor,
          )
        } catch {
          return { status: 'UNKNOWN' as const, reason: 'UNEXPECTED_ERROR' as const }
        }
      })()
      membershipPromises.set(key, promise)
    }
    return membershipPromises.get(key)!
  }

  // Pre-trigger membership lookups for all unique teams in parallel
  for (const debt of input.debts) {
    if (debt.owner.kind === 'team') {
      getMembership(debt.owner)
    }
  }

  // Await all team results
  const teamResults = new Map<string, MembershipResult>()
  for (const [key, promise] of membershipPromises.entries()) {
    teamResults.set(key, await promise)
  }

  // Collect degradations (one per unique team)
  const degradations: MembershipDegradation[] = []
  for (const [key, result] of teamResults.entries()) {
    if (result.status === 'UNKNOWN') {
      degradations.push({
        team: teamOwners.get(key)!,
        reason: result.reason,
      })
    }
  }

  // Filter debts in deterministic original order
  const applicableDebts = input.debts.filter((debt) => {
    if (debt.owner.kind === 'user') {
      return debt.owner.login.toLowerCase() === normalizedAuthor
    }
    const key = `${debt.owner.org}/${debt.owner.teamSlug}`
    const result = teamResults.get(key)
    return result?.status === 'MEMBER'
  })

  return { applicableDebts, degradations }
}
