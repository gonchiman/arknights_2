import type { SkillCoarseCategory } from './skillCoarseClassification.ts'
import type { DamageType } from './damageCalculator.ts'
import { SKILL_DIRECTORY_SP_TYPE_LABELS } from './skillDirectory.ts'
import type { GuardSkillRecipe } from './guardCombatTypes.ts'
import { buildGuardSkillStructures } from './guardSkillStructure.ts'

export type SkillStructureComparison = 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE'
export type SkillStructureNumericMetric = 'skillActivationCount' | 'actualAttackTargetCount'
  | 'targetWeight' | 'splashTargetCount' | 'airborneHitCount'
export type SkillStructureMode = 'INITIAL' | 'ALTERNATE'
export type SkillStructureInputMetric = SkillStructureNumericMetric | 'skillMode' | 'targetCanBeLevitated' | 'targetInitialState'

/** Conditions remain machine-readable; labels are derived only when displayed. */
export type SkillStructurePredicate =
  | { readonly metric: SkillStructureNumericMetric; readonly comparison: SkillStructureComparison; readonly value: number }
  | { readonly metric: 'attackDistanceType'; readonly comparison: 'EQ' | 'NE'; readonly value: 'RANGED' | 'MELEE' }
  | { readonly metric: 'skillMode'; readonly comparison: 'EQ' | 'NE'; readonly value: SkillStructureMode }
  | { readonly metric: 'targetCanBeLevitated'; readonly comparison: 'EQ' | 'NE'; readonly value: boolean }

export type SkillStructureDuration =
  | { readonly type: 'FIXED_SECONDS'; readonly seconds: number }
  | { readonly type: 'UNTIL_EXIT' }
  | { readonly type: 'SINGLE_ATTACK' }
  | { readonly type: 'SKILL_ACTION' }
  | { readonly type: 'UNTIL_MODE_CHANGE' }

export type SkillStructureEndCondition =
  | { readonly type: 'SECONDS_ELAPSED'; readonly seconds: number }
  | { readonly type: 'OPERATOR_EXIT' }
  | { readonly type: 'ATTACK_RESOLVED' }
  | { readonly type: 'MODE_CHANGE_OR_EXIT' }

export type SkillStructureEffectTiming = 'WHILE_STAGE_ACTIVE' | 'ON_ATTACK' | 'ON_NEXT_NORMAL_ATTACK'
  | 'ON_STAGE_ENTER' | 'ON_ATTACK_DEFEAT' | 'ON_INCOMING_NORMAL_ATTACK'
  | { readonly type: 'PERIODIC'; readonly intervalSeconds: number }
export type SkillStructureEffectTarget = 'SELF' | 'SELF_ATTACK' | 'ENEMIES_IN_ACTION_RANGE' | 'GROUND_ENEMIES_IN_ACTION_RANGE' | 'ATTACK_TARGET'
export type SkillStructureEffectOperation = 'ADD_RATIO' | 'ADD_VALUE' | 'EXTEND_FORWARD' | 'REPLACE' | 'SET' | 'MULTIPLY' | 'SET_ENABLED'
  | 'FILL_RESOURCE' | 'RESTORE' | 'INCREASE_TO_CAP' | 'EXECUTE_ATTACK' | 'DEAL_DAMAGE' | 'APPLY_STATUS'

export interface SkillStructureAttackAction {
  readonly count: number
  readonly treatment: 'RANGED' | 'MELEE'
  readonly rangeId: string
  readonly maxTargets: number
  readonly cooldownSeconds: number
}

export interface SkillStructureHpLossProfile {
  readonly basis: 'MAX_HP'
  readonly maxRatioPerSecond: number
  readonly rampDurationSeconds: number
  readonly tickIntervalSeconds: number
  /** The description specifies an increase and a cap, but no interpolation formula. */
  readonly curve: 'UNSPECIFIED'
}

interface SkillStructureEffectBase {
  readonly id: string
  readonly timing: SkillStructureEffectTiming
  readonly condition: SkillStructurePredicate | null
  readonly target: SkillStructureEffectTarget
  readonly sourceBinding: string
  readonly parameterBindings?: Readonly<Record<string, string>>
  /** Dependencies identify effects in the same stage, e.g. maximum HP before a full heal. */
  readonly afterEffects?: readonly string[]
}

/** Each variant binds an item to its allowed operation, unit and value type. */
export type SkillStructureEffect = SkillStructureEffectBase & (
  | { readonly item: 'ATK_BUFF_RATIO' | 'DEF_BUFF_RATIO' | 'MAX_HP_BUFF_RATIO'; readonly operation: 'ADD_RATIO'; readonly value: number; readonly unit: 'RATIO' }
  | { readonly item: 'ATTACK_SPEED' | 'MAX_HP'; readonly operation: 'ADD_VALUE'; readonly value: number; readonly unit: 'POINT' }
  | { readonly item: 'ATTACK_RANGE'; readonly operation: 'EXTEND_FORWARD'; readonly value: number; readonly unit: 'TILE' }
  | { readonly item: 'ATTACK_RANGE'; readonly operation: 'REPLACE'; readonly value: { readonly rangeId: string }; readonly unit: 'RANGE_DEFINITION' }
  | { readonly item: 'MAX_TARGETS'; readonly operation: 'SET'; readonly value: number; readonly unit: 'ENEMY' }
  | { readonly item: 'ATTACK_SCALE'; readonly operation: 'MULTIPLY'; readonly value: number; readonly unit: 'MULTIPLIER' }
  | { readonly item: 'ATTACK_TREATMENT'; readonly operation: 'SET'; readonly value: 'MELEE' | 'RANGED'; readonly unit: 'ATTACK_MODE' }
  | { readonly item: 'TRAIT_RANGED_ATK_PENALTY' | 'NORMAL_ATTACK_ENABLED'; readonly operation: 'SET_ENABLED'; readonly value: boolean; readonly unit: 'BOOLEAN' }
  | { readonly item: 'HP' | 'SP'; readonly operation: 'FILL_RESOURCE'; readonly value: 'MAXIMUM'; readonly unit: 'RESOURCE_LIMIT' }
  | { readonly item: 'HP_RESTORE_RATIO'; readonly operation: 'RESTORE'; readonly value: number; readonly unit: 'MAX_HP_RATIO' }
  | { readonly item: 'HP_LOSS_RATE'; readonly operation: 'INCREASE_TO_CAP'; readonly value: SkillStructureHpLossProfile; readonly unit: 'HP_LOSS_PROFILE' }
  | { readonly item: 'TRIGGERED_ATTACK'; readonly operation: 'EXECUTE_ATTACK'; readonly value: SkillStructureAttackAction; readonly unit: 'ATTACK_ACTION' }
  | { readonly item: 'DIRECT_DAMAGE'; readonly operation: 'DEAL_DAMAGE'; readonly value: {
      readonly damageType: DamageType; readonly attackScale: number; readonly count: number
      readonly targeting?: { readonly selection: 'ALL' | 'RANDOM'; readonly splashRadius?: number }
      readonly intervalSeconds?: number
    }; readonly unit: 'DAMAGE_ACTION' }
  | { readonly item: 'APPLY_STATUS'; readonly operation: 'APPLY_STATUS'; readonly value: {
      readonly statusId: 'LEVITATE'; readonly durationSeconds: number
      readonly maxWeight?: number
      readonly durationWeightScaling?: { readonly threshold: number; readonly multiplier: number }
    }; readonly unit: 'STATUS_APPLICATION' }
)

export interface SkillStructureStage {
  readonly id: string
  readonly label: string
  readonly applicability: SkillStructurePredicate | null
  readonly duration: SkillStructureDuration
  readonly endCondition: SkillStructureEndCondition
  readonly effects: readonly SkillStructureEffect[]
}

export interface SkillStructureSelection {
  readonly operatorId: string
  readonly skillId: string
  readonly skillIndex: number
  readonly levelIndex: number
}

