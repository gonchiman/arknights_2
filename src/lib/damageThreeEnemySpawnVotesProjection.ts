import type { EnemyOperatorVoteSummary } from './damageThreeEnemySpawnAdvantage.ts'
import { sumEnemySkillVotes } from './damageThreeEnemySpawnAdvantage.ts'
import { createSkillJsonSelectionKey } from './skillJsonAnalysis.ts'
import type { SkillRankStageSample } from './damageThreeSkillRankStatistics.ts'

type VoteStageEntry = { skill: SkillRankStageSample['skill']; capability: { supported: boolean } }

/** The filtered entries are a subset of allEntries. A partial skill needs a fresh division of each enemy's vote. */
export function projectEnemyOperatorVoteSummaries(
  saved: readonly EnemyOperatorVoteSummary[], allEntries: readonly VoteStageEntry[], filtered: readonly VoteStageEntry[],
): readonly EnemyOperatorVoteSummary[] | null {
  if (filtered.length === allEntries.length) return saved
  const selected = new Set(filtered)
  const kept = new Set<string>(), omitted = new Set<string>()
  for (const entry of allEntries) {
    if (!entry.capability.supported) continue
    const key = createSkillJsonSelectionKey(entry.skill)
    if (selected.has(entry)) kept.add(key)
    else omitted.add(key)
  }
  for (const key of kept) if (omitted.has(key)) return null
  return saved.flatMap(operator => {
    const skills = operator.skills.filter(skill => kept.has(skill.key))
    if (!skills.length) return []
    if (skills.length === operator.skills.length) return [operator]
    return [{ ...operator, skills, votes: sumEnemySkillVotes(skills) }]
  })
}
