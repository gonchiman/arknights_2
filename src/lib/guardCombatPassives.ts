import type { SkillRecord } from '../types/skill.ts'
import { getOperatorPassives, type PassiveSource } from './operatorProfile.ts'
import { buildGuardTalentStructures, getGuardTalentIdentity } from './guardTalentStructure.ts'
import { applyGuardTalentStructure } from './guardTalentEvaluation.ts'
import { getExpandedDefinition } from './expandedCombatRegistry.ts'
import { evaluateExpandedPassives } from './expandedCombatEvaluation.ts'
import type { GuardCalculationIssue, GuardConditions, GuardInput, GuardPassiveModifiers, GuardStage } from './guardCombatTypes.ts'

type Context = { kind: 'NORMAL' | 'NEXT_ATTACK' | 'SKILL_ACTION'; skillIndex: number; stageId: string;
  stage?: Pick<GuardStage, 'actions'>; phaseIndex?: number; operatorLevel?: number }

export interface GuardPassiveCalculationConstraint extends GuardCalculationIssue {
  readonly talentIndex: number
  readonly reason: string
  /** Absent when no currently implemented condition can resolve the blocker. */
  readonly supportedCondition?: string
  readonly allows: (conditions: GuardConditions, read: (key: string) => number) => boolean
}

/** Calculation blockers and their supported scope are shared with the coverage page.
 * Input validation and missing/corrupt source data are deliberately not coverage states.
 */
export function getGuardPassiveCalculationConstraints(operatorId: string, context: Context): readonly GuardPassiveCalculationConstraint[] {
  if (operatorId === 'char_2024_chyue' && context.skillIndex === 2) return [{
    id: 'chyue-s2-levitation-talent-order', relatedSections: ['スキル', '素質1'],
    talentIndex: 0,
    reason: '浮遊解除前後で止戈の適用が変わる処理順を、攻撃ごとに解決する必要があります。',
    allows: () => false,
  }]
  if (operatorId === 'char_4037_demetr') return [{
    id: 'demetr-target-hp-damage-curve', relatedSections: ['素質1'],
    talentIndex: 0,
    reason: 'HP20〜100%の間の与ダメージ増加曲線が未確定です。',
    supportedCondition: '対象のHPが100%、または20%以下',
    allows: (conditions, read) => Number(conditions.targetHpPercent) / 100 >= read('min_hp_ratio')
      || Number(conditions.targetHpPercent) / 100 <= read('max_hp_ratio'),
  }, {
    id: 'demetr-defense-stack-timing', relatedSections: ['素質1'],
    talentIndex: 0,
    reason: '攻撃による防御力低下の新規付与と、連撃中の重複数変化を解決する必要があります。',
    supportedCondition: `防御力低下が重複上限の${context.skillIndex === 2 ? 8 : 5}回に到達済み`,
    allows: (conditions, read) => Number(conditions.defenseDebuffStacks)
      >= read(context.skillIndex === 2 ? 'attack@s2_limited_stack_cnt' : 'attack@limited_stack_cnt'),
  }]
  if (operatorId === 'char_4116_blkkgt' && context.kind !== 'NORMAL') return [{
    id: 'blkkgt-tremble-defense-ignore-order', relatedSections: ['スキル', '素質1', '素質2'],
    talentIndex: 0,
    reason: '連撃中の戦慄付与と防御無視の適用順序を確定する必要があります。',
    supportedCondition: '攻撃開始前から対象が戦慄中',
    allows: conditions => conditions.targetTrembling === true,
  }]
  if (operatorId === 'char_1050_chen3') return [{
    id: 'chen3-weakpoint-mitigation', relatedSections: ['素質1'],
    talentIndex: 0,
    reason: '弱点ダメージの防御力・術耐性への適用式が未確定です。',
    allows: () => false,
  }]
  return []
}
const numberInput = (key: string, label: string, min: number, max: number, defaultValue = min, step = 1): GuardInput =>
  ({ key, label, kind: 'number', min, max, defaultValue, step })
const booleanInput = (key: string, label: string, defaultValue = false): GuardInput =>
  ({ key, label, kind: 'boolean', defaultValue, options: [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] })
