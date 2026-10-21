import { DATA_SOURCE_URLS } from './dataSources.ts'
import { getOperatorPassives, type PassiveSource } from './operatorProfile.ts'
import { formatSkillStructureEffectItem, type SkillStructureEffect } from './skillStructure.ts'
import {
  formatCombatCondition, formatCombatTiming, formatCombatRecipient, formatCombatNumericValue, formatCombatNumber as number,
  getCombatContextDefinitionRows, getCombatDotDefinitionRows, getCombatNumericDefinitionRows,
  type CombatCondition, type CombatTiming, type CombatRecipientSelector, type CombatNumericValue,
  type CombatEffectContext, type CombatDamageOverTime,
} from './combatEffectStructure.ts'
import type { TalentCoarseCategory } from './talentCoarseClassification.ts'
import type { RawBlackboardEntry, RawUnlockCondition, SkillRecord } from '../types/skill.ts'

export const TALENT_STRUCTURE_OPERATOR_IDS = ['char_172_svrash', 'char_263_skadi', 'char_350_surtr', 'char_293_thorns'] as const
export interface TalentStructureSelection { readonly operatorId: string; readonly talentIndex: number }

export type TalentStructureCondition = CombatCondition
export type TalentStructureTiming = CombatTiming
export type TalentStructureTarget = CombatRecipientSelector

// Keep the existing skill's item/operation/unit/value contract for shared effects.
type SkillAtkPayload = Pick<Extract<SkillStructureEffect, { operation: 'ADD_RATIO'; unit: 'RATIO' }>, 'item' | 'operation' | 'unit' | 'value'> & { item: 'ATK_BUFF_RATIO' }
type SkillHealPayload = Pick<Extract<SkillStructureEffect, { item: 'HP_RESTORE_RATIO' }>, 'item' | 'operation' | 'unit' | 'value'>
type NumericValue<T> = T extends { value: unknown } ? Omit<T, 'value'> & { readonly value: CombatNumericValue } : never
type TalentStructureEffectPayload = NumericValue<SkillAtkPayload | SkillHealPayload>
  | { readonly item: 'REDEPLOY_TIME'; readonly operation: 'ADD_RATIO'; readonly value: CombatNumericValue; readonly unit: 'RATIO' }
  | { readonly item: 'REDEPLOY_TIME'; readonly operation: 'ADD_VALUE'; readonly value: CombatNumericValue; readonly unit: 'SECOND' }
  | { readonly item: 'RESISTANCE_IGNORE_FIXED'; readonly operation: 'IGNORE_FIXED'; readonly value: CombatNumericValue; readonly unit: 'POINT' }
  | { readonly item: 'STEALTH'; readonly operation: 'SET_ENABLED'; readonly value: false; readonly unit: 'BOOLEAN' }
  | { readonly item: 'HP'; readonly operation: 'SET'; readonly value: CombatNumericValue; readonly unit: 'POINT' }
  | { readonly item: 'FORCED_RETREAT'; readonly operation: 'EXECUTE'; readonly value: true; readonly unit: 'BOOLEAN' }
  // The context lifetime describes this application operation only; damage.duration is the sole
  // lifetime of the applied DOT. No independent top-level amount or duration may drift from it.
  | { readonly item: 'DAMAGE_OVER_TIME'; readonly operation: 'DEAL_DAMAGE'; readonly damage: CombatDamageOverTime; readonly lifetime: { readonly type: 'CURRENT_EVENT' }; readonly value?: never; readonly unit?: never }

export type TalentStructureEffect = TalentStructureEffectPayload & CombatEffectContext

