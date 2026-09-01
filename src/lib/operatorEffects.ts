import type { DamageType } from './damageCalculator'
import type {
  OperatorPassives,
  PassiveSource,
  PassiveSourceKind,
} from './operatorProfile'
import type { RawBlackboardEntry } from '../types/skill'
import { getExplicitDamageTypes } from './skillDamageModel.ts'

export type OperatorEffectStatus =
  | 'APPLIED'
  | 'NOT_APPLIED'
  | 'REQUIRES_INPUT'
  | 'NO_DIRECT_EFFECT'
  | 'UNSUPPORTED'

export type OperatorEffectScope = 'SELF' | 'TARGET' | 'ATTACK' | 'OTHER'

export interface OperatorEffectModifiers {
  attackAddition: number
  attackMultiplierPercent: number
  attackSpeedBonus: number
  defenseIgnoreFixed: number
  resistanceIgnoreFixed: number
}

export interface EvaluatedOperatorEffect {
  sourceKind: PassiveSourceKind
  sourceName: string
  talentIndex: number | null
  label: string
  status: OperatorEffectStatus
  valueLabel: string
  reason: string
  scope: OperatorEffectScope
}

export interface OperatorEffectsEvaluation {
  recommendedDamageType: DamageType | null
  modifiers: OperatorEffectModifiers
  effects: EvaluatedOperatorEffect[]
}

type EffectAction =
  | 'ATTACK_ADDITION'
  | 'ATTACK_MULTIPLIER_PERCENT'
  | 'ATTACK_SPEED_BONUS'
  | 'DEFENSE_IGNORE_FIXED'
  | 'RESISTANCE_IGNORE_FIXED'
  | 'NONE'

interface OperatorEffectDefinition {
  operatorId: string
  sourceKind: PassiveSourceKind
  talentIndex: number | null
  blackboardKey: string | null
  label: string
  status: Extract<OperatorEffectStatus, 'APPLIED' | 'REQUIRES_INPUT' | 'NO_DIRECT_EFFECT'>
  reason: string
  scope: OperatorEffectScope
  action: EffectAction
  directImpact: boolean
  requiredDamageType?: DamageType
  formatValue?: (value: number | undefined) => string
}

