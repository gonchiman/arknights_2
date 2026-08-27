import type {
  OperatorCombatProfile,
  RawTalentCandidate,
  RawTraitCandidate,
  RawUnlockCondition,
} from '../types/skill'

export interface DisplayTalent {
  name: string
  description: string
}

export interface OperatorPassives {
  traitDescription: string
  talents: DisplayTalent[]
}

export function getOperatorPassives(
  profile: OperatorCombatProfile,
  phaseIndex: number,
  operatorLevel: number,
): OperatorPassives {
  const traitCandidate = getLatestUnlockedCandidate(
    profile.trait?.candidates ?? [],
    phaseIndex,
    operatorLevel,
  )
  const traitDescription = cleanGameText(
    traitCandidate?.overrideDescripton
      ?? traitCandidate?.overrideDescription
      ?? profile.traitDescription
      ?? profile.subProfessionTraitDescription
      ?? '',
  )

  const talents = (profile.talents ?? []).flatMap((talent) => {
    const candidate = getLatestUnlockedCandidate(
      (talent.candidates ?? []).filter((item) => !item.isHideTalent),
      phaseIndex,
      operatorLevel,
    )
    if (!candidate) return []

    return [{
      name: cleanGameText(candidate.name ?? '名称なし'),
      description: cleanGameText(candidate.description ?? ''),
    }]
  })

  return { traitDescription, talents }
}

function getLatestUnlockedCandidate<T extends RawTraitCandidate | RawTalentCandidate>(
  candidates: T[],
  phaseIndex: number,
  operatorLevel: number,
): T | null {
  return candidates
    .filter((candidate) => (candidate.requiredPotentialRank ?? 0) <= 0)
    .filter((candidate) => isUnlocked(candidate.unlockCondition, phaseIndex, operatorLevel))
    .sort((a, b) => compareUnlockConditions(a.unlockCondition, b.unlockCondition))
    .at(-1) ?? null
}

function isUnlocked(
  condition: RawUnlockCondition | undefined,
  phaseIndex: number,
  operatorLevel: number,
): boolean {
  const unlockPhase = parsePhaseIndex(condition?.phase)
  const unlockLevel = condition?.level ?? 1
  return unlockPhase < phaseIndex || (unlockPhase === phaseIndex && unlockLevel <= operatorLevel)
}

function compareUnlockConditions(
  a: RawUnlockCondition | undefined,
  b: RawUnlockCondition | undefined,
): number {
  return parsePhaseIndex(a?.phase) - parsePhaseIndex(b?.phase)
    || (a?.level ?? 1) - (b?.level ?? 1)
}

function parsePhaseIndex(phase: string | undefined): number {
  const match = phase?.match(/(\d+)$/)
  return match ? Number(match[1]) : 0
}

function cleanGameText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