export interface TalentStructureDeferredCase {
  readonly id: string; readonly title: string; readonly status: 'DEFERRED'
  readonly unresolved: string; readonly currentTreatment: string; readonly impact: string; readonly resumeWhen: string
  readonly references: readonly { readonly label: string; readonly href: string; readonly external: boolean }[]
}
export interface TalentStructure {
  readonly basicInfo: TalentStructureSelection & {
    readonly operatorName: string; readonly talentName: string; readonly phaseIndex: number
    readonly operatorLevel: number; readonly potentialRank: 1; readonly module: 'NONE'
  }
  readonly classificationInfo: { readonly coarseCategories: readonly TalentCoarseCategory[] }
  readonly activationSettings: { readonly activationMethod: 'PASSIVE'; readonly triggers: readonly TalentStructureTiming[] }
  readonly effects: readonly TalentStructureEffect[]
  readonly source: {
    readonly description: string; readonly blackboard: readonly RawBlackboardEntry[]
    readonly requiredPotentialRank: number; readonly unlockCondition?: RawUnlockCondition
    readonly prefabKey: string | null
  }
  readonly deferred: readonly TalentStructureDeferredCase[]
  readonly issues: readonly string[]
  readonly notes: readonly string[]
}

const DEFINITIONS = [
  { operatorId: 'char_172_svrash', talentIndex: 0, name: 'カリスマ', categories: ['ABILITY', 'DEPLOYMENT'] },
  { operatorId: 'char_172_svrash', talentIndex: 1, name: 'ホークビジョン', categories: ['STATUS', 'ATTACK_BEHAVIOR'] },
  { operatorId: 'char_263_skadi', talentIndex: 0, name: '深海の捕食者', categories: ['ABILITY'] },
  { operatorId: 'char_263_skadi', talentIndex: 1, name: '高速復帰', categories: ['DEPLOYMENT'] },
  { operatorId: 'char_350_surtr', talentIndex: 0, name: '劫火', categories: ['DAMAGE'] },
  { operatorId: 'char_350_surtr', talentIndex: 1, name: '余燼', categories: ['SURVIVAL'] },
  { operatorId: 'char_293_thorns', talentIndex: 0, name: '神経猛毒', categories: ['ADDITIONAL_DAMAGE'] },
  { operatorId: 'char_293_thorns', talentIndex: 1, name: '故郷の濤声', categories: ['SURVIVAL'] },
] as const

export function isTalentStructureSelection(selection: TalentStructureSelection): boolean {
  return DEFINITIONS.some(definition => sameSelection(definition, selection))
}

export function findTalentStructure(selection: TalentStructureSelection, structures: readonly TalentStructure[]): TalentStructure | null {
  return structures.find(structure => sameSelection(structure.basicInfo, selection)) ?? null
}

export interface TalentStructureGrowthSelection { readonly phaseIndex?: number; readonly operatorLevel?: number }