const HP = numberInput('selfHpPercent', '自身のHP（%）', 0, 100, 100, 0.1)
const BLOCKED = booleanInput('targetBlockedBySelf', '対象を自身でブロック')
const STUN = booleanInput('targetStunnedOrBound', '対象がスタン・バインド中')
const SLOW = booleanInput('targetSlowedOrBound', '対象が足止め・バインド中')
const TREMBLE = booleanInput('targetTrembling', '対象が戦慄中')

/** Reviewed inputs are shared by the skill recipes and passives evaluator. */
const INPUTS: Readonly<Record<string, readonly GuardInput[]>> = {
  char_264_f12yin: [],
  char_2024_chyue: [booleanInput('talentActive', '止戈の効果が対象に適用中')],
  char_4037_demetr: [numberInput('targetHpPercent', '対象のHP（%）', 0, 100, 100, 0.1),
    numberInput('defenseDebuffStacks', '防御力低下の重複数', 0, 8)],
  char_4082_qiubai: [SLOW, { key: 'attackDistanceType', label: '攻撃距離', kind: 'select', defaultValue: 'MELEE',
    options: [{ value: 'MELEE', label: '近接' }, { value: 'RANGED', label: '遠距離' }] }],
  char_4182_oblvns: [numberInput('noteCount', '戦場中の音符数', 0, 10), booleanInput('selfInTalentRange', '自身が攻撃速度上昇の対象')],
  char_4088_hodrer: [STUN],
  char_4145_ulpia: [numberInput('killStacks', '育まれし血脈の重複数', 0, 9)],
  char_4058_pepe: [],
  char_1051_headb2: [numberInput('terrainHitCount', '対象に命中する高台効果の回数', 0, 100)],
  char_010_chen: [],
  char_4116_blkkgt: [TREMBLE, booleanInput('targetBlocked', '対象がブロックされている')],
  char_017_huang: [],
  char_1026_gvial2: [numberInput('blockedEnemyCount', '自身がブロックしている敵数', 0, 5)],
  char_4098_vvana: [booleanInput('eliteInRange', '攻撃範囲内にエリート・ボス')],
  char_1019_siege2: [numberInput('nearbyAllyCount', '周囲8マスの味方数', 0, 8)],
  char_1050_chen3: [],
  char_188_helage: [HP],
  char_4121_zuole: [HP],
  char_485_pallas: [HP, BLOCKED],
  char_1014_nearl2: [],
  char_4011_lessng: [booleanInput('recentDamageTaken', '被ダメージ後15秒の効果が有効')],
  char_1032_excu2: [numberInput('ammoSpent', 'スキル中に消費した弾薬数', 0, 100)],
  char_4010_etlchi: [booleanInput('dotActive', '対象に術の継続ダメージが付与中', true)],
  char_4064_mlynar: [numberInput('traitChargePercent', '特性の攻撃力蓄積（%）', 0, 100, 100, 0.1),
    numberInput('nearbyEnemyCount', '周囲の敵数', 0, 100), numberInput('skillKillCount', '今回のスキル中の撃破数', 0, 100)],
  char_1043_leizi2: [numberInput('traitChargePercent', '特性の攻撃力蓄積（%）', 0, 100, 100, 0.1)],
}

export const GUARD_PASSIVE_OPERATOR_IDS: readonly string[] = Object.freeze(Object.keys(INPUTS))

/** Registered source identities remain available even if a live profile is incomplete. */
export function getGuardRegisteredTalentNames(operatorId: string): readonly string[] {
  const expanded = getExpandedDefinition(operatorId)
  if (expanded) return expanded.talents.map(talent => talent.name)
  return getGuardTalentIdentity(operatorId).map(({ name }) => name)
}

export function getGuardPassiveInputs(operatorId: string): GuardInput[] {
  return (getExpandedDefinition(operatorId)?.inputs ?? INPUTS[operatorId] ?? []).map(input => ({ ...input }))
}

/** Evaluate source-selected potential-1 talents. Missing sources/values fail closed. */
export function evaluateGuardPassives(operator: SkillRecord, conditions: GuardConditions, context: Context): GuardPassiveModifiers {
  return evaluateGuardPassiveDefinitions(operator, conditions, context, false)
}

/** Inspect the same source branches without treating live data validation as coverage.
 * Numerical modifiers from this inspection are intentionally not exposed.
 */
