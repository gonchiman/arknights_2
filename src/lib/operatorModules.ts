import type {
  RawBlackboardCollection,
  RawBlackboardEntry,
  RawOperatorModule,
  RawOperatorModulePhase,
  RawOperatorModuleTalentCandidate,
  RawOperatorModuleTraitCandidate,
} from '../types/skill'
import type {
  OperatorPassives,
  PassiveSource,
  PassiveSourceKind,
} from './operatorProfile'

export type OperatorModuleEffectStatus = 'APPLIED' | 'NO_DIRECT_EFFECT' | 'UNSUPPORTED'

export interface OperatorModuleAttributeEffect {
  key: string
  label: string
  valueLabel: string
  status: OperatorModuleEffectStatus
  reason: string
}

export interface OperatorModuleChange {
  kind: 'TRAIT' | 'TALENT' | 'TOKEN'
  label: string
  description: string
  talentIndex: number | null
}

export interface OperatorModuleSourceRef {
  sourceKind: PassiveSourceKind
  sourceName: string
  talentIndex: number | null
}

export interface OperatorModuleApplication {
  moduleName: string
  moduleLevel: number
  moduleAttack: number
  attackSpeedBonus: number
  passives: OperatorPassives
  attributeEffects: OperatorModuleAttributeEffect[]
  changes: OperatorModuleChange[]
  affectedSources: OperatorModuleSourceRef[]
  unsupportedReasons: string[]
}

const MODULE_ATTRIBUTE_LABELS: Record<string, string> = {
  max_hp: '最大HP',
  atk: '攻撃力',
  def: '防御力',
  magic_resistance: '術耐性',
  attack_speed: '攻撃速度',
  cost: '配置コスト',
  respawn_time: '再配置時間',
  block_cnt: 'ブロック数',
}

const NON_DAMAGE_ATTRIBUTE_KEYS = new Set([
  'max_hp',
  'def',
  'magic_resistance',
  'cost',
  'respawn_time',
  'block_cnt',
])

export function getOperatorModules(profile: { modules?: RawOperatorModule[] }): RawOperatorModule[] {
  return (Array.isArray(profile.modules) ? profile.modules : [])
    .filter((module) => module.type === 'ADVANCED' && Boolean(module.uniEquipName))
}

export function getOperatorModuleId(module: RawOperatorModule, index = 0): string {
  return module.uniEquipId ?? `module:${index}:${module.uniEquipName ?? 'unknown'}`
}

export function getOperatorModuleLevels(module: RawOperatorModule | null | undefined): number[] {
  if (!Array.isArray(module?.phases)) return []
  return [...new Set(module.phases.map((phase, index) => (
    typeof phase.equipLevel === 'number' ? phase.equipLevel : index + 1
  )))].sort((a, b) => a - b)
}

export function getOperatorModulePhase(
  module: RawOperatorModule | null | undefined,
  level: number,
): RawOperatorModulePhase | null {
  if (!Array.isArray(module?.phases) || module.phases.length === 0) return null
  const sorted = module.phases
    .map((phase, index) => ({ phase, level: phase.equipLevel ?? index + 1 }))
    .sort((a, b) => a.level - b.level)
  return sorted.find((entry) => entry.level === level)?.phase
    ?? sorted.filter((entry) => entry.level <= level).at(-1)?.phase
    ?? sorted[0].phase
}

export function isOperatorModuleUnlocked(
  module: RawOperatorModule,
  phaseIndex: number,
  operatorLevel: number,
): boolean {
  const unlockPhase = parsePhaseIndex(module.unlockEvolvePhase ?? undefined)
  const unlockLevel = module.unlockLevel ?? 1
  return phaseIndex > unlockPhase || (phaseIndex === unlockPhase && operatorLevel >= unlockLevel)
}

export function getOperatorModuleTypeLabel(module: RawOperatorModule): string {
  const labels = [module.typeName1, module.typeName2].filter((value): value is string => Boolean(value))
  return labels.length > 0 ? labels.join('-') : 'モジュール'
}

export function getOperatorModuleUnlockLabel(module: RawOperatorModule): string {
  const phase = parsePhaseIndex(module.unlockEvolvePhase ?? undefined)
  return `昇進${phase} Lv.${module.unlockLevel ?? 1}`
}