/** Verified semantics bind to the selected growth and potential-1 source. No calculator is called. */
export function buildTalentStructures(rows: readonly SkillRecord[], growth: TalentStructureGrowthSelection = {}): TalentStructure[] {
  const operators = new Map(rows.map(row => [row.operatorId, row]))
  return DEFINITIONS.flatMap(definition => {
    const operator = operators.get(definition.operatorId)
    if (!operator) return []
    const phaseIndex = growth.phaseIndex ?? Math.max(0, operator.operatorProfile.phases.length - 1)
    const maxLevel = operator.operatorProfile.phases[phaseIndex]?.maxLevel
    const operatorLevel = growth.operatorLevel ?? maxLevel
    if (phaseIndex !== 2 || !Number.isInteger(operatorLevel) || !operatorLevel || operatorLevel < 1
      || !Number.isInteger(maxLevel) || !maxLevel || operatorLevel > maxLevel) return []
    const source = getOperatorPassives(operator.operatorProfile, phaseIndex, operatorLevel, 1).sources
      .find(candidate => candidate.sourceKind === 'TALENT' && candidate.talentIndex === definition.talentIndex)
    // Do not reinterpret a lower-promotion, different-slot or potential-only candidate.
    if (!source || !source.description || source.requiredPotentialRank !== 0
      || source.unlockCondition?.phase !== 'PHASE_2' || source.sourceName !== definition.name
      || source.prefabKey !== String(definition.talentIndex + 1)) return []
    const issues: string[] = []
    const read = (key: string) => readNumber(source, key, issues)
    const descriptionNumber = (binding: string, pattern: RegExp) => {
      const value = source.description.normalize('NFKC').match(pattern)?.[1]
      if (value === undefined || !Number.isFinite(Number(value))) {
        issues.push(`説明文の数値「${binding}」を確認できません。`)
        return null
      }
      return Number(value)
    }
    const basicInfo = { operatorId: definition.operatorId, operatorName: operator.operatorName,
      talentIndex: definition.talentIndex, talentName: source.sourceName, phaseIndex, operatorLevel,
      potentialRank: 1 as const, module: 'NONE' as const }
    let effects: TalentStructureEffect[] = []
    const key = `${definition.operatorId}/${definition.talentIndex}`
    if (key === 'char_172_svrash/0') effects = [
      { ...context('self-atk', { type: 'CONTINUOUS', while: 'DEPLOYED' }, recipients('SELF', 'SELF'), 'atk'), item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', value: read('atk'), unit: 'RATIO' },
      { ...context('squad-redeploy', { type: 'CONTINUOUS', while: 'IN_SQUAD' }, recipients('ALLY', 'SQUAD', true), 'respawn_time'), item: 'REDEPLOY_TIME', operation: 'ADD_RATIO', value: read('respawn_time'), unit: 'RATIO' },
    ]
    if (key === 'char_172_svrash/1') effects = [
      { ...context('reveal-stealth', { type: 'CONTINUOUS', while: 'DEPLOYED' }, recipients('ENEMY', 'ATTACK_RANGE'), 'description:stealth'), condition: { type: 'COMPARE', metric: 'target.inAttackRange', comparison: 'EQ', value: true, sourceBinding: 'description:attack_range' }, item: 'STEALTH', operation: 'SET_ENABLED', value: false, unit: 'BOOLEAN' },
    ]
    if (key === 'char_263_skadi/0') effects = [
      { ...context('faction-atk', { type: 'CONTINUOUS', while: 'IN_SQUAD' }, { ...recipients('ALLY', 'SQUAD', true), factionIds: ['abyssal'], filterLabels: { abyssal: 'アビサルハンター' } }, 'atk'), item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', value: read('atk'), unit: 'RATIO', parameterBindings: { 'target.factionIds': 'description:abyssal_hunters' } },
    ]
    if (key === 'char_263_skadi/1') effects = [
      { ...context('self-redeploy', { type: 'CONTINUOUS', while: 'ALWAYS' }, recipients('SELF', 'SELF'), 'respawn_time'), item: 'REDEPLOY_TIME', operation: 'ADD_VALUE', value: read('respawn_time'), unit: 'SECOND' },
    ]
    if (key === 'char_350_surtr/0') effects = [
      { ...context('resistance-ignore', { type: 'EVENT', event: 'ATTACK' }, { ...recipients('SELF', 'SELF'), entity: 'ATTACK' }, 'magic_resist_penetrate_fixed'), item: 'RESISTANCE_IGNORE_FIXED', operation: 'IGNORE_FIXED', value: read('magic_resist_penetrate_fixed'), unit: 'POINT' },
    ]
    if (key === 'char_350_surtr/1') {
      const delay = read('surtr_t_2[withdraw].interval')
      effects = [
        { ...context('lethal-hp', { type: 'EVENT', event: 'LETHAL_DAMAGE' }, recipients('SELF', 'SELF'), 'description:lethal_hp'), item: 'HP', operation: 'SET', value: descriptionNumber('lethal_hp', /HPが\s*(\d+(?:\.\d+)?)残る/), unit: 'POINT', restrictions: [{ type: 'APPLICATION_LIMIT', count: null, scope: 'SOURCE_LIFETIME', reset: 'UNSPECIFIED' }] },
        { ...context('forced-retreat', { type: 'AFTER_EVENT', event: 'LETHAL_DAMAGE', delaySeconds: delay }, recipients('SELF', 'SELF'), 'description:forced_retreat'), item: 'FORCED_RETREAT', operation: 'EXECUTE', value: true, unit: 'BOOLEAN', parameterBindings: { delaySeconds: 'surtr_t_2[withdraw].interval' }, afterEffects: ['lethal-hp'], restrictions: [{ type: 'APPLICATION_LIMIT', count: null, scope: 'SOURCE_LIFETIME', reset: 'UNSPECIFIED' }] },
      ]
    }
    if (key === 'char_293_thorns/0') {
      const duration = read('duration')
      effects = [false, true].map(ranged => ({
        ...context(ranged ? 'ranged-enemy-poison' : 'normal-enemy-poison', { type: 'EVENT', event: 'ATTACK' }, recipients('ENEMY', 'ATTACK_TARGET'), ranged ? 'damage[ranged]' : 'damage[normal]'),
        condition: { type: 'COMPARE', metric: 'target.canUseRangedAttack', comparison: 'EQ', value: ranged, sourceBinding: 'description:enemy_ranged_attack' },
        item: 'DAMAGE_OVER_TIME', operation: 'DEAL_DAMAGE', lifetime: { type: 'CURRENT_EVENT' },
        damage: { kind: { type: 'ORDINARY', damageType: 'ARTS' },
          amount: { basis: 'FIXED', value: read(ranged ? 'damage[ranged]' : 'damage[normal]'), referenceTime: 'NOT_APPLICABLE' },
          rate: 'PER_SECOND', duration: { type: 'FIXED_SECONDS', seconds: duration },
          // PRTS talent notes: one active poison; reapplication refreshes duration only.
          // Tick cadence and finite-window endpoint ordering remain unverified.
          // https://prts.wiki/w/Thorns
          cadence: { intervalSeconds: null, firstTickSeconds: null }, stacking: { mode: 'REPLACE', maxStacks: 1 }, refresh: 'RESET_DURATION', statusId: 'poison' },
        parameterBindings: { 'damage.duration.seconds': 'duration', 'damage.kind': 'description:arts_damage' },
      }))
    }
    if (key === 'char_293_thorns/1') effects = [
      { ...context('idle-regeneration', { type: 'PERIODIC', intervalSeconds: descriptionNumber('heal_interval', /(\d+(?:\.\d+)?)秒ごと/), firstTickSeconds: null }, recipients('SELF', 'SELF'), 'hp_recovery_per_sec_by_max_hp_ratio'),
        condition: { type: 'COMPARE', metric: 'source.secondsSinceLastNormalAttack', comparison: 'GTE', value: read('delay'), sourceBinding: 'delay' },
        item: 'HP_RESTORE_RATIO', operation: 'RESTORE', value: read('hp_recovery_per_sec_by_max_hp_ratio'), unit: 'MAX_HP_RATIO',
        parameterBindings: { intervalSeconds: 'description:heal_interval', waitSeconds: 'delay' } },
    ]
    const triggers = [...new Map(effects.map(effect => [JSON.stringify(effect.timing), effect.timing])).values()]
    return [{ basicInfo, classificationInfo: { coarseCategories: [...definition.categories] },
      activationSettings: { activationMethod: 'PASSIVE' as const, triggers }, effects,
      source: { description: source.description, blackboard: source.blackboard.map(entry => ({ ...entry })),
        requiredPotentialRank: source.requiredPotentialRank, unlockCondition: source.unlockCondition ? { ...source.unlockCondition } : undefined, prefabKey: source.prefabKey },
      deferred: deferredCases(key), issues, notes: ['表示中の昇進・レベル・潜在1・モジュールなしの素質を構造化する。'] }]
  })
}

function readNumber(source: PassiveSource, key: string, issues: string[]): number | null {
  const entries = source.blackboard.filter(entry => entry.key === key)
  const value = entries.length === 1 ? entries[0].value : undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(`素質データの数値「${key}」を確認できません。`)
    return null
  }
  return value
}

function deferredCases(key: string): TalentStructureDeferredCase[] {
  const references = [{ label: 'JPオペレーターデータ', href: DATA_SOURCE_URLS.character, external: true }]
  if (key === 'char_350_surtr/1') return [{ id: 'surtr-remnant-lifecycle', title: '発動後のHP処理と強制退場の境界', status: 'DEFERRED',
    unresolved: '発動後の回復・再被撃・再度の致命ダメージに対するHP処理、退場タイマーの再起動可否、退場時刻と命中処理の前後関係。',
    currentTreatment: '致命ダメージ時にHPが残る値と、効果発動から強制退場までの秒数を別の効果として保持し、発動後の処理は仮定しない。',
    impact: '生存時間、強制退場の境界における命中回数・総ダメージ。', resumeWhen: '素質発動後の時間進行を計算する際に実機映像と処理の根拠を確認する。', references }]
  if (key === 'char_293_thorns/0') return [{ id: 'thorns-poison-ticks', title: '毒の重複・更新とダメージ発生時刻', status: 'DEFERRED',
    unresolved: '初回ダメージの時刻、内部の処理間隔・丸め、再付与時のtick時計と効果終了時刻の前後関係。',
    currentTreatment: '非重複・再付与時は持続時間のみ更新し、既存のダメージ値を維持する。毎秒量から1秒tickを仮定せず、tick間隔・初回時刻を未確定として残す。計算機3では同一対象に毒を切らさず付与し続ける定常DPSを毎秒量で評価し、有限時間の総ダメージは算出しない。',
    impact: '攻撃開始直後・毒の途切れる攻撃間隔・付与終了境界での総ダメージ。', resumeWhen: '継続ダメージの有限時間の総量・tickごとの時間進行を計算する際に確認する。',
    references: [...references, { label: 'PRTS ソーンズ・素質備考', href: 'https://prts.wiki/w/Thorns', external: true }] }]
  if (key === 'char_293_thorns/1') return [{ id: 'thorns-idle-regeneration-reset', title: '非通常攻撃時間の判定と回復開始時刻', status: 'DEFERRED',
    unresolved: '反撃などが「通常攻撃せずにいる時間」をリセットするか、2秒経過後の初回回復時刻と内部の処理単位。',
    currentTreatment: '通常攻撃をしない待ち時間と回復周期・最大HPに対する割合を分離し、反撃との関係や初回時刻は未確定として残す。',
    impact: '反撃スキル中や攻撃停止時のHP推移。', resumeWhen: '回復と反撃を同時に扱う時間モデルに対応する際に確認する。', references }]
  return []
}

export const formatTalentStructureCondition = formatCombatCondition
export const formatTalentStructureTiming = formatCombatTiming
export const formatTalentStructureTarget = formatCombatRecipient
export function formatTalentStructureEffectItem(item: TalentStructureEffect['item']): string {
  if (item === 'ATK_BUFF_RATIO' || item === 'HP_RESTORE_RATIO') return formatSkillStructureEffectItem(item)
  return { REDEPLOY_TIME: '再配置時間', RESISTANCE_IGNORE_FIXED: '術耐性固定無視', STEALTH: 'ステルス',
    HP: 'HP', FORCED_RETREAT: '強制退場', DAMAGE_OVER_TIME: '継続ダメージ' }[item]
}
export function formatTalentStructureEffectOperation(effect: TalentStructureEffect): string {
  return { ADD_RATIO: '割合加算', ADD_VALUE: '数値加算', IGNORE_FIXED: '固定値無視', SET_ENABLED: '適用設定',
    SET: '設定', EXECUTE: '実行', DEAL_DAMAGE: 'ダメージ付与', RESTORE: '回復' }[effect.operation]
}
export function formatTalentStructureEffectValue(effect: TalentStructureEffect): string {
  if (effect.item === 'DAMAGE_OVER_TIME') {
    const amount = effect.damage.amount
    const value = amount.basis === 'FIXED' ? formatCombatNumericValue(amount.value)
      : typeof amount.ratio === 'number' ? `攻撃力の${number(amount.ratio * 100)}％` : `攻撃力×${formatCombatNumericValue(amount.ratio)}`
    return `${value}${effect.damage.rate === 'PER_SECOND' ? '/秒' : '/回'}`
  }
  if (effect.value === null) return '未確認'
  if (typeof effect.value === 'object') {
    if (effect.unit === 'RATIO' || effect.unit === 'MAX_HP_RATIO') {
      const scaled = { ...effect.value,
        base: effect.value.base === null ? null : effect.value.base * 100,
        coefficient: effect.value.coefficient === null ? null : effect.value.coefficient * 100,
        ...(effect.value.min !== undefined ? { min: effect.value.min === null ? null : effect.value.min * 100 } : {}),
        ...(effect.value.max !== undefined ? { max: effect.value.max === null ? null : effect.value.max * 100 } : {}) }
      return `${effect.unit === 'MAX_HP_RATIO' ? '最大HPの' : ''}（${formatCombatNumericValue(scaled)}）％`
    }
    return `${formatCombatNumericValue(effect.value)}${effect.unit === 'SECOND' ? '秒' : 'ポイント'}`
  }
  switch (effect.unit) {
    case 'RATIO': return signed(effect.value * 100) + '％'
    case 'SECOND': return signed(effect.value) + '秒'
    case 'POINT': return number(effect.value)
    case 'BOOLEAN': return effect.item === 'FORCED_RETREAT' ? '強制退場する' : '無効'
    case 'MAX_HP_RATIO': return `最大HPの${number(effect.value * 100)}％`
  }
}
export function getTalentStructureEffectValueRows(effect: TalentStructureEffect): [string, string | number][] {
  if (effect.item === 'DAMAGE_OVER_TIME') return getCombatDotDefinitionRows(effect.damage)
  const rows: [string, string | number][] = [['表示値', formatTalentStructureEffectValue(effect)], ['単位', effect.unit]]
  if (typeof effect.value === 'boolean') rows.push(['値', effect.value ? 'はい' : 'いいえ'])
  else rows.push(...getCombatNumericDefinitionRows(effect.value))
  if (effect.timing.type === 'AFTER_EVENT') rows.push(['待ち時間（秒）', effect.timing.delaySeconds ?? '未確認'])
  if (effect.timing.type === 'PERIODIC') rows.push(['周期（秒）', effect.timing.intervalSeconds ?? '未確認'], ['初回時刻（秒）', effect.timing.firstTickSeconds ?? '未確定'])
  return rows
}

/** A single projection of the canonical model keeps all definition-table attributes visible. */
export function getTalentStructureEffectDefinitionRows(effect: TalentStructureEffect): [string, string | number][] {
  const rows: [string, string | number][] = [['効果ID', effect.id], ['項目', formatTalentStructureEffectItem(effect.item)], ['項目キー', effect.item], ['演算', formatTalentStructureEffectOperation(effect)], ['演算コード', effect.operation]]
  rows.push(...getCombatContextDefinitionRows(effect, effect.item === 'DAMAGE_OVER_TIME' ? '付与処理の有効期間' : '効果の有効期間'))
  if (effect.item === 'DAMAGE_OVER_TIME') rows.push(...getCombatDotDefinitionRows(effect.damage))
  else {
    rows.push(['単位', effect.unit])
    if (typeof effect.value === 'boolean') rows.push(['値', effect.value ? 'はい' : 'いいえ'])
    else rows.push(...getCombatNumericDefinitionRows(effect.value))
  }
  return rows
}

function recipients(side: CombatRecipientSelector['side'], scope: 'SELF' | 'SQUAD' | 'ATTACK_RANGE' | 'ATTACK_TARGET', includeSelf = side === 'SELF'): CombatRecipientSelector {
  return { type: 'RECIPIENTS', side, entity: 'UNIT', scope, includeSelf, factionIds: [], tagIds: [], selection: { type: 'ALL' } }
}
function context(id: string, timing: CombatTiming, target: CombatRecipientSelector, sourceBinding: string): CombatEffectContext {
  return { id, timing, target, sourceBinding, condition: null, probability: { chance: 1, rollScope: 'APPLICATION' },
    lifetime: timing.type === 'CONTINUOUS' ? { type: 'WHILE_SOURCE_ACTIVE' } : { type: 'CURRENT_EVENT' }, restrictions: [] }
}

function sameSelection(a: TalentStructureSelection, b: TalentStructureSelection) {
  return Number.isInteger(b.talentIndex) && a.operatorId === b.operatorId && a.talentIndex === b.talentIndex
}
function signed(value: number): string { return `${value < 0 ? '－' : '＋'}${number(Math.abs(value))}` }
