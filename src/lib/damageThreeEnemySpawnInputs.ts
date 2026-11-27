import type { SkillRecord } from '../types/skill.ts'

/** Match the loaded game data, including production loads without an upstream revision ID. */
export async function getEnemySpawnSkillDataHash(rows: readonly SkillRecord[]): Promise<string> {
  const profiles = new Map<string, SkillRecord['operatorProfile']>()
  // The data loader shares one combat profile between each operator's skills.
  // Use an ordinal key so the fingerprint is independent of browser/Node locale sorting.
  const ordered = [...rows].sort((a, b) =>
    (a.operatorId < b.operatorId ? -1 : a.operatorId > b.operatorId ? 1 : 0) || a.skillIndex - b.skillIndex)
  // DC3 uses reviewed attack structures; user-edited classification labels are display data.
  const skills = ordered.map(({ operatorProfile, classification: _classification, ...skill }) => {
    profiles.set(skill.operatorId, operatorProfile)
    return skill
  })
  const bytes = new TextEncoder().encode(JSON.stringify([[...profiles], skills]))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}