export function applyOperatorModule(
  basePassives: OperatorPassives,
  module: RawOperatorModule | null | undefined,
  level: number,
  potentialRank = 1,
): OperatorModuleApplication {
  const passives = clonePassives(basePassives)
  if (!module) return emptyApplication(passives)

  const moduleName = cleanGameText(module.uniEquipName ?? '名称なし')
  const phase = getOperatorModulePhase(module, level)
  if (!phase) {
    return {
      ...emptyApplication(passives),
      moduleName,
      unsupportedReasons: ['選択したモジュールの戦闘効果データを取得できません。'],
    }
  }

  const moduleLevel = typeof phase.equipLevel === 'number' ? phase.equipLevel : level
  const attributeEffects = normalizeBlackboard(phase.attributeBlackboard)
    .flatMap((entry) => buildAttributeEffect(entry))
  const moduleAttack = sumAttribute(phase.attributeBlackboard, 'atk')
  const attackSpeedBonus = sumAttribute(phase.attributeBlackboard, 'attack_speed')
  const changes: OperatorModuleChange[] = []
  const affectedSources: OperatorModuleSourceRef[] = []
  const requiredPotentialRank = Math.max(
    0,
    (Number.isFinite(potentialRank) ? Math.round(potentialRank) : 1) - 1,
  )
  const unsupportedReasons: string[] = attributeEffects
    .filter((effect) => effect.status === 'UNSUPPORTED')
    .map((effect) => effect.reason)

  const tokenAttributeEntries = Object.values(phase.tokenAttributeBlackboard ?? {})
    .flatMap((blackboard) => normalizeBlackboard(blackboard))
  if (tokenAttributeEntries.length > 0) {
    const description = tokenAttributeEntries
      .flatMap((entry) => buildAttributeEffect(entry).map((effect) => `${effect.label} ${effect.valueLabel}`))
      .join('、')
    changes.push({
      kind: 'TOKEN',
      label: '召喚物の能力値補正',
      description: description || '能力値補正あり',
      talentIndex: null,
    })
    unsupportedReasons.push('召喚物・設置物に対するモジュール能力値補正は計算対象外です。')
  }

  for (const part of Array.isArray(phase.parts) ? phase.parts : []) {
    const traitCandidates = selectPotentialCandidates(
      part.overrideTraitDataBundle?.candidates,
      requiredPotentialRank,
    )
    const talentCandidates = selectPotentialCandidates(
      part.addOrOverrideTalentDataBundle?.candidates,
      requiredPotentialRank,
    )

    if (part.isToken) {
      appendTokenChanges(changes, traitCandidates, talentCandidates)
      if (traitCandidates.length > 0 || talentCandidates.length > 0) {
        unsupportedReasons.push('召喚物・設置物に対するモジュールの特性・素質変更は計算対象外です。')
      }
      continue
    }

    for (const candidate of traitCandidates) {
      applyTraitCandidate(passives, candidate)
      const descriptions = getTraitDescriptions(candidate)
      for (const description of descriptions) {
        changes.push({ kind: 'TRAIT', label: '特性変更', description, talentIndex: null })
      }
      const traitSource = passives.sources.find((source) => source.sourceKind === 'TRAIT')
      if (traitSource) affectedSources.push(toSourceRef(traitSource))
    }

    for (const candidate of talentCandidates) {
      const description = formatModuleDescription(
        candidate.upgradeDescription ?? candidate.description,
        candidate.blackboard,
      )
      const candidateName = cleanGameText(candidate.name ?? '')
      const talentIndex = resolveTalentIndex(passives, candidate)

      if (candidate.isHideTalent || talentIndex < 0) {
        const moduleSource: PassiveSource = {
          sourceKind: 'MODULE',
          sourceName: candidateName || moduleName,
          talentIndex: null,
          description,
          blackboard: normalizeBlackboard(candidate.blackboard),
          unlockCondition: candidate.unlockCondition,
          requiredPotentialRank: candidate.requiredPotentialRank ?? 0,
          prefabKey: candidate.prefabKey ?? null,
          tokenKey: candidate.tokenKey ?? null,
        }
        passives.sources.push(moduleSource)
        affectedSources.push(toSourceRef(moduleSource))
        changes.push({
          kind: 'TALENT',
          label: candidateName || '追加効果',
          description: description || formatBlackboardSummary(candidate.blackboard),
          talentIndex: null,
        })
        continue
      }

      const sourceIndex = passives.sources.findIndex((source) => (
        source.sourceKind === 'TALENT' && source.talentIndex === talentIndex
      ))
      if (sourceIndex < 0 || !passives.talents[talentIndex]) {
        unsupportedReasons.push(`モジュールによる素質${talentIndex + 1}の変更先を特定できません。`)
        continue
      }

      const currentSource = passives.sources[sourceIndex]
      const sourceName = candidateName || currentSource.sourceName
      const sourceDescription = description || currentSource.description
      const updatedSource: PassiveSource = {
        ...currentSource,
        sourceName,
        description: sourceDescription,
        blackboard: mergeBlackboards(currentSource.blackboard, normalizeBlackboard(candidate.blackboard)),
        prefabKey: candidate.prefabKey ?? currentSource.prefabKey,
        tokenKey: candidate.tokenKey ?? currentSource.tokenKey,
      }
      passives.sources[sourceIndex] = updatedSource
      passives.talents[talentIndex] = { name: sourceName, description: sourceDescription }
      affectedSources.push(toSourceRef(updatedSource))
      changes.push({
        kind: 'TALENT',
        label: sourceName,
        description: sourceDescription,
        talentIndex,
      })
    }
  }

  return {
    moduleName,
    moduleLevel,
    moduleAttack,
    attackSpeedBonus,
    passives,
    attributeEffects,
    changes: uniqueChanges(changes),
    affectedSources: uniqueSourceRefs(affectedSources),
    unsupportedReasons: [...new Set(unsupportedReasons)],
  }
}

