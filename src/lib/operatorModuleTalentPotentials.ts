import type { OperatorCombatProfile, RawBlackboardEntry } from '../types/skill'
import { indexBaseTalents, separateAdditionalTalents } from './operatorModuleComparison.ts'
import { removePotentialBonusAnnotations } from './operatorEffectHighlights.ts'
import { applyOperatorModule, getOperatorModuleLevels, getOperatorModules } from './operatorModules.ts'
import { getOperatorMaxPotentialRank } from './operatorPotentials.ts'
import { getOperatorPassives, type OperatorPassives } from './operatorProfile.ts'

/** Baseline and actual talent upgrade thresholds, stable across the selected MODs and stages. */
export function getOperatorModuleTalentPotentialRanks(profile: OperatorCombatProfile): number[] {
  const maximum = getOperatorMaxPotentialRank(profile)
  const validThreshold = (value: number | undefined) => value === undefined
    || (Number.isInteger(value) && value >= 0 && value < maximum)
  const talentProfile: OperatorCombatProfile = {
    ...profile,
    talents: profile.talents?.map((talent) => ({
      ...talent, candidates: talent.candidates?.filter((candidate) => validThreshold(candidate.requiredPotentialRank)),
    })),
  }
  const candidates = new Set<number>()
  const addThreshold = (requiredPotentialRank: number | undefined) => {
    // Source thresholds are zero based; UI potential ranks are one based.
    if (requiredPotentialRank !== undefined && Number.isInteger(requiredPotentialRank)
      && requiredPotentialRank > 0 && requiredPotentialRank < maximum) candidates.add(requiredPotentialRank + 1)
  }
  for (const talent of talentProfile.talents ?? []) for (const candidate of talent.candidates ?? []) {
    if (!candidate.isHideTalent) addThreshold(candidate.requiredPotentialRank)
  }
  const modules = getOperatorModules(profile).map((module) => ({
    ...module, phases: module.phases?.map((phase) => ({
      ...phase, parts: phase.parts?.map((part) => part.addOrOverrideTalentDataBundle ? {
        ...part, addOrOverrideTalentDataBundle: {
          ...part.addOrOverrideTalentDataBundle,
          candidates: part.addOrOverrideTalentDataBundle.candidates?.filter((candidate) => validThreshold(candidate.requiredPotentialRank)),
        },
      } : part),
    })),
  }))
  for (const module of modules) for (const phase of module.phases ?? []) for (const part of phase.parts ?? []) {
    if (part.isToken) continue
    for (const candidate of part.addOrOverrideTalentDataBundle?.candidates ?? []) {
      if (!candidate.isHideTalent) addThreshold(candidate.requiredPotentialRank)
    }
  }
  const phaseIndex = Math.max(0, profile.phases.length - 1)
  const operatorLevel = Math.max(1, profile.phases[phaseIndex]?.maxLevel ?? 1)
  const passives = new Map<number, OperatorPassives>()
  const baseAt = (potential: number): OperatorPassives => {
    const cached = passives.get(potential)
    if (cached) return cached
    const current = getOperatorPassives(talentProfile, phaseIndex, operatorLevel, potential)
    passives.set(potential, current)
    return current
  }
  const ranks = [...candidates].sort((a, b) => a - b).filter((rank) => {
    const before = baseAt(rank - 1)
    const current = baseAt(rank)
    if (talentsChanged(before, current)) return true
    return modules.some((module) => {
      // Reuse the comparison table's mapping of hidden/new talents and original talent indices.
      const beforeModule = separateAdditionalTalents(module, before)
      const currentModule = separateAdditionalTalents(module, current)
      return getOperatorModuleLevels(module).filter((level) => Number.isInteger(level) && level > 0).some((level) => (
        talentsChanged(
          applyOperatorModule(indexBaseTalents(before), beforeModule, level, rank - 1).passives,
          applyOperatorModule(indexBaseTalents(current), currentModule, level, rank).passives,
        )
      ))
    })
  })
  return [1, ...ranks]
}

function talentsChanged(before: OperatorPassives, current: OperatorPassives): boolean {
  const previous = new Map(before.sources.filter((source) => source.sourceKind === 'TALENT')
    .map((source) => [source.talentIndex, source]))
  const next = current.sources.filter((source) => source.sourceKind === 'TALENT')
  if (previous.size !== next.length) return true
  return next.some((source) => {
    const old = previous.get(source.talentIndex)
    return !old || old.sourceName !== source.sourceName || old.tokenKey !== source.tokenKey
      || removePotentialBonusAnnotations(source.description, old.description) !== old.description
      || blackboardSignature(source.blackboard) !== blackboardSignature(old.blackboard)
  })
}

/** Ignore key ordering and metadata-only candidate changes, but preserve unrounded values. */
function blackboardSignature(entries: RawBlackboardEntry[]): string {
  return JSON.stringify(entries.map((entry) => [
    entry.key?.trim().toLowerCase() ?? '',
    typeof entry.value === 'number' ? (Number.isFinite(entry.value) ? entry.value : String(entry.value)) : null,
    entry.valueStr ?? null,
  ]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))))
}