export interface SkillStructure {
  readonly guardRecipe?: GuardSkillRecipe
  readonly basicInfo: SkillStructureSelection & {
    readonly operatorName: string
    readonly skillName: string
    readonly skillLevel: string
  }
  readonly classificationInfo: {
    /** Explicitly verified memberships, not description-classifier candidates. */
    readonly coarseCategories: readonly SkillCoarseCategory[]
  }
  readonly activationSettings: {
    readonly spRecovery: 'INCREASE_WITH_TIME' | 'INCREASE_WHEN_ATTACK' | 'INCREASE_WHEN_TAKEN_DAMAGE' | 'NO_SP'
    readonly initialSp: number
    readonly spCost: number
    readonly maxCharges: number
    readonly activationMethod: 'MANUAL' | 'AUTO' | 'PASSIVE'
    readonly activationTrigger: 'MANUAL_INPUT' | 'SP_FULL' | 'ON_DEPLOY' | 'NEXT_NORMAL_ATTACK'
  }
  readonly effectStructure: {
    readonly targetSelection?: { readonly initialState: 'GROUND' | 'USER_DEFINED'; readonly maxTargets?: number | null }
    readonly stages: readonly SkillStructureStage[]
    readonly relations?: readonly {
      readonly type: 'BONUS_VALUE_RELATION'
      readonly firstStage: string
      readonly laterStage: string
      readonly items: readonly SkillStructureEffect['item'][]
      readonly multiplier: number
    }[]
    readonly inputRequirements?: readonly SkillStructureInputMetric[]
    readonly modeTransitions?: readonly {
      readonly trigger: 'SKILL_ACTIVATION'
      readonly from: SkillStructureMode
      readonly to: SkillStructureMode
    }[]
  }
  readonly source: {
    readonly description: string
    readonly rawDescription: string
    readonly blackboard: readonly { readonly key: string; readonly value: number; readonly valueStr: string | null }[]
    readonly rangeId: string | null
    readonly duration: number
  }
  readonly notes: readonly string[]
}

export interface SkillStructureRange {
  readonly id: string
  readonly direction: number
  readonly grids: readonly { readonly row: number; readonly col: number }[]
}

type SkillStructureIdentity = Pick<SkillStructureSelection, 'operatorId' | 'skillId' | 'skillIndex'>

/** Level is always matched exactly; a reviewed 特化3 never fills another level. */
export function findSkillStructure(selection: SkillStructureSelection): SkillStructure | null {
  return SKILL_STRUCTURES.find((structure) => sameSkill(structure.basicInfo, selection)
    && structure.basicInfo.levelIndex === selection.levelIndex) ?? null
}

export function isSkillStructureRecord(record: SkillStructureIdentity): boolean {
  return SKILL_STRUCTURES.some((structure) => sameSkill(structure.basicInfo, record))
}

export function getSkillStructureLevelIndices(skill: SkillStructureIdentity): readonly number[] {
  return [...new Set(SKILL_STRUCTURES
    .filter((structure) => sameSkill(structure.basicInfo, skill))
    .map((structure) => structure.basicInfo.levelIndex))].sort((a, b) => a - b)
}

function sameSkill(a: SkillStructureIdentity, b: SkillStructureIdentity): boolean {
  return a.operatorId === b.operatorId && a.skillId === b.skillId && a.skillIndex === b.skillIndex
}

const PREDICATE_METRIC_LABELS = {
  skillActivationCount: '発動回数',
  actualAttackTargetCount: '攻撃対象数',
  attackDistanceType: '攻撃距離',
  skillMode: '状態',
  targetCanBeLevitated: '浮遊の適用',
  targetWeight: '敵の重量ランク',
  splashTargetCount: '砲撃1発の命中対象数',
  airborneHitCount: '浮遊中の砲撃数',
} satisfies Record<SkillStructurePredicate['metric'], string>

const COMPARISON_LABELS = {
  EQ: '＝', NE: '≠', GT: '＞', GTE: '≧', LT: '＜', LTE: '≦',
} satisfies Record<SkillStructureComparison, string>

export function formatSkillStructurePredicate(
  predicate: SkillStructurePredicate | null,
  emptyLabel = 'なし',
): string {
  if (predicate === null) return emptyLabel
  const value = predicate.metric === 'attackDistanceType'
    ? predicate.value === 'RANGED' ? '遠距離' : '近接'
    : predicate.metric === 'skillMode' ? formatSkillStructureMode(predicate.value)
      : predicate.metric === 'targetCanBeLevitated' ? predicate.value ? '可能' : '無効' : formatNumber(predicate.value)
  return `${PREDICATE_METRIC_LABELS[predicate.metric]}${COMPARISON_LABELS[predicate.comparison]}${value}`
}

export function formatSkillStructureDuration(duration: SkillStructureDuration): string {
  if (duration.type === 'FIXED_SECONDS') return `${formatNumber(duration.seconds)}秒`
  return { UNTIL_EXIT: '時間制限なし', SINGLE_ATTACK: '通常攻撃1回', SKILL_ACTION: 'スキル発動1回', UNTIL_MODE_CHANGE: '次の状態切替まで' }[duration.type]
}

export function formatSkillStructureEndCondition(condition: SkillStructureEndCondition): string {
  if (condition.type === 'SECONDS_ELAPSED') return `${formatNumber(condition.seconds)}秒経過`
  return { OPERATOR_EXIT: '本人の退場', ATTACK_RESOLVED: '当該攻撃の処理完了', MODE_CHANGE_OR_EXIT: '状態切替または本人の退場' }[condition.type]
}

export function formatSkillStructureMode(mode: SkillStructureMode): string {
  return { INITIAL: '初期状態', ALTERNATE: '切替後' }[mode]
}

export function formatSkillStructureSpRecovery(recovery: SkillStructure['activationSettings']['spRecovery']): string {
  return SKILL_DIRECTORY_SP_TYPE_LABELS[recovery]
}

export function formatSkillStructureActivationMethod(method: SkillStructure['activationSettings']['activationMethod']): string {
  return { MANUAL: '手動発動', AUTO: '自動発動', PASSIVE: 'パッシブ' }[method]
}

export function formatSkillStructureActivationTrigger(trigger: SkillStructure['activationSettings']['activationTrigger']): string {
  return { MANUAL_INPUT: '手動操作', SP_FULL: 'SP満了', ON_DEPLOY: '配置時', NEXT_NORMAL_ATTACK: 'SP充足後の次の通常攻撃' }[trigger]
}

export function formatSkillStructureEffectTiming(timing: SkillStructureEffectTiming): string {
  if (typeof timing === 'object') return `${formatNumber(timing.intervalSeconds)}秒ごと`
  return {
    WHILE_STAGE_ACTIVE: '段階中', ON_ATTACK: '攻撃時', ON_NEXT_NORMAL_ATTACK: '次の通常攻撃時',
    ON_STAGE_ENTER: '効果発動時', ON_ATTACK_DEFEAT: '当該攻撃で撃破時', ON_INCOMING_NORMAL_ATTACK: '敵の通常攻撃を受けた時',
  }[timing]
}

export function formatSkillStructureEffectTarget(target: SkillStructureEffectTarget): string {
  return { SELF: '自身', SELF_ATTACK: '自身の攻撃', ENEMIES_IN_ACTION_RANGE: '作用範囲内の敵',
    GROUND_ENEMIES_IN_ACTION_RANGE: '作用範囲内の地上の敵', ATTACK_TARGET: '攻撃対象の敵' }[target]
}

export function formatSkillStructureEffectItem(item: SkillStructureEffect['item']): string {
  return {
    ATK_BUFF_RATIO: '攻撃力',
    DEF_BUFF_RATIO: '防御力',
    ATTACK_SPEED: '攻撃速度',
    ATTACK_RANGE: '攻撃範囲',
    MAX_TARGETS: '対象数上限',
    ATTACK_SCALE: '攻撃倍率',
    ATTACK_TREATMENT: '攻撃の扱い',
    TRAIT_RANGED_ATK_PENALTY: '遠距離減衰',
    MAX_HP_BUFF_RATIO: '最大HP',
    MAX_HP: '最大HP',
    NORMAL_ATTACK_ENABLED: '通常攻撃',
    HP: 'HP',
    SP: 'SP',
    HP_RESTORE_RATIO: 'HP回復',
    HP_LOSS_RATE: 'HP減少率',
    TRIGGERED_ATTACK: '反撃',
    DIRECT_DAMAGE: '直接ダメージ',
    APPLY_STATUS: '状態付与',
  }[item]
}