// blackboard のキーは効果の適用先や条件を表さないため、
// オペレーター・出典・素質番号まで一致する既知の組み合わせだけを登録する。
const OPERATOR_EFFECT_DEFINITIONS: OperatorEffectDefinition[] = [
  {
    operatorId: 'char_350_surtr',
    sourceKind: 'TALENT',
    talentIndex: 0,
    blackboardKey: 'magic_resist_penetrate_fixed',
    label: '術耐性固定無視',
    status: 'APPLIED',
    reason: '攻撃対象の術耐性から固定値を差し引きます。',
    scope: 'TARGET',
    action: 'RESISTANCE_IGNORE_FIXED',
    directImpact: true,
    requiredDamageType: 'ARTS',
    formatValue: formatUnsignedNumber,
  },
  {
    operatorId: 'char_350_surtr',
    sourceKind: 'TALENT',
    talentIndex: 1,
    blackboardKey: 'surtr_t_2[withdraw].interval',
    label: '強制退場までの時間',
    status: 'NO_DIRECT_EFFECT',
    reason: '致命的なダメージを受けた後の退場時刻であり、1回の攻撃ダメージを直接補正しません。',
    scope: 'SELF',
    action: 'NONE',
    directImpact: false,
    formatValue: formatSeconds,
  },
  {
    operatorId: 'char_103_angel',
    sourceKind: 'TRAIT',
    talentIndex: null,
    blackboardKey: null,
    label: '攻撃対象の優先',
    status: 'NO_DIRECT_EFFECT',
    reason: '飛行ユニットを優先する効果は、単体へのダメージ量を直接補正しません。',
    scope: 'ATTACK',
    action: 'NONE',
    directImpact: false,
  },
  {
    operatorId: 'char_103_angel',
    sourceKind: 'TALENT',
    talentIndex: 0,
    blackboardKey: 'attack_speed',
    label: '攻撃速度',
    status: 'APPLIED',
    reason: '攻撃速度を攻撃間隔の算出に加えます。',
    scope: 'SELF',
    action: 'ATTACK_SPEED_BONUS',
    directImpact: true,
    formatValue: formatSignedNumber,
  },
  {
    operatorId: 'char_103_angel',
    sourceKind: 'TALENT',
    talentIndex: 1,
    blackboardKey: 'atk',
    label: '攻撃力補正B',
    status: 'APPLIED',
    reason: '自身に常時適用される攻撃力割合を攻撃力補正Bへ加えます。',
    scope: 'SELF',
    action: 'ATTACK_MULTIPLIER_PERCENT',
    directImpact: true,
    formatValue: formatSignedRatioPercent,
  },
  {
    operatorId: 'char_103_angel',
    sourceKind: 'TALENT',
    talentIndex: 1,
    blackboardKey: 'max_hp',
    label: '最大HP',
    status: 'NO_DIRECT_EFFECT',
    reason: '最大HPの変化は、現在のダメージ出力を直接補正しません。',
    scope: 'SELF',
    action: 'NONE',
    directImpact: false,
    formatValue: formatSignedRatioPercent,
  },
  {
    operatorId: 'char_172_svrash',
    sourceKind: 'TRAIT',
    talentIndex: null,
    blackboardKey: 'atk_scale',
    label: '遠距離攻撃時の攻撃力補正E',
    status: 'REQUIRES_INPUT',
    reason: '遠距離攻撃かどうかを選択する条件入力がないため、自動適用しません。',
    scope: 'ATTACK',
    action: 'NONE',
    directImpact: true,
    formatValue: formatRatioPercent,
  },
  {
    operatorId: 'char_172_svrash',
    sourceKind: 'TALENT',
    talentIndex: 0,
    blackboardKey: 'atk',
    label: '攻撃力補正B',
    status: 'APPLIED',
    reason: '自身に常時適用される攻撃力割合を攻撃力補正Bへ加えます。',
    scope: 'SELF',
    action: 'ATTACK_MULTIPLIER_PERCENT',
    directImpact: true,
    formatValue: formatSignedRatioPercent,
  },
  {
    operatorId: 'char_172_svrash',
    sourceKind: 'TALENT',
    talentIndex: 0,
    blackboardKey: 'respawn_time',
    label: '再配置時間',
    status: 'NO_DIRECT_EFFECT',
    reason: '再配置時間の変化は、配置中のダメージ出力を直接補正しません。',
    scope: 'OTHER',
    action: 'NONE',
    directImpact: false,
    formatValue: formatSignedRatioPercent,
  },
  {
    operatorId: 'char_172_svrash',
    sourceKind: 'TALENT',
    talentIndex: 1,
    blackboardKey: null,
    label: 'ステルス無効',
    status: 'NO_DIRECT_EFFECT',
    reason: 'ステルス無効は、攻撃が命中した場合のダメージ量を直接補正しません。',
    scope: 'TARGET',
    action: 'NONE',
    directImpact: false,
  },
]