function emptyApplication(passives: OperatorPassives): OperatorModuleApplication {
  return {
    moduleName: '',
    moduleLevel: 0,
    moduleAttack: 0,
    attackSpeedBonus: 0,
    passives,
    attributeEffects: [],
    changes: [],
    affectedSources: [],
    unsupportedReasons: [],
  }
}

function clonePassives(passives: OperatorPassives): OperatorPassives {
  return {
    traitDescription: passives.traitDescription,
    talents: passives.talents.map((talent) => ({ ...talent })),
    sources: passives.sources.map((source) => ({
      ...source,
      blackboard: source.blackboard.map((entry) => ({ ...entry })),
    })),
  }
}

function applyTraitCandidate(
  passives: OperatorPassives,
  candidate: RawOperatorModuleTraitCandidate,
) {
  const sourceIndex = passives.sources.findIndex((source) => source.sourceKind === 'TRAIT')
  const rawOverrideDescription = firstNonEmpty(
    candidate.overrideDescripton,
    candidate.overrideDescription,
  )
  const hasOverrideDescription = Boolean(rawOverrideDescription)
  const overrideDescription = formatModuleDescription(
    rawOverrideDescription,
    candidate.blackboard,
  )
  const additionalDescription = formatModuleDescription(
    candidate.additionalDescription,
    candidate.blackboard,
  )
  const nextDescription = [
    hasOverrideDescription ? overrideDescription : passives.traitDescription,
    additionalDescription,
  ].filter(Boolean).join(' ')
  if (sourceIndex < 0) {
    passives.sources.unshift({
      sourceKind: 'TRAIT',
      sourceName: '特性',
      talentIndex: null,
      description: nextDescription,
      blackboard: normalizeBlackboard(candidate.blackboard),
      unlockCondition: candidate.unlockCondition,
      requiredPotentialRank: candidate.requiredPotentialRank ?? 0,
      prefabKey: candidate.prefabKey ?? null,
      tokenKey: null,
    })
    passives.traitDescription = nextDescription
    return
  }

  const current = passives.sources[sourceIndex]
  const currentDescription = [
    hasOverrideDescription ? overrideDescription || current.description : current.description,
    additionalDescription,
  ].filter(Boolean).join(' ')
  passives.sources[sourceIndex] = {
    ...current,
    description: currentDescription,
    blackboard: mergeBlackboards(current.blackboard, normalizeBlackboard(candidate.blackboard)),
    prefabKey: candidate.prefabKey ?? current.prefabKey,
  }
  passives.traitDescription = currentDescription
}