export function describeGuardPassiveEffects(operator: SkillRecord, conditions: GuardConditions, context: Context): {
  source: string; relevant: boolean
}[] {
  return evaluateGuardPassiveDefinitions(operator, conditions, context, true).evaluations.map(evaluation => ({
    source: evaluation.source, relevant: evaluation.status !== 'NOT_RELEVANT',
  }))
}

function evaluateGuardPassiveDefinitions(operator: SkillRecord, conditions: GuardConditions, context: Context,
  registrationOnly: boolean): GuardPassiveModifiers {
  if (getExpandedDefinition(operator.operatorId)) return evaluateExpandedPassives(operator, conditions, context, registrationOnly)
  const output: GuardPassiveModifiers = { attackRatio: 0, attackFlat: 0, attackScale: 1, attackSpeed: 0,
    damageScale: 1, defenseIgnoreRatio: 0, defenseIgnoreFixed: 0, resistanceIgnoreFixed: 0,
    resistanceIgnoreRatio: 0, defenseReductionRatio: 0, critChance: 0, critScale: 1,
    additionalActions: [], evaluations: [], blockers: [], notes: [] }
  type RowSource = string | Pick<PassiveSource, 'sourceKind' | 'sourceName' | 'talentIndex'>
  type RowDetails = Pick<GuardPassiveModifiers['evaluations'][number], 'probability' | 'timing' | 'condition'>
  const row = (source: RowSource, item: string, value: string,
    status: GuardPassiveModifiers['evaluations'][number]['status'], reason = '', details: RowDetails = {}) =>
    output.evaluations.push({ source: typeof source === 'string' ? source : source.sourceName,
      ...(typeof source === 'string' ? {} : { sourceKind: source.sourceKind === 'TRAIT' || source.sourceKind === 'TALENT' ? source.sourceKind : undefined,
        ...(source.talentIndex === null ? {} : { talentIndex: source.talentIndex }) }),
      item, value, status, reason, ...details })
  const block = (source: RowSource, reason: string) => {
    if (registrationOnly) return
    output.blockers.push(`${typeof source === 'string' ? source : source.sourceName}：${reason}`)
    row(source, '計算条件', '未確定', 'UNSUPPORTED', reason)
  }
  const irrelevant = (source: PassiveSource, reason = '1攻撃・発動1回の直接ダメージと攻撃中のDPSには加算しません。') =>
    row(source, '生存・SP・配置等', '—', 'NOT_RELEVANT', reason)
  if (!(operator.operatorId in INPUTS)) {
    block('素質・特性', 'このオペレーターの効果定義を取得できません。')
    return output
  }
  const values: Record<string, number | boolean | string | undefined> = { ...conditions }
  for (const input of INPUTS[operator.operatorId]) {
    const value = conditions[input.key] ?? input.defaultValue
    values[input.key] = value
    const numeric = input.kind === 'number'
    if ((numeric && (typeof value !== 'number' || !Number.isFinite(value)
      || value < (input.min ?? -Infinity) || value > (input.max ?? Infinity)
      || (input.step === 1 && !Number.isInteger(value))))
      || (input.kind === 'boolean' && typeof value !== 'boolean')
      || (input.kind === 'select' && !input.options?.some(option => option.value === value))) {
      block(input.label, '入力値が有効範囲外です。')
    }
  }
  if (output.blockers.length) return output
  const selected = getOperatorPassives(operator.operatorProfile, 2,
    operator.operatorProfile.phases[2]?.maxLevel ?? 90, 1).sources
  const talents: PassiveSource[] = registrationOnly ? getGuardTalentIdentity(operator.operatorId).map(({ name, prefabKey }, talentIndex) => ({
    sourceKind: 'TALENT', talentIndex, sourceName: name, prefabKey,
    description: selected.find(source => source.talentIndex === talentIndex)?.description ?? '',
    blackboard: selected.find(source => source.talentIndex === talentIndex)?.blackboard ?? [],
    requiredPotentialRank: 0, tokenKey: null, unlockCondition: { phase: 'PHASE_2', level: 1 },
  })) : selected.filter(source => source.sourceKind === 'TALENT')
  for (const index of [0, 1]) if (!talents.some(source => source.talentIndex === index))
    block({ sourceKind: 'TALENT', sourceName: getGuardTalentIdentity(operator.operatorId)[index]?.name ?? `素質${index + 1}`,
      talentIndex: index }, '昇進2・潜在1の素質を取得できません。')
  const read = (source: PassiveSource, key: string) => {
    const value = source.blackboard.find(entry => entry.key?.toLowerCase() === key.toLowerCase())?.value
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      block(source, `参照値「${key}」を取得できません。`)
      return 0
    }
    return value
  }
  const skill = operator.skillLevels[9] ?? operator.raw
  const structures = buildGuardTalentStructures([operator], { phaseIndex: 2,
    operatorLevel: operator.operatorProfile.phases[2]?.maxLevel ?? 90 }, registrationOnly)
  const metrics: Record<string, number | boolean | string | undefined> = {
    ...values, skillIndex: context.skillIndex, actionKind: context.kind,
    'recipient.hpRatio': typeof values.selfHpPercent === 'number' ? values.selfHpPercent / 100 : undefined,
    'recipient.inSourceAttackRange': values.selfInTalentRange,
    'source.skillActive': true,
    'source.profession': operator.profession,
    'attack.damageType': context.stage?.actions.length
      && context.stage.actions.every(action => action.damageType === context.stage?.actions[0].damageType)
      ? context.stage.actions[0].damageType : undefined,
  }
  const affiliation = operator.operatorProfile.affiliationIds
  const affiliationIds = affiliation ? [affiliation.nationId, affiliation.groupId, affiliation.teamId] : undefined
  for (const id of new Set(structures.flatMap(structure => structure.effects.flatMap(effect => effect.target.factionIds)))) {
    metrics[`source.faction.${id}`] = affiliationIds?.includes(id) ? true
      : affiliationIds?.every(value => value === null || (typeof value === 'string' && value.trim().length > 0)) ? false : undefined
  }
  for (const entry of skill.blackboard ?? []) {
    if (entry.key && typeof entry.value === 'number' && Number.isFinite(entry.value)) {
      metrics[`skill.${entry.key}`] = entry.value
      metrics[`skill.${entry.key.toLowerCase()}`] = entry.value
    }
  }
  for (const source of talents) {
    const index = source.talentIndex
    const definition = index === null ? null : getGuardTalentIdentity(operator.operatorId)[index]
    if (!definition || source.sourceName !== definition.name || source.prefabKey !== definition.prefabKey
      || source.requiredPotentialRank !== 0 || source.unlockCondition?.phase !== 'PHASE_2') {
      if (!definition && !source.description) irrelevant(source, '説明・計算値のない補助定義です。')
      else block(source, '昇進2・潜在1の確認済み素質と名称・識別子・解放条件が一致しません。')
      continue
    }
    for (const constraint of getGuardPassiveCalculationConstraints(operator.operatorId, context)) {
      if (constraint.talentIndex === index && !constraint.allows(values, key => read(source, key)))
        block(source, constraint.reason)
    }
    const structure = structures.find(entry => entry.basicInfo.talentIndex === index)
    if (!structure) { block(source, '昇進2・潜在1の素質構造を取得できません。'); continue }
    applyGuardTalentStructure(output, structure, metrics, registrationOnly)
  }
  if (![output.attackRatio, output.attackFlat, output.attackScale, output.attackSpeed, output.damageScale,
    output.defenseIgnoreRatio, output.defenseIgnoreFixed, output.resistanceIgnoreFixed,
    output.resistanceIgnoreRatio, output.defenseReductionRatio, output.critChance, output.critScale].every(Number.isFinite)) {
    block('素質・特性', '計算値が有限数になりません。')
  }
  if ([output.critChance, output.defenseIgnoreRatio, output.resistanceIgnoreRatio,
    output.defenseReductionRatio].some(value => value < 0 || value > 1)
    || output.critScale < 0 || output.attackScale < 0 || output.damageScale < 0
    || output.attackRatio < -1 || output.resistanceIgnoreFixed < 0 || output.defenseIgnoreFixed < 0) {
    block('素質・特性', '発動確率・防御無視・倍率の参照値が有効範囲外です。')
  }
  output.blockers = [...new Set(output.blockers)]
  output.notes = [...new Set(output.notes)]
  return output
}
