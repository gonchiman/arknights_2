import { readFileSync } from 'node:fs'
import type { OperatorCombatProfile } from '../src/types/skill.ts'

// Independent, reviewed JP trait candidates used by integration tests.
const rows = (JSON.parse(readFileSync(new URL('./fixtures/traitStructureGuardJobs.json', import.meta.url), 'utf8')) as {
  rows: { operatorId: string; operatorProfile: OperatorCombatProfile }[]
}).rows

export function reviewedTraitProfile(operatorId: string): Pick<OperatorCombatProfile, 'trait' | 'traitDescription'> {
  const profile = rows.find(row => row.operatorId === operatorId)?.operatorProfile
  if (!profile) throw new Error(`Missing reviewed trait fixture: ${operatorId}`)
  return structuredClone({ trait: profile.trait, traitDescription: profile.traitDescription })
}