export function formatSkillStructureEffectOperation(effect: SkillStructureEffect): string {
  if (effect.item === 'MAX_TARGETS') return '上限設定'
  return {
    ADD_RATIO: '割合加算', ADD_VALUE: '数値加算', EXTEND_FORWARD: '前方延長',
    REPLACE: '範囲置換', SET: '設定', MULTIPLY: '倍率適用', SET_ENABLED: '適用設定',
    FILL_RESOURCE: '最大値まで回復', RESTORE: '回復', INCREASE_TO_CAP: '徐々に増加（上限）', EXECUTE_ATTACK: '攻撃実行',
    DEAL_DAMAGE: 'ダメージ付与', APPLY_STATUS: '状態付与',
  }[effect.operation]
}

export function formatSkillStructureEffectValue(effect: SkillStructureEffect): string {
  switch (effect.unit) {
    case 'RATIO': return `${signedNumber(effect.value * 100)}％`
    case 'POINT': return signedNumber(effect.value)
    case 'TILE': return `${signedNumber(effect.value)}マス`
    case 'RANGE_DEFINITION': return `範囲${effect.value.rangeId}`
    case 'ENEMY': return `${formatNumber(effect.value)}体`
    case 'MULTIPLIER': return `×${formatNumber(effect.value)}`
    case 'ATTACK_MODE': return effect.value === 'MELEE' ? '近接攻撃' : '遠距離攻撃'
    case 'BOOLEAN': return effect.value ? '有効' : '無効'
    case 'RESOURCE_LIMIT': return '最大値'
    case 'MAX_HP_RATIO': return `最大HPの${formatNumber(effect.value * 100)}％`
    case 'HP_LOSS_PROFILE': return `最大HPの${formatNumber(effect.value.maxRatioPerSecond * 100)}％/秒`
    case 'ATTACK_ACTION': return `${formatNumber(effect.value.count)}回`
    case 'DAMAGE_ACTION': return `×${formatNumber(effect.value.attackScale)}`
    case 'STATUS_APPLICATION': return '浮遊'
  }
}

/** Compound effects expose each parameter as its own definition row. */
export function getSkillStructureEffectValueRows(effect: SkillStructureEffect): [string, string | number][] {
  if (effect.unit === 'DAMAGE_ACTION') return [
    ['ダメージ種別', { PHYSICAL: '物理', ARTS: '術', TRUE: '確定' }[effect.value.damageType]],
    ['攻撃倍率', effect.value.attackScale], ['打撃回数', effect.value.count],
    ...(effect.value.targeting ? [['対象の選び方', effect.value.targeting.selection === 'ALL' ? '全て' : 'ランダム'] as [string, string]] : []),
    ...(effect.value.targeting?.splashRadius !== undefined ? [['範囲半径（マス）', effect.value.targeting.splashRadius] as [string, number]] : []),
    ...(effect.value.intervalSeconds !== undefined ? [['打撃間隔（秒）', effect.value.intervalSeconds] as [string, number]] : []),
  ]
  if (effect.unit === 'STATUS_APPLICATION') return [
    ['状態', '浮遊'], ['持続時間（秒）', effect.value.durationSeconds],
    ...(effect.value.maxWeight !== undefined ? [['重量ランクの上限', effect.value.maxWeight] as [string, number]] : []),
    ...(effect.value.durationWeightScaling ? [
      ['時間短縮の重量境界（超過時）', effect.value.durationWeightScaling.threshold] as [string, number],
      ['境界超過時の時間倍率', effect.value.durationWeightScaling.multiplier] as [string, number],
    ] : []),
  ]
  if (effect.unit === 'HP_LOSS_PROFILE') return [
    ['基準', '最大HP'], ['減少率の上限（毎秒）', effect.value.maxRatioPerSecond],
    ['上限到達まで（秒）', effect.value.rampDurationSeconds], ['処理間隔（秒）', effect.value.tickIntervalSeconds],
    ['増加曲線', '未確定'],
  ]
  if (effect.unit === 'ATTACK_ACTION') return [
    ['攻撃回数', effect.value.count], ['攻撃の扱い', effect.value.treatment === 'RANGED' ? '遠距離攻撃' : '近接攻撃'],
    ['攻撃範囲', effect.value.rangeId], ['対象数上限', effect.value.maxTargets],
    ['再発動までの最短時間（秒）', effect.value.cooldownSeconds],
  ]
  return [['値', effect.unit === 'RANGE_DEFINITION' ? effect.value.rangeId : String(effect.value)]]
}

function formatNumber(value: number): string {
  return String(Math.round(value * 1_000_000) / 1_000_000)
}

function signedNumber(value: number): string {
  return `${value < 0 ? '－' : '＋'}${formatNumber(Math.abs(value))}`
}

/**
 * Reviewed skills at 特化3 only. Ordered effects use afterEffects instead of operator-specific formulas.
 * These records do not claim calculator support and do not reuse the display-only
 * description breakdown as executable effects.
 */