function appendTokenChanges(
  changes: OperatorModuleChange[],
  traitCandidates: RawOperatorModuleTraitCandidate[],
  talentCandidates: RawOperatorModuleTalentCandidate[],
) {
  for (const candidate of traitCandidates) {
    for (const description of getTraitDescriptions(candidate)) {
      changes.push({ kind: 'TOKEN', label: '召喚物の特性変更', description, talentIndex: null })
    }
  }
  for (const candidate of talentCandidates) {
    changes.push({
      kind: 'TOKEN',
      label: cleanGameText(candidate.name ?? '') || '召喚物の素質変更',
      description: formatModuleDescription(
        candidate.upgradeDescription ?? candidate.description,
        candidate.blackboard,
      ) || formatBlackboardSummary(candidate.blackboard),
      talentIndex: candidate.talentIndex ?? null,
    })
  }
}

function getTraitDescriptions(candidate: RawOperatorModuleTraitCandidate): string[] {
  return [
    firstNonEmpty(candidate.overrideDescripton, candidate.overrideDescription),
    candidate.additionalDescription,
  ].map((description) => formatModuleDescription(description, candidate.blackboard))
    .filter((description): description is string => Boolean(description))
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value): value is string => Boolean(value?.trim()))
}

function resolveTalentIndex(
  passives: OperatorPassives,
  candidate: RawOperatorModuleTalentCandidate,
): number {
  if (typeof candidate.talentIndex === 'number') return candidate.talentIndex
  if (candidate.prefabKey) {
    const source = passives.sources.find((item) => (
      item.sourceKind === 'TALENT' && item.prefabKey === candidate.prefabKey
    ))
    if (typeof source?.talentIndex === 'number') return source.talentIndex
  }
  const name = cleanGameText(candidate.name ?? '')
  if (name) {
    const source = passives.sources.find((item) => (
      item.sourceKind === 'TALENT' && item.sourceName === name
    ))
    if (typeof source?.talentIndex === 'number') return source.talentIndex
  }
  return -1
}

function selectPotentialCandidates<T extends { requiredPotentialRank?: number }>(
  candidates: T[] | null | undefined,
  requiredPotentialRank: number,
): T[] {
  if (!Array.isArray(candidates)) return []
  const selectable = candidates.filter((candidate) => (
    (candidate.requiredPotentialRank ?? 0) <= requiredPotentialRank
  ))
  const selectedRank = Math.max(
    -1,
    ...selectable.map((candidate) => candidate.requiredPotentialRank ?? 0),
  )
  return selectable.filter((candidate) => (candidate.requiredPotentialRank ?? 0) === selectedRank)
}

function buildAttributeEffect(entry: RawBlackboardEntry): OperatorModuleAttributeEffect[] {
  const key = normalizeKey(entry.key)
  if (!key) return []
  const label = MODULE_ATTRIBUTE_LABELS[key] ?? entry.key ?? key
  const valueLabel = formatAttributeValue(entry, key)
  if (key === 'atk') {
    return [{
      key,
      label,
      valueLabel,
      status: 'APPLIED',
      reason: '基礎攻撃力へ加算します。',
    }]
  }
  if (key === 'attack_speed') {
    return [{
      key,
      label,
      valueLabel,
      status: 'APPLIED',
      reason: '攻撃間隔の算出に加えます。',
    }]
  }
  if (NON_DAMAGE_ATTRIBUTE_KEYS.has(key)) {
    return [{
      key,
      label,
      valueLabel,
      status: 'NO_DIRECT_EFFECT',
      reason: '現在の単体ダメージ出力を直接補正しません。',
    }]
  }
  return [{
    key,
    label,
    valueLabel,
    status: 'UNSUPPORTED',
    reason: `モジュール能力値「${entry.key ?? key}」の計算規則が登録されていません。`,
  }]
}