export function evaluateOperatorEffects(
  operatorId: string,
  passives: OperatorPassives,
  selectedDamageType?: DamageType | null,
): OperatorEffectsEvaluation {
  const modifiers = createEmptyModifiers()
  const effects: EvaluatedOperatorEffect[] = []
  let recommendedDamageType: DamageType | null = null
  const sources = passives.sources?.length
    ? passives.sources
    : createFallbackSources(passives)

  for (const source of sources) {
    const sourceEffects: EvaluatedOperatorEffect[] = []
    let hasRegisteredDirectEffect = false
    const matchedKeys = new Set<string>()
    // A talent can describe additional damage without changing the operator's
    // normal attack type. Only the trait is authoritative for this default.
    const explicitDamageType = source.sourceKind === 'TRAIT'
      ? inferDamageTypeFromText(source.description)
      : null

    if (explicitDamageType) {
      recommendedDamageType ??= explicitDamageType
      const matchesSelection = selectedDamageType === undefined
        || selectedDamageType === explicitDamageType
      sourceEffects.push(createEffect(source, {
        label: 'ダメージ種別',
        status: matchesSelection ? 'APPLIED' : 'NOT_APPLIED',
        valueLabel: damageTypeLabel(explicitDamageType),
        reason: matchesSelection
          ? `特性に${damageTypeLabel(explicitDamageType)}ダメージが明示されています。`
          : selectedDamageType === null
            ? 'ダメージ種別を自動判定できないため、この効果は計算に適用しません。'
            : `特性は${damageTypeLabel(explicitDamageType)}ダメージですが、計算対象は${damageTypeLabel(selectedDamageType)}ダメージです。`,
        scope: 'ATTACK',
      }))
      hasRegisteredDirectEffect = true
    }

    const definitions = OPERATOR_EFFECT_DEFINITIONS.filter((definition) => (
      definition.operatorId === operatorId
      && definition.sourceKind === source.sourceKind
      && definition.talentIndex === source.talentIndex
    ))

    for (const definition of definitions) {
      const entry = definition.blackboardKey === null
        ? undefined
        : findBlackboardEntry(source.blackboard, definition.blackboardKey)
      if (definition.blackboardKey !== null && !entry) continue
      if (definition.blackboardKey !== null) matchedKeys.add(definition.blackboardKey)

      const damageTypeMatches = !definition.requiredDamageType
        || selectedDamageType === undefined
        || definition.requiredDamageType === selectedDamageType
      const status = damageTypeMatches ? definition.status : 'NOT_APPLIED'
      const value = numericValue(entry)
      if (status === 'APPLIED') applyDefinition(modifiers, definition.action, value)
      if (definition.directImpact) hasRegisteredDirectEffect = true

      sourceEffects.push(createEffect(source, {
        label: definition.label,
        status,
        valueLabel: definition.formatValue?.(value) ?? '—',
        reason: damageTypeMatches
          ? definition.reason
          : selectedDamageType === null
            ? 'ダメージ種別を自動判定できないため、この種別限定効果は計算に適用しません。'
            : `${damageTypeLabel(definition.requiredDamageType as DamageType)}ダメージにだけ影響するため、現在のダメージ種別には適用しません。`,
        scope: definition.scope,
      }))
    }

    const unregisteredDirectEntries = source.blackboard.filter((entry) => {
      const key = normalizeKey(entry.key)
      return key !== '' && !matchedKeys.has(key) && looksLikeDirectEffectKey(key)
    })
    for (const entry of unregisteredDirectEntries) {
      sourceEffects.push(createEffect(source, {
        label: '未登録の直接効果',
        status: 'UNSUPPORTED',
        valueLabel: formatRawEntry(entry),
        reason: `blackboard「${entry.key}」の計算規則が登録されていません。`,
        scope: 'OTHER',
      }))
    }

    if (
      hasDirectDamageEffect(source.description)
      && !hasRegisteredDirectEffect
      && unregisteredDirectEntries.length === 0
    ) {
      sourceEffects.push(createEffect(source, {
        label: '未登録の直接効果',
        status: 'UNSUPPORTED',
        valueLabel: '—',
        reason: '説明文にダメージ計算へ影響する効果がありますが、計算規則が登録されていません。',
        scope: 'OTHER',
      }))
    }

    if (sourceEffects.length === 0) {
      sourceEffects.push(createEffect(source, {
        label: source.sourceKind === 'TRAIT' ? '特性' : '素質',
        status: 'NO_DIRECT_EFFECT',
        valueLabel: '—',
        reason: '現在の単体ダメージ計算へ直接影響する効果はありません。',
        scope: 'OTHER',
      }))
    }

    effects.push(...sourceEffects)
  }

  return {
    recommendedDamageType,
    modifiers: roundModifiers(modifiers),
    effects,
  }
}

export function getPassiveSourceStatus(
  operatorId: string,
  source: PassiveSource | null | undefined,
  selectedDamageType?: DamageType | null,
): OperatorEffectStatus {
  if (!source) return 'NO_DIRECT_EFFECT'
  const evaluation = evaluateOperatorEffects(operatorId, {
    traitDescription: source.sourceKind === 'TRAIT' ? source.description : '',
    talents: [],
    sources: [source],
  }, selectedDamageType)
  const statuses = new Set(evaluation.effects.map((effect) => effect.status))
  const priority: OperatorEffectStatus[] = [
    'UNSUPPORTED',
    'REQUIRES_INPUT',
    'APPLIED',
    'NOT_APPLIED',
    'NO_DIRECT_EFFECT',
  ]
  return priority.find((status) => statuses.has(status)) ?? 'NO_DIRECT_EFFECT'
}

function createEmptyModifiers(): OperatorEffectModifiers {
  return {
    attackAddition: 0,
    attackMultiplierPercent: 0,
    attackSpeedBonus: 0,
    defenseIgnoreFixed: 0,
    resistanceIgnoreFixed: 0,
  }
}