export const SKILL_STRUCTURES: readonly SkillStructure[] = [
  ...buildGuardSkillStructures(),
  {
    basicInfo: { operatorId: 'char_4009_irene', operatorName: 'アイリーニ', skillId: 'skchr_irene_1',
      skillIndex: 1, skillName: '舞風', skillLevel: '特化3', levelIndex: 9 },
    classificationInfo: { coarseCategories: ['NEXT_ATTACK'] },
    activationSettings: { spRecovery: 'INCREASE_WHEN_ATTACK', initialSp: 0, spCost: 3,
      maxCharges: 1, activationMethod: 'AUTO', activationTrigger: 'NEXT_NORMAL_ATTACK' },
    effectStructure: { targetSelection: { initialState: 'GROUND' }, inputRequirements: ['targetCanBeLevitated'], stages: [{
      id: 'next-attack', label: '強化攻撃', applicability: null,
      duration: { type: 'SINGLE_ATTACK' }, endCondition: { type: 'ATTACK_RESOLVED' },
      effects: [
        // Sanity;Gone's Irene guide verifies that both hits check the airborne talent.
        // https://old.sanitygone.help/operators/irene
        { id: 'lift', timing: 'ON_NEXT_NORMAL_ATTACK', condition: { metric: 'targetCanBeLevitated', comparison: 'EQ', value: true },
          target: 'ATTACK_TARGET', item: 'APPLY_STATUS', operation: 'APPLY_STATUS',
          value: { statusId: 'LEVITATE', durationSeconds: 1 }, unit: 'STATUS_APPLICATION', sourceBinding: 'levitate' },
        { id: 'damage-1', timing: 'ON_NEXT_NORMAL_ATTACK', condition: null, target: 'ATTACK_TARGET',
          item: 'DIRECT_DAMAGE', operation: 'DEAL_DAMAGE', value: { damageType: 'PHYSICAL', attackScale: 2, count: 1 },
          unit: 'DAMAGE_ACTION', sourceBinding: 'atk_scale', afterEffects: ['lift'] },
        { id: 'damage-2', timing: 'ON_NEXT_NORMAL_ATTACK', condition: null, target: 'ATTACK_TARGET',
          item: 'DIRECT_DAMAGE', operation: 'DEAL_DAMAGE', value: { damageType: 'PHYSICAL', attackScale: 2, count: 1 },
          unit: 'DAMAGE_ACTION', sourceBinding: 'atk_scale', afterEffects: ['damage-1'] },
      ],
    }] },
    source: {
      description: '次の通常攻撃時、対象に攻撃力の200%の物理ダメージを与え、1秒間浮遊させ、さらに追加で攻撃力の200%の物理ダメージを与える',
      rawDescription: '次の通常攻撃時、対象に攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与え、<@ba.vup>{levitate}</>秒間<$ba.levitate>浮遊</>させ、さらに追加で攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与える',
      blackboard: [{ key: 'atk_scale', value: 2, valueStr: null }, { key: 'levitate', value: 1, valueStr: null }],
      rangeId: null, duration: 0,
    }, notes: [],
  },
  {
    basicInfo: { operatorId: 'char_4009_irene', operatorName: 'アイリーニ', skillId: 'skchr_irene_2',
      skillIndex: 2, skillName: '裂潮', skillLevel: '特化3', levelIndex: 9 },
    classificationInfo: { coarseCategories: ['BURST'] },
    activationSettings: { spRecovery: 'INCREASE_WHEN_ATTACK', initialSp: 6, spCost: 8,
      maxCharges: 2, activationMethod: 'MANUAL', activationTrigger: 'MANUAL_INPUT' },
    effectStructure: { targetSelection: { initialState: 'GROUND', maxTargets: 6 },
      inputRequirements: ['actualAttackTargetCount', 'targetCanBeLevitated', 'targetWeight'], stages: [{
        id: 'skill-action', label: 'スキル発動', applicability: null,
        duration: { type: 'SKILL_ACTION' }, endCondition: { type: 'ATTACK_RESOLVED' },
        effects: [
          { id: 'range', timing: 'WHILE_STAGE_ACTIVE', condition: null, target: 'SELF_ATTACK',
            item: 'ATTACK_RANGE', operation: 'REPLACE', value: { rangeId: '3-12' }, unit: 'RANGE_DEFINITION', sourceBinding: 'rangeId' },
          { id: 'targets', timing: 'WHILE_STAGE_ACTIVE', condition: null, target: 'SELF_ATTACK',
            item: 'MAX_TARGETS', operation: 'SET', value: 6, unit: 'ENEMY', sourceBinding: 'max_target' },
          // The actual effect order checks the airborne talent on the initial hit as well.
          // https://arknights.wiki.gg/wiki/Irene#Additional_information
          { id: 'lift', timing: 'ON_STAGE_ENTER', condition: { metric: 'targetCanBeLevitated', comparison: 'EQ', value: true },
            target: 'ENEMIES_IN_ACTION_RANGE', item: 'APPLY_STATUS', operation: 'APPLY_STATUS',
            value: { statusId: 'LEVITATE', durationSeconds: 4, maxWeight: 3 }, unit: 'STATUS_APPLICATION',
            sourceBinding: 'levitate', parameterBindings: { maxWeight: 'value' } },
          { id: 'initial-damage', timing: 'ON_STAGE_ENTER', condition: null, target: 'ENEMIES_IN_ACTION_RANGE',
            item: 'DIRECT_DAMAGE', operation: 'DEAL_DAMAGE',
            value: { damageType: 'PHYSICAL', attackScale: 4, count: 1, targeting: { selection: 'ALL' } },
            unit: 'DAMAGE_ACTION', sourceBinding: 'atk_scale', afterEffects: ['lift'] },
        ],
      }] },
    source: {
      description: '前方一定範囲内の地面にいる敵最大6体に攻撃力の400%の物理ダメージを与え、その内重量ランクが3以下の敵を4秒間浮遊させる\n2回チャージ可能',
      rawDescription: '前方一定範囲内の地面にいる敵最大<@ba.vup>{max_target}</>体に攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与え、その内重量ランクが3以下の敵を<@ba.vup>{levitate}</>秒間<$ba.levitate>浮遊</>させる\n<@ba.rem>2回チャージ可能</>',
      blackboard: [{ key: 'atk_scale', value: 4, valueStr: null }, { key: 'levitate', value: 4, valueStr: null },
        { key: 'max_target', value: 6, valueStr: null }, { key: 'value', value: 3, valueStr: null }],
      rangeId: '3-12', duration: 0,
    }, notes: [],
  },
  {
    basicInfo: { operatorId: 'char_4009_irene', operatorName: 'アイリーニ', skillId: 'skchr_irene_3',
      skillIndex: 3, skillName: '判決', skillLevel: '特化3', levelIndex: 9 },
    classificationInfo: { coarseCategories: ['BURST'] },
    activationSettings: { spRecovery: 'INCREASE_WHEN_ATTACK', initialSp: 16, spCost: 24,
      maxCharges: 1, activationMethod: 'MANUAL', activationTrigger: 'MANUAL_INPUT' },
    effectStructure: { targetSelection: { initialState: 'USER_DEFINED', maxTargets: null },
      inputRequirements: ['actualAttackTargetCount', 'targetCanBeLevitated', 'targetWeight', 'splashTargetCount', 'airborneHitCount', 'targetInitialState'], stages: [{
        id: 'skill-action', label: 'スキル発動', applicability: null,
        duration: { type: 'SKILL_ACTION' }, endCondition: { type: 'ATTACK_RESOLVED' },
        effects: [
          { id: 'range', timing: 'WHILE_STAGE_ACTIVE', condition: null, target: 'SELF_ATTACK',
            item: 'ATTACK_RANGE', operation: 'REPLACE', value: { rangeId: 'x-1' }, unit: 'RANGE_DEFINITION', sourceBinding: 'rangeId' },
          // As in S1/S2, levitation is applied before the initial damage checks the talent.
          // https://arknights.wiki.gg/wiki/Irene#Additional_information
          { id: 'lift', timing: 'ON_STAGE_ENTER', condition: { metric: 'targetCanBeLevitated', comparison: 'EQ', value: true },
            target: 'GROUND_ENEMIES_IN_ACTION_RANGE', item: 'APPLY_STATUS', operation: 'APPLY_STATUS',
            value: { statusId: 'LEVITATE', durationSeconds: 4, durationWeightScaling: { threshold: 3, multiplier: 0.5 } },
            unit: 'STATUS_APPLICATION', sourceBinding: 'levitate' },
          { id: 'initial-damage', timing: 'ON_STAGE_ENTER', condition: null, target: 'GROUND_ENEMIES_IN_ACTION_RANGE',
            item: 'DIRECT_DAMAGE', operation: 'DEAL_DAMAGE',
            value: { damageType: 'PHYSICAL', attackScale: 3, count: 1, targeting: { selection: 'ALL' } },
            unit: 'DAMAGE_ACTION', sourceBinding: 'atk_scale', afterEffects: ['lift'] },
          { id: 'bombardment', timing: 'ON_STAGE_ENTER', condition: null, target: 'ENEMIES_IN_ACTION_RANGE',
            item: 'DIRECT_DAMAGE', operation: 'DEAL_DAMAGE',
            value: { damageType: 'PHYSICAL', attackScale: 2.5, count: 12, targeting: { selection: 'RANDOM', splashRadius: 1.1 }, intervalSeconds: 0.25 },
            unit: 'DAMAGE_ACTION', sourceBinding: 'multi_atk_scale',
            parameterBindings: { count: 'multi_times', intervalSeconds: 'multi_hit_interval' }, afterEffects: ['initial-damage'] },
        ],
      }] },
    source: {
      description: '周囲の全ての地面にいる敵に攻撃力の300%の物理ダメージを与え、4秒間浮遊させる。その後素早く12回砲撃を行い、砲撃するたびにランダムな敵に攻撃力の250%の物理範囲ダメージを与える',
      rawDescription: '周囲の全ての地面にいる敵に攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与え、<@ba.vup>{levitate}</>秒間<$ba.levitate>浮遊</>させる。その後素早く<@ba.vup>{multi_times}</>回砲撃を行い、砲撃するたびにランダムな敵に攻撃力の<@ba.vup>{multi_atk_scale:0%}</>の物理範囲ダメージを与える',
      blackboard: [{ key: 'atk_scale', value: 3, valueStr: null }, { key: 'levitate', value: 4, valueStr: null },
        { key: 'multi_atk_scale', value: 2.5, valueStr: null }, { key: 'multi_times', value: 12, valueStr: null },
        { key: 'multi_hit_interval', value: 0.25, valueStr: null }],
      rangeId: 'x-1', duration: 0,
    }, notes: [],
  },
  {
    "basicInfo": {
      "operatorId": "char_263_skadi",
      "operatorName": "スカジ",
      "skillId": "skcom_quickattack[3]",
      "skillIndex": 1,
      "skillName": "迅速攻撃γ",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WITH_TIME",
      "initialSp": 15,
      "spCost": 35,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "active",
          "label": "通常",
          "applicability": null,
          "duration": {
            "type": "FIXED_SECONDS",
            "seconds": 35
          },
          "endCondition": {
            "type": "SECONDS_ELAPSED",
            "seconds": 35
          },
          "effects": [
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 0.45,
              "unit": "RATIO",
              "sourceBinding": "atk"
            },
            {
              "id": "aspd",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_SPEED",
              "operation": "ADD_VALUE",
              "value": 45,
              "unit": "POINT",
              "sourceBinding": "attack_speed"
            }
          ]
        }
      ]
    },
    "source": {
      "description": "攻撃力+45%、攻撃速度+45",
      "rawDescription": "攻撃力<@ba.vup>+{atk:0%}</>、攻撃速度<@ba.vup>+{attack_speed}</>",
      "blackboard": [
        {
          "key": "atk",
          "value": 0.45,
          "valueStr": null
        },
        {
          "key": "attack_speed",
          "value": 45,
          "valueStr": null
        }
      ],
      "rangeId": null,
      "duration": 35
    },
    "notes": [
      "攻撃力は割合加算、攻撃速度は数値加算として保持する。＋45％と＋45を同じ操作にまとめない。"
    ]
  },
  {
    "basicInfo": {
      "operatorId": "char_350_surtr",
      "operatorName": "スルト",
      "skillId": "skchr_surtr_2",
      "skillIndex": 2,
      "skillName": "災厄の巨焔",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WITH_TIME",
      "initialSp": 12,
      "spCost": 18,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "active",
          "label": "通常",
          "applicability": null,
          "duration": {
            "type": "FIXED_SECONDS",
            "seconds": 18
          },
          "endCondition": {
            "type": "SECONDS_ELAPSED",
            "seconds": 18
          },
          "effects": [
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 1.2,
              "unit": "RATIO",
              "sourceBinding": "atk"
            },
            {
              "id": "range",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_RANGE",
              "operation": "EXTEND_FORWARD",
              "value": 1,
              "unit": "TILE",
              "sourceBinding": "ability_range_forward_extend"
            },
            {
              "id": "targets",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF_ATTACK",
              "item": "MAX_TARGETS",
              "operation": "SET",
              "value": 2,
              "unit": "ENEMY",
              "sourceBinding": "attack@max_target"
            },
            {
              "id": "single_target",
              "timing": "ON_ATTACK",
              "condition": {
                "metric": "actualAttackTargetCount",
                "comparison": "EQ",
                "value": 1
              },
              "target": "SELF_ATTACK",
              "item": "ATTACK_SCALE",
              "operation": "MULTIPLY",
              "value": 1.6,
              "unit": "MULTIPLIER",
              "sourceBinding": "attack@surtr_s_2[critical].atk_scale"
            }
          ]
        }
      ]
    },
    "source": {
      "description": "攻撃力+120%、攻撃範囲+1マス、攻撃対象数+1\n攻撃対象が1体のみの場合、攻撃力が160%まで上昇",
      "rawDescription": "攻撃力<@ba.vup>+{atk:0%}</>、攻撃範囲<@ba.vup>+{ability_range_forward_extend}</>マス、攻撃対象数<@ba.vup>+1</>\n攻撃対象が1体のみの場合、攻撃力が<@ba.vup>{attack@surtr_s_2[critical].atk_scale:0%}</>まで上昇",
      "blackboard": [
        {
          "key": "atk",
          "value": 1.2,
          "valueStr": null
        },
        {
          "key": "ability_range_forward_extend",
          "value": 1,
          "valueStr": null
        },
        {
          "key": "attack@max_target",
          "value": 2,
          "valueStr": null
        },
        {
          "key": "attack@surtr_s_2[critical].atk_scale",
          "value": 1.6,
          "valueStr": null
        }
      ],
      "rangeId": null,
      "duration": 18
    },
    "notes": [
      "原文の「攻撃対象数＋1」は、blackboardにある上限2体として記述した。攻撃対象数＝1は実際の攻撃対象の条件で、範囲内の敵数とは分けて保持する。",
      "条件付きの「攻撃力が160％まで上昇」は atk_scale＝1.6 を根拠に攻撃倍率へ分けた。攻撃力＋120％の効果へ合算しない。"
    ]
  },
  {
    "basicInfo": {
      "operatorId": "char_172_svrash",
      "operatorName": "シルバーアッシュ",
      "skillId": "skchr_svrash_3",
      "skillIndex": 3,
      "skillName": "真銀斬",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WITH_TIME",
      "initialSp": 75,
      "spCost": 90,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "active",
          "label": "通常",
          "applicability": null,
          "duration": {
            "type": "FIXED_SECONDS",
            "seconds": 30
          },
          "endCondition": {
            "type": "SECONDS_ELAPSED",
            "seconds": 30
          },
          "effects": [
            {
              "id": "def",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "DEF_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": -0.7,
              "unit": "RATIO",
              "sourceBinding": "def"
            },
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 2,
              "unit": "RATIO",
              "sourceBinding": "atk"
            },
            {
              "id": "range",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_RANGE",
              "operation": "REPLACE",
              "value": {
                "rangeId": "3-7"
              },
              "unit": "RANGE_DEFINITION",
              "sourceBinding": "rangeId"
            },
            {
              "id": "targets",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF_ATTACK",
              "item": "MAX_TARGETS",
              "operation": "SET",
              "value": 6,
              "unit": "ENEMY",
              "sourceBinding": "attack@max_target"
            },
            {
              "id": "attack_mode",
              "timing": "ON_ATTACK",
              "condition": null,
              "target": "SELF_ATTACK",
              "item": "ATTACK_TREATMENT",
              "operation": "SET",
              "value": "MELEE",
              "unit": "ATTACK_MODE",
              "sourceBinding": "description"
            }
          ]
        }
      ]
    },
    "source": {
      "description": "防御力-70%、攻撃力+200%、攻撃範囲拡大、敵最大6体を同時に攻撃（近接攻撃と見なす）",
      "rawDescription": "防御力<@ba.vdown>-{-def:0%}</>、攻撃力<@ba.vup>+{atk:0%}</>、攻撃範囲<@ba.vup>拡大</>、敵最大<@ba.vup>{attack@max_target}</>体を同時に攻撃（近接攻撃と見なす）",
      "blackboard": [
        {
          "key": "def",
          "value": -0.7,
          "valueStr": null
        },
        {
          "key": "atk",
          "value": 2,
          "valueStr": null
        },
        {
          "key": "attack@max_target",
          "value": 6,
          "valueStr": null
        }
      ],
      "rangeId": "3-7",
      "duration": 30
    },
    "notes": [
      "「最大6体」と「近接攻撃と見なす」を別の効果として残す。対象数だけでは、攻撃時の減衰や他の条件を計算する情報が不足する。",
      "攻撃範囲は range_table の範囲3-7を参照する。16セルの形を保持できるため、単に「拡大」とだけ記録する必要がない。"
    ]
  },
  {
    "basicInfo": {
      "operatorId": "char_293_thorns",
      "operatorName": "ソーンズ",
      "skillId": "skchr_thorns_3",
      "skillIndex": 3,
      "skillName": "デストレッツァ",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WHEN_ATTACK",
      "initialSp": 0,
      "spCost": 15,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "first",
          "label": "初回",
          "applicability": {
            "metric": "skillActivationCount",
            "comparison": "EQ",
            "value": 1
          },
          "duration": {
            "type": "FIXED_SECONDS",
            "seconds": 30
          },
          "endCondition": {
            "type": "SECONDS_ELAPSED",
            "seconds": 30
          },
          "effects": [
            {
              "id": "range",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_RANGE",
              "operation": "REPLACE",
              "value": {
                "rangeId": "3-3"
              },
              "unit": "RANGE_DEFINITION",
              "sourceBinding": "rangeId"
            },
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 0.6,
              "unit": "RATIO",
              "sourceBinding": "atk"
            },
            {
              "id": "aspd",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_SPEED",
              "operation": "ADD_VALUE",
              "value": 25,
              "unit": "POINT",
              "sourceBinding": "attack_speed"
            },
            {
              "id": "ranged_penalty",
              "timing": "ON_ATTACK",
              "condition": {
                "metric": "attackDistanceType",
                "comparison": "EQ",
                "value": "RANGED"
              },
              "target": "SELF_ATTACK",
              "item": "TRAIT_RANGED_ATK_PENALTY",
              "operation": "SET_ENABLED",
              "value": false,
              "unit": "BOOLEAN",
              "sourceBinding": "description"
            }
          ]
        },
        {
          "id": "second_and_later",
          "label": "2回目以降",
          "applicability": {
            "metric": "skillActivationCount",
            "comparison": "GTE",
            "value": 2
          },
          "duration": {
            "type": "UNTIL_EXIT"
          },
          "endCondition": {
            "type": "OPERATOR_EXIT"
          },
          "effects": [
            {
              "id": "range",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_RANGE",
              "operation": "REPLACE",
              "value": {
                "rangeId": "3-3"
              },
              "unit": "RANGE_DEFINITION",
              "sourceBinding": "rangeId"
            },
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 1.2,
              "unit": "RATIO",
              "sourceBinding": "thorns_s_3[b].atk"
            },
            {
              "id": "aspd",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_SPEED",
              "operation": "ADD_VALUE",
              "value": 50,
              "unit": "POINT",
              "sourceBinding": "thorns_s_3[b].attack_speed"
            },
            {
              "id": "ranged_penalty",
              "timing": "ON_ATTACK",
              "condition": {
                "metric": "attackDistanceType",
                "comparison": "EQ",
                "value": "RANGED"
              },
              "target": "SELF_ATTACK",
              "item": "TRAIT_RANGED_ATK_PENALTY",
              "operation": "SET_ENABLED",
              "value": false,
              "unit": "BOOLEAN",
              "sourceBinding": "description"
            }
          ]
        }
      ],
      "relations": [
        {
          "type": "BONUS_VALUE_RELATION",
          "firstStage": "first",
          "laterStage": "second_and_later",
          "items": [
            "ATK_BUFF_RATIO",
            "ATTACK_SPEED"
          ],
          "multiplier": 2
        }
      ],
      "inputRequirements": [
        "skillActivationCount"
      ]
    },
    "source": {
      "description": "攻撃範囲拡大、攻撃力+60%、攻撃速度+25、特性による遠距離攻撃時の攻撃力低下が無効化される\n2回目以降スキル使用時、攻撃力と攻撃速度のスキル効果が1回目の2倍になり、退場まで効果継続",
      "rawDescription": "攻撃範囲<@ba.vup>拡大</>、攻撃力<@ba.vup>+{atk:0%}</>、攻撃速度<@ba.vup>+{attack_speed}</>、特性による遠距離攻撃時の攻撃力低下が無効化される\n<@ba.rem>2回目以降スキル使用時、攻撃力と攻撃速度のスキル効果が1回目の2倍になり、退場まで効果継続</>",
      "blackboard": [
        {
          "key": "atk",
          "value": 0.6,
          "valueStr": null
        },
        {
          "key": "attack_speed",
          "value": 25,
          "valueStr": null
        },
        {
          "key": "thorns_s_3[b].atk",
          "value": 1.2,
          "valueStr": null
        },
        {
          "key": "thorns_s_3[b].attack_speed",
          "value": 50,
          "valueStr": null
        },
        {
          "key": "thorns_s_3[b].duration",
          "value": -1,
          "valueStr": null
        }
      ],
      "rangeId": "3-3",
      "duration": 30
    },
    "notes": [
      "2回目以降はスキルによる加算量が2倍になる。初回分を残して重ねる指定ではなく、その段階の＋120％と＋50を使う。範囲と遠距離減衰の無効化も両段階に残す。",
      "発動回数を段階選択の入力として保持する。"
    ]
  },
  {
    "basicInfo": {
      "operatorId": "char_263_skadi",
      "operatorName": "スカジ",
      "skillId": "skchr_skadi_2",
      "skillIndex": 2,
      "skillName": "波濤の裂刃",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "PASSIVE"
      ]
    },
    "activationSettings": {
      "spRecovery": "NO_SP",
      "initialSp": 0,
      "spCost": 0,
      "maxCharges": 0,
      "activationMethod": "PASSIVE",
      "activationTrigger": "ON_DEPLOY"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "active",
          "label": "通常",
          "applicability": null,
          "duration": {
            "type": "FIXED_SECONDS",
            "seconds": 30
          },
          "endCondition": {
            "type": "SECONDS_ELAPSED",
            "seconds": 30
          },
          "effects": [
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 1.7,
              "unit": "RATIO",
              "sourceBinding": "atk"
            }
          ]
        }
      ]
    },
    "source": {
      "description": "配置後の30秒間、攻撃力+170%",
      "rawDescription": "配置後の<@ba.vup>{duration}</>秒間、攻撃力<@ba.vup>+{atk:0%}</>",
      "blackboard": [
        {
          "key": "atk",
          "value": 1.7,
          "valueStr": null
        },
        {
          "key": "duration",
          "value": 30,
          "valueStr": null
        }
      ],
      "rangeId": null,
      "duration": -1
    },
    "notes": [
      "配置を契機に始まる30秒の効果。元データのduration=-1ではなく、blackboardのdurationを効果時間として保持する。"
    ]
  },
  {
    "basicInfo": {
      "operatorId": "char_263_skadi",
      "operatorName": "スカジ",
      "skillId": "skchr_skadi_3",
      "skillIndex": 3,
      "skillName": "海嘯の悲歌",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WITH_TIME",
      "initialSp": 70,
      "spCost": 90,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "active",
          "label": "通常",
          "applicability": null,
          "duration": {
            "type": "FIXED_SECONDS",
            "seconds": 50
          },
          "endCondition": {
            "type": "SECONDS_ELAPSED",
            "seconds": 50
          },
          "effects": [
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 1.3,
              "unit": "RATIO",
              "sourceBinding": "atk"
            },
            {
              "id": "def",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "DEF_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 1.3,
              "unit": "RATIO",
              "sourceBinding": "def"
            },
            {
              "id": "max_hp",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "MAX_HP_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 1.3,
              "unit": "RATIO",
              "sourceBinding": "max_hp"
            }
          ]
        }
      ]
    },
    "source": {
      "description": "攻撃力・防御力・最大HP+130%",
      "rawDescription": "攻撃力・防御力・最大HP<@ba.vup>+{atk:0%}</>",
      "blackboard": [
        {
          "key": "atk",
          "value": 1.3,
          "valueStr": null
        },
        {
          "key": "def",
          "value": 1.3,
          "valueStr": null
        },
        {
          "key": "max_hp",
          "value": 1.3,
          "valueStr": null
        }
      ],
      "rangeId": null,
      "duration": 50
    },
    "notes": []
  },
  {
    "basicInfo": {
      "operatorId": "char_350_surtr",
      "operatorName": "スルト",
      "skillId": "skchr_surtr_1",
      "skillIndex": 1,
      "skillName": "レーヴァテイン",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "NEXT_ATTACK"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WHEN_ATTACK",
      "initialSp": 0,
      "spCost": 2,
      "maxCharges": 1,
      "activationMethod": "AUTO",
      "activationTrigger": "NEXT_NORMAL_ATTACK"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "next_attack",
          "label": "次の通常攻撃",
          "applicability": null,
          "duration": {
            "type": "SINGLE_ATTACK"
          },
          "endCondition": {
            "type": "ATTACK_RESOLVED"
          },
          "effects": [
            {
              "id": "attack_scale",
              "timing": "ON_NEXT_NORMAL_ATTACK",
              "condition": null,
              "target": "SELF_ATTACK",
              "item": "ATTACK_SCALE",
              "operation": "MULTIPLY",
              "value": 3.1,
              "unit": "MULTIPLIER",
              "sourceBinding": "atk_scale"
            },
            {
              "id": "sp_restore",
              "timing": "ON_ATTACK_DEFEAT",
              "condition": null,
              "target": "SELF",
              "item": "SP",
              "operation": "FILL_RESOURCE",
              "value": "MAXIMUM",
              "unit": "RESOURCE_LIMIT",
              "sourceBinding": "description"
            }
          ]
        }
      ]
    },
    "source": {
      "description": "次の通常攻撃時、攻撃力が310%まで上昇し、敵を倒すとSPを全回復する",
      "rawDescription": "次の通常攻撃時、攻撃力が<@ba.vup>{atk_scale:0%}</>まで上昇し、敵を倒すとSPを全回復する",
      "blackboard": [
        {
          "key": "atk_scale",
          "value": 3.1,
          "valueStr": null
        }
      ],
      "rangeId": null,
      "duration": 0
    },
    "notes": [
      "攻撃倍率は撃破の有無によらず適用する。SP全回復だけを、その強化攻撃で敵を倒したイベントに結び付ける。"
    ]
  },
  {
    "basicInfo": {
      "operatorId": "char_350_surtr",
      "operatorName": "スルト",
      "skillId": "skchr_surtr_3",
      "skillIndex": 3,
      "skillName": "ラグナロク",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WITH_TIME",
      "initialSp": 0,
      "spCost": 5,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "active",
          "label": "通常",
          "applicability": null,
          "duration": {
            "type": "UNTIL_EXIT"
          },
          "endCondition": {
            "type": "OPERATOR_EXIT"
          },
          "effects": [
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 3.3,
              "unit": "RATIO",
              "sourceBinding": "atk"
            },
            {
              "id": "range",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_RANGE",
              "operation": "EXTEND_FORWARD",
              "value": 2,
              "unit": "TILE",
              "sourceBinding": "ability_range_forward_extend"
            },
            {
              "id": "targets",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF_ATTACK",
              "item": "MAX_TARGETS",
              "operation": "SET",
              "value": 4,
              "unit": "ENEMY",
              "sourceBinding": "attack@max_target"
            },
            {
              "id": "max_hp",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "MAX_HP",
              "operation": "ADD_VALUE",
              "value": 5000,
              "unit": "POINT",
              "sourceBinding": "max_hp"
            },
            {
              "id": "hp_restore",
              "timing": "ON_STAGE_ENTER",
              "condition": null,
              "target": "SELF",
              "item": "HP",
              "operation": "FILL_RESOURCE",
              "value": "MAXIMUM",
              "unit": "RESOURCE_LIMIT",
              "sourceBinding": "description",
              "afterEffects": [
                "max_hp"
              ]
            },
            {
              "id": "hp_loss",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "HP_LOSS_RATE",
              "operation": "INCREASE_TO_CAP",
              "value": {
                "basis": "MAX_HP",
                "maxRatioPerSecond": 0.2,
                "rampDurationSeconds": 60,
                "tickIntervalSeconds": 0.2,
                "curve": "UNSPECIFIED"
              },
              "unit": "HP_LOSS_PROFILE",
              "sourceBinding": "hp_ratio",
              "parameterBindings": {
                "maxRatioPerSecond": "hp_ratio",
                "rampDurationSeconds": "duration",
                "tickIntervalSeconds": "interval"
              }
            }
          ]
        }
      ]
    },
    "source": {
      "description": "自身のHPを最大値まで回復\n攻撃力+330%、攻撃範囲+2マス、攻撃対象数+3、最大HP+5000、HPが徐々に減少（減少割合は時間と共に増加し、60秒後に最大HPの20%/秒になる）\n退場まで効果継続",
      "rawDescription": "自身のHPを最大値まで回復\n攻撃力<@ba.vup>+{atk:0%}</>、攻撃範囲<@ba.vup>+{ability_range_forward_extend}</>マス、攻撃対象数<@ba.vup>+3</>、最大HP<@ba.vup>+{max_hp}</>、HPが徐々に減少（減少割合は時間と共に増加し、<@ba.vup>{duration}</>秒後に最大HPの{hp_ratio:0%}/秒になる）\n<@ba.rem>退場まで効果継続</>",
      "blackboard": [
        {
          "key": "atk",
          "value": 3.3,
          "valueStr": null
        },
        {
          "key": "ability_range_forward_extend",
          "value": 2,
          "valueStr": null
        },
        {
          "key": "max_hp",
          "value": 5000,
          "valueStr": null
        },
        {
          "key": "interval",
          "value": 0.2,
          "valueStr": null
        },
        {
          "key": "hp_ratio",
          "value": 0.2,
          "valueStr": null
        },
        {
          "key": "duration",
          "value": 60,
          "valueStr": null
        },
        {
          "key": "attack@max_target",
          "value": 4,
          "valueStr": null
        }
      ],
      "rangeId": null,
      "duration": -1
    },
    "notes": [
      "全回復は最大HP加算の適用後に行う。60秒はHP減少率が上限に達する時間で、スキルの終了時刻ではない。",
      "HP減少の上限・到達時間・処理間隔を保持する。"
    ]
  },
  {
    "basicInfo": {
      "operatorId": "char_172_svrash",
      "operatorName": "シルバーアッシュ",
      "skillId": "skchr_svrash_1",
      "skillIndex": 1,
      "skillName": "強撃γ",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "NEXT_ATTACK"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WHEN_ATTACK",
      "initialSp": 0,
      "spCost": 2,
      "maxCharges": 1,
      "activationMethod": "AUTO",
      "activationTrigger": "NEXT_NORMAL_ATTACK"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "next_attack",
          "label": "次の通常攻撃",
          "applicability": null,
          "duration": {
            "type": "SINGLE_ATTACK"
          },
          "endCondition": {
            "type": "ATTACK_RESOLVED"
          },
          "effects": [
            {
              "id": "attack_scale",
              "timing": "ON_NEXT_NORMAL_ATTACK",
              "condition": null,
              "target": "SELF_ATTACK",
              "item": "ATTACK_SCALE",
              "operation": "MULTIPLY",
              "value": 2.9,
              "unit": "MULTIPLIER",
              "sourceBinding": "atk_scale"
            }
          ]
        }
      ]
    },
    "source": {
      "description": "次の通常攻撃時、攻撃力が290%まで上昇",
      "rawDescription": "次の通常攻撃時、攻撃力が<@ba.vup>{atk_scale:0%}</>まで上昇",
      "blackboard": [
        {
          "key": "atk_scale",
          "value": 2.9,
          "valueStr": null
        }
      ],
      "rangeId": null,
      "duration": 0
    },
    "notes": []
  },
  {
    "basicInfo": {
      "operatorId": "char_172_svrash",
      "operatorName": "シルバーアッシュ",
      "skillId": "skchr_svrash_2",
      "skillIndex": 2,
      "skillName": "雪境生存戦略",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED",
        "MODE"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WITH_TIME",
      "initialSp": 0,
      "spCost": 5,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "initial",
          "label": "初期状態",
          "applicability": {
            "metric": "skillMode",
            "comparison": "EQ",
            "value": "INITIAL"
          },
          "duration": {
            "type": "UNTIL_MODE_CHANGE"
          },
          "endCondition": {
            "type": "MODE_CHANGE_OR_EXIT"
          },
          "effects": []
        },
        {
          "id": "alternate",
          "label": "切替後",
          "applicability": {
            "metric": "skillMode",
            "comparison": "EQ",
            "value": "ALTERNATE"
          },
          "duration": {
            "type": "UNTIL_MODE_CHANGE"
          },
          "endCondition": {
            "type": "MODE_CHANGE_OR_EXIT"
          },
          "effects": [
            {
              "id": "range",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_RANGE",
              "operation": "REPLACE",
              "value": {
                "rangeId": "1-2"
              },
              "unit": "RANGE_DEFINITION",
              "sourceBinding": "rangeId"
            },
            {
              "id": "def",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "DEF_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 1,
              "unit": "RATIO",
              "sourceBinding": "def"
            },
            {
              "id": "hp_restore",
              "timing": {
                "type": "PERIODIC",
                "intervalSeconds": 1
              },
              "condition": null,
              "target": "SELF",
              "item": "HP_RESTORE_RATIO",
              "operation": "RESTORE",
              "value": 0.06,
              "unit": "MAX_HP_RATIO",
              "sourceBinding": "hp_recovery_per_sec_by_max_hp_ratio"
            }
          ]
        }
      ],
      "inputRequirements": [
        "skillMode"
      ],
      "modeTransitions": [
        {
          "trigger": "SKILL_ACTIVATION",
          "from": "INITIAL",
          "to": "ALTERNATE"
        },
        {
          "trigger": "SKILL_ACTIVATION",
          "from": "ALTERNATE",
          "to": "INITIAL"
        }
      ]
    },
    "source": {
      "description": "発動するたび初期状態と次の状態とが切り替わる：\n攻撃範囲縮小、防御力+100%、1秒ごとにHPが最大値の6.0%回復",
      "rawDescription": "<@ba.rem>発動するたび初期状態と次の状態とが切り替わる：</>\n攻撃範囲<@ba.vdown>縮小</>、防御力<@ba.vup>+{def:0%}</>、1秒ごとにHPが最大値の<@ba.vup>{HP_RECOVERY_PER_SEC_BY_MAX_HP_RATIO:0.0%}</>回復",
      "blackboard": [
        {
          "key": "def",
          "value": 1,
          "valueStr": null
        },
        {
          "key": "hp_recovery_per_sec_by_max_hp_ratio",
          "value": 0.06,
          "valueStr": null
        }
      ],
      "rangeId": "1-2",
      "duration": 0
    },
    "notes": [
      "手動発動のたびに初期状態と切替後を往復する。初期状態はこのスキルによる変更がなく、通常の性能を引き継ぐ。"
    ]
  },
  {
    "basicInfo": {
      "operatorId": "char_293_thorns",
      "operatorName": "ソーンズ",
      "skillId": "skcom_atk_up[3]",
      "skillIndex": 1,
      "skillName": "攻撃力強化γ",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WITH_TIME",
      "initialSp": 15,
      "spCost": 30,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "active",
          "label": "通常",
          "applicability": null,
          "duration": {
            "type": "FIXED_SECONDS",
            "seconds": 30
          },
          "endCondition": {
            "type": "SECONDS_ELAPSED",
            "seconds": 30
          },
          "effects": [
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 1,
              "unit": "RATIO",
              "sourceBinding": "atk"
            }
          ]
        }
      ]
    },
    "source": {
      "description": "攻撃力+100%",
      "rawDescription": "攻撃力<@ba.vup>+{atk:0%}</>",
      "blackboard": [
        {
          "key": "atk",
          "value": 1,
          "valueStr": null
        }
      ],
      "rangeId": null,
      "duration": 30
    },
    "notes": []
  },
  {
    "basicInfo": {
      "operatorId": "char_293_thorns",
      "operatorName": "ソーンズ",
      "skillId": "skchr_thorns_2",
      "skillIndex": 2,
      "skillName": "迎撃針棘",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WITH_TIME",
      "initialSp": 10,
      "spCost": 25,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "active",
          "label": "通常",
          "applicability": null,
          "duration": {
            "type": "FIXED_SECONDS",
            "seconds": 40
          },
          "endCondition": {
            "type": "SECONDS_ELAPSED",
            "seconds": 40
          },
          "effects": [
            {
              "id": "normal_attack",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "NORMAL_ATTACK_ENABLED",
              "operation": "SET_ENABLED",
              "value": false,
              "unit": "BOOLEAN",
              "sourceBinding": "description"
            },
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 0.6,
              "unit": "RATIO",
              "sourceBinding": "atk"
            },
            {
              "id": "def",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "DEF_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 1.1,
              "unit": "RATIO",
              "sourceBinding": "def"
            },
            {
              "id": "counter_attack",
              "timing": "ON_INCOMING_NORMAL_ATTACK",
              "condition": null,
              "target": "ENEMIES_IN_ACTION_RANGE",
              "item": "TRIGGERED_ATTACK",
              "operation": "EXECUTE_ATTACK",
              "value": {
                "count": 1,
                "treatment": "RANGED",
                "rangeId": "3-1",
                "maxTargets": 4,
                "cooldownSeconds": 0.6
              },
              "unit": "ATTACK_ACTION",
              "sourceBinding": "description",
              "parameterBindings": {
                "count": "description",
                "treatment": "description",
                "rangeId": "rangeId",
                "maxTargets": "max_target",
                "cooldownSeconds": "cooldown"
              }
            }
          ]
        }
      ]
    },
    "source": {
      "description": "攻撃しなくなり、攻撃力+60%、防御力+110%、敵の通常攻撃を受ける時、前方一定範囲内の敵最大4体に遠距離攻撃を1回行う（0.6秒内発動上限1回）",
      "rawDescription": "攻撃しなくなり、攻撃力<@ba.vup>+{atk:0%}</>、防御力<@ba.vup>+{def:0%}</>、敵の通常攻撃を受ける時、前方一定範囲内の敵最大<@ba.vup>{max_target}</>体に遠距離攻撃を1回行う（<@ba.vup>{cooldown:0.0}</>秒内発動上限1回）",
      "blackboard": [
        {
          "key": "atk",
          "value": 0.6,
          "valueStr": null
        },
        {
          "key": "def",
          "value": 1.1,
          "valueStr": null
        },
        {
          "key": "cooldown",
          "value": 0.6,
          "valueStr": null
        },
        {
          "key": "max_target",
          "value": 4,
          "valueStr": null
        }
      ],
      "rangeId": "3-1",
      "duration": 40
    },
    "notes": [
      "通常攻撃の停止と、被通常攻撃を契機とする反撃を分ける。反撃の範囲・対象数・攻撃回数・最短発動間隔は一つの攻撃アクションに属する。",
      "0.6秒は反撃の最短発動間隔で、通常攻撃の間隔や周期的な自動反撃ではない。遠距離減衰の無効化など、説明文にない効果は追加しない。"
    ]
  }
]