function sumAttribute(blackboard: RawBlackboardCollection | undefined, key: string): number {
  return normalizeBlackboard(blackboard).reduce((sum, entry) => (
    normalizeKey(entry.key) === key && typeof entry.value === 'number' && Number.isFinite(entry.value)
      ? sum + entry.value
      : sum
  ), 0)
}

function normalizeBlackboard(value: RawBlackboardCollection | undefined): RawBlackboardEntry[] {
  if (Array.isArray(value)) {
    return value.map((entry) => ({
      key: entry.key,
      value: entry.value,
      valueStr: entry.valueStr ?? null,
    }))
  }
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).map(([key, entryValue]) => ({
    key,
    value: typeof entryValue === 'number' ? entryValue : undefined,
    valueStr: typeof entryValue === 'string' ? entryValue : null,
  }))
}

function mergeBlackboards(
  base: RawBlackboardEntry[],
  overrides: RawBlackboardEntry[],
): RawBlackboardEntry[] {
  const merged = base.map((entry) => ({ ...entry }))
  for (const override of overrides) {
    const key = normalizeKey(override.key)
    const index = key ? merged.findIndex((entry) => normalizeKey(entry.key) === key) : -1
    if (index >= 0) merged[index] = { ...override }
    else merged.push({ ...override })
  }
  return merged
}

function formatModuleDescription(
  description: string | null | undefined,
  blackboard: RawBlackboardCollection | undefined,
): string {
  if (!description?.trim()) return ''
  const values = new Map(normalizeBlackboard(blackboard).flatMap((entry) => (
    entry.key ? [[entry.key, entry] as const] : []
  )))
  const formatted = description.replace(
    /\{(-?[^}:]+)(?::([^}]+))?\}/g,
    (placeholder, rawKey: string, format?: string) => {
      const negative = rawKey.startsWith('-')
      const key = negative ? rawKey.slice(1) : rawKey
      const entry = values.get(rawKey) ?? values.get(key)
      if (!entry) return placeholder
      if (typeof entry.value !== 'number') return entry.valueStr || placeholder
      return formatBlackboardValue(negative ? -entry.value : entry.value, format)
    },
  )
  return cleanGameText(formatted)
}

function formatBlackboardSummary(blackboard: RawBlackboardCollection | undefined): string {
  return normalizeBlackboard(blackboard)
    .map((entry) => `${entry.key ?? '値'}=${typeof entry.value === 'number' ? formatNumber(entry.value) : entry.valueStr ?? '—'}`)
    .join('、')
}

function formatBlackboardValue(value: number, format?: string): string {
  const percent = format?.includes('%') ?? false
  const decimalMatch = format?.match(/0\.(0+)/)
  const decimals = decimalMatch?.[1].length ?? (format?.includes('0') ? 0 : undefined)
  const normalized = percent ? value * 100 : value
  const formatted = decimals === undefined
    ? formatNumber(normalized)
    : normalized.toFixed(decimals)
  const signed = format?.includes('+') && normalized > 0 ? `+${formatted}` : formatted
  return percent ? `${signed}%` : signed
}

function formatAttributeValue(entry: RawBlackboardEntry, key: string): string {
  if (typeof entry.value === 'number' && Number.isFinite(entry.value)) {
    const suffix = key === 'respawn_time' ? '秒' : ''
    return `${entry.value >= 0 ? '+' : ''}${formatNumber(entry.value)}${suffix}`
  }
  return entry.valueStr?.trim() || '—'
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000)
}

function cleanGameText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeKey(key: string | undefined): string {
  return key?.trim().toLowerCase() ?? ''
}

function parsePhaseIndex(phase: string | undefined): number {
  const match = phase?.match(/(\d+)$/)
  return match ? Number(match[1]) : 0
}

function toSourceRef(source: PassiveSource): OperatorModuleSourceRef {
  return {
    sourceKind: source.sourceKind,
    sourceName: source.sourceName,
    talentIndex: source.talentIndex,
  }
}

function uniqueSourceRefs(values: OperatorModuleSourceRef[]): OperatorModuleSourceRef[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = `${value.sourceKind}:${value.talentIndex ?? 'none'}:${value.sourceName}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function uniqueChanges(values: OperatorModuleChange[]): OperatorModuleChange[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = `${value.kind}:${value.label}:${value.description}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