function createFallbackSources(passives: OperatorPassives): PassiveSource[] {
  if (!passives.traitDescription) return []
  return [{
    sourceKind: 'TRAIT',
    sourceName: '特性',
    talentIndex: null,
    description: passives.traitDescription,
    blackboard: [],
    requiredPotentialRank: 0,
    prefabKey: null,
    tokenKey: null,
  }]
}

function createEffect(
  source: PassiveSource,
  effect: Omit<EvaluatedOperatorEffect, 'sourceKind' | 'sourceName' | 'talentIndex'>,
): EvaluatedOperatorEffect {
  return {
    sourceKind: source.sourceKind,
    sourceName: source.sourceName,
    talentIndex: source.talentIndex,
    ...effect,
  }
}

function applyDefinition(
  modifiers: OperatorEffectModifiers,
  action: EffectAction,
  value: number | undefined,
) {
  if (value === undefined) return
  if (action === 'ATTACK_ADDITION') modifiers.attackAddition += value
  if (action === 'ATTACK_MULTIPLIER_PERCENT') modifiers.attackMultiplierPercent += value * 100
  if (action === 'ATTACK_SPEED_BONUS') modifiers.attackSpeedBonus += value
  if (action === 'DEFENSE_IGNORE_FIXED') modifiers.defenseIgnoreFixed += value
  if (action === 'RESISTANCE_IGNORE_FIXED') modifiers.resistanceIgnoreFixed += value
}

function findBlackboardEntry(
  blackboard: RawBlackboardEntry[],
  key: string,
): RawBlackboardEntry | undefined {
  return blackboard.find((entry) => normalizeKey(entry.key) === key)
}

function numericValue(entry: RawBlackboardEntry | undefined): number | undefined {
  return typeof entry?.value === 'number' && Number.isFinite(entry.value)
    ? entry.value
    : undefined
}

function normalizeKey(key: string | undefined): string {
  return key?.trim().toLowerCase() ?? ''
}

function inferDamageTypeFromText(description: string): DamageType | null {
  const explicitTypes = getExplicitDamageTypes(description)
  return explicitTypes.length === 1 ? explicitTypes[0] : null
}

function hasDirectDamageEffect(description: string): boolean {
  return /攻撃力|攻撃速度|攻撃間隔|防御力.{0,16}無視|術耐性.{0,16}無視|追加.{0,16}ダメージ|与えるダメージ|ダメージを与|連撃|会心/.test(description)
}

function looksLikeDirectEffectKey(key: string): boolean {
  return key === 'atk'
    || key.includes('atk_scale')
    || key.includes('attack_speed')
    || key.includes('base_attack_time')
    || key.includes('damage_scale')
    || key.includes('def_penetrate')
    || key.includes('magic_resist_penetrate')
}

function formatRawEntry(entry: RawBlackboardEntry): string {
  if (typeof entry.value === 'number') return `${entry.key}=${formatNumber(entry.value)}`
  if (entry.valueStr) return `${entry.key}=${entry.valueStr}`
  return entry.key ?? '—'
}

function damageTypeLabel(type: DamageType): string {
  if (type === 'ARTS') return '術'
  if (type === 'PHYSICAL') return '物理'
  return '確定'
}

function formatUnsignedNumber(value: number | undefined): string {
  return value === undefined ? '—' : formatNumber(value)
}

function formatSignedNumber(value: number | undefined): string {
  if (value === undefined) return '—'
  return `${value >= 0 ? '+' : ''}${formatNumber(value)}`
}

function formatRatioPercent(value: number | undefined): string {
  return value === undefined ? '—' : `${formatNumber(value * 100)}%`
}

function formatSignedRatioPercent(value: number | undefined): string {
  if (value === undefined) return '—'
  return `${value >= 0 ? '+' : ''}${formatNumber(value * 100)}%`
}

function formatSeconds(value: number | undefined): string {
  return value === undefined ? '—' : `${formatNumber(value)}秒`
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round(value, 4))
}

function roundModifiers(modifiers: OperatorEffectModifiers): OperatorEffectModifiers {
  return {
    attackAddition: round(modifiers.attackAddition, 6),
    attackMultiplierPercent: round(modifiers.attackMultiplierPercent, 6),
    attackSpeedBonus: round(modifiers.attackSpeedBonus, 6),
    defenseIgnoreFixed: round(modifiers.defenseIgnoreFixed, 6),
    resistanceIgnoreFixed: round(modifiers.resistanceIgnoreFixed, 6),
  }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