export const SKILL_STRUCTURE_RANGES: Readonly<Record<string, SkillStructureRange>> = {
  '3-12': {
    id: '3-12', direction: 1,
    grids: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 0, col: 0 }, { row: 0, col: 1 },
      { row: 0, col: 2 }, { row: 0, col: 3 }, { row: -1, col: 0 }, { row: -1, col: 1 }],
  },
  'x-1': {
    id: 'x-1', direction: 1,
    grids: [{ row: 2, col: 0 }, { row: 1, col: -1 }, { row: 1, col: 0 }, { row: 1, col: 1 },
      { row: 0, col: -2 }, { row: 0, col: -1 }, { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 },
      { row: -1, col: -1 }, { row: -1, col: 0 }, { row: -1, col: 1 }, { row: -2, col: 0 }],
  },
  "3-3": {
    "id": "3-3",
    "direction": 1,
    "grids": [
      {
        "row": 1,
        "col": 0
      },
      {
        "row": 1,
        "col": 1
      },
      {
        "row": 1,
        "col": 2
      },
      {
        "row": 1,
        "col": 3
      },
      {
        "row": 0,
        "col": 0
      },
      {
        "row": 0,
        "col": 1
      },
      {
        "row": 0,
        "col": 2
      },
      {
        "row": 0,
        "col": 3
      },
      {
        "row": -1,
        "col": 0
      },
      {
        "row": -1,
        "col": 1
      },
      {
        "row": -1,
        "col": 2
      },
      {
        "row": -1,
        "col": 3
      }
    ]
  },
  "3-7": {
    "id": "3-7",
    "direction": 1,
    "grids": [
      {
        "row": 3,
        "col": 0
      },
      {
        "row": 2,
        "col": 0
      },
      {
        "row": 2,
        "col": 1
      },
      {
        "row": 1,
        "col": 0
      },
      {
        "row": 1,
        "col": 1
      },
      {
        "row": 1,
        "col": 2
      },
      {
        "row": 0,
        "col": 0
      },
      {
        "row": 0,
        "col": 1
      },
      {
        "row": 0,
        "col": 2
      },
      {
        "row": 0,
        "col": 3
      },
      {
        "row": -1,
        "col": 0
      },
      {
        "row": -1,
        "col": 1
      },
      {
        "row": -1,
        "col": 2
      },
      {
        "row": -2,
        "col": 0
      },
      {
        "row": -2,
        "col": 1
      },
      {
        "row": -3,
        "col": 0
      }
    ]
  },
  "1-2": {
  "id": "1-2",
  "direction": 1,
  "grids": [
    {
      "row": 1,
      "col": 0
    },
    {
      "row": 0,
      "col": 0
    },
    {
      "row": 0,
      "col": 1
    },
    {
      "row": -1,
      "col": 0
    }
  ]
},
  "3-1": {
  "id": "3-1",
  "direction": 1,
  "grids": [
    {
      "row": 1,
      "col": 0
    },
    {
      "row": 1,
      "col": 1
    },
    {
      "row": 1,
      "col": 2
    },
    {
      "row": 0,
      "col": 0
    },
    {
      "row": 0,
      "col": 1
    },
    {
      "row": 0,
      "col": 2
    },
    {
      "row": 0,
      "col": 3
    },
    {
      "row": -1,
      "col": 0
    },
    {
      "row": -1,
      "col": 1
    },
    {
      "row": -1,
      "col": 2
    }
  ]
}
}
