import type {
  OperatorCombatProfile,
  RawBlackboardEntry,
  RawTalentCandidate,
  RawTraitCandidate,
  RawUnlockCondition,
} from '../types/skill'

export interface DisplayTalent {
  name: string
  description: string
}

export type PassiveSourceKind = 'TRAIT' | 'TALENT'

export interface PassiveSource {
  sourceKind: PassiveSourceKind
  sourceName: string
  talentIndex: number | null
  description: string
  blackboard: RawBlackboardEntry[]
  unlockCondition?: RawUnlockCondition
  requiredPotentialRank: number
  prefabKey: string | null
  tokenKey: string | null
}

export interface OperatorPassives {
  traitDescription: string
  talents: DisplayTalent[]
  sources: PassiveSource[]
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

  const traitSource: PassiveSource | null = traitCandidate || traitDescription
    ? {
        sourceKind: 'TRAIT',
        sourceName: '特性',
        talentIndex: null,
        description: traitDescription,
        blackboard: normalizeBlackboard(traitCandidate?.blackboard),
        unlockCondition: traitCandidate?.unlockCondition,
        requiredPotentialRank: traitCandidate?.requiredPotentialRank ?? 0,
        prefabKey: traitCandidate?.prefabKey ?? null,
        tokenKey: null,
      }
    : null

  const selectedTalents = (profile.talents ?? []).flatMap((talent, talentIndex) => {
    const candidate = getLatestUnlockedCandidate(
      (talent.candidates ?? []).filter((item) => !item.isHideTalent),
      phaseIndex,
      operatorLevel,
    )
    if (!candidate) return []

    const name = cleanGameText(candidate.name ?? '名称なし')
    const description = cleanGameText(candidate.description ?? '')
    return [{
      display: { name, description },
      source: {
        sourceKind: 'TALENT' as const,
        sourceName: name,
        talentIndex,
        description,
        blackboard: normalizeBlackboard(candidate.blackboard),
        unlockCondition: candidate.unlockCondition,
        requiredPotentialRank: candidate.requiredPotentialRank ?? 0,
        prefabKey: candidate.prefabKey ?? null,
        tokenKey: candidate.tokenKey ?? null,
      },
    }]
  })

  return {
    traitDescription,
    talents: selectedTalents.map(({ display }) => display),
    sources: [
      ...(traitSource ? [traitSource] : []),
      ...selectedTalents.map(({ source }) => source),
    ],
  }
}

function normalizeBlackboard(value: RawBlackboardEntry[] | undefined): RawBlackboardEntry[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => ({
    key: entry.key,
    value: entry.value,
    valueStr: entry.valueStr ?? null,
  }))
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
