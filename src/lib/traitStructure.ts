import type { RawBlackboardEntry, RawUnlockCondition, SkillRecord } from '../types/skill.ts'
import type { TraitCoarseCategory } from './traitCoarseClassification.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import { expandSkillDescription } from './skillJsonAnalysis.ts'
import {
  formatCombatCondition, formatCombatTiming, formatCombatRecipient, formatCombatNumericValue,
  formatCombatNumber, getCombatContextDefinitionRows, getCombatNumericDefinitionRows,
  type CombatEffectContext, type CombatCondition, type CombatNumericValue, type CombatTiming,
} from './combatEffectStructure.ts'

/** Job definitions are shared by the structure page and the trait combat evaluator. */
export const TRAIT_STRUCTURE_JOB_IDS = ['fighter', 'lord', 'crusher', 'hammer', 'sword', 'centurion',
  'artsfghter', 'musha', 'instructor', 'fearless', 'reaper', 'librator',
  'pioneer', 'agent', 'charger', 'stalker', 'protector', 'shotprotector', 'artsprotector', 'unyield', 'duelist', 'guardian', 'fortress', 'counsellor',
  'fastshot', 'aoesniper', 'longrange', 'siegesniper', 'reaperrange', 'closerange', 'hunter', 'bombarder', 'loopshooter', 'skybreaker', 'craftsman', 'merchant', 'dollkeeper',
  'corecaster', 'splashcaster', 'blastcaster', 'chain', 'slower', 'underminer', 'incantationmedic', 'phalanx',
  'traper', 'skywalker', 'mercenary', 'physician', 'watchman', 'chainhealer', 'mystic'] as const
export type TraitStructureJobId = typeof TRAIT_STRUCTURE_JOB_IDS[number]
export interface TraitStructureSelection { readonly operatorId: string }
export interface TraitStructureGrowthSelection { readonly phaseIndex?: number; readonly operatorLevel?: number }
export type TraitStructureOperator = Pick<SkillRecord, 'operatorId' | 'operatorName' | 'profession' | 'professionLabel'
  | 'subProfessionId' | 'subProfessionName' | 'operatorProfile'>

export type TraitStructureEffect = CombatEffectContext & {
  /** Domain and damage-model relevance never assert support by Damage Calculator 3. */
  readonly relevance: 'DAMAGE' | 'SURVIVAL' | 'CONTROL'
  readonly calculationRelevance: 'RELEVANT' | 'NOT_RELEVANT'
  /** BASE_ATTRIBUTE is a reference to an existing value, never another bonus to add. */
  readonly application: 'BASE_ATTRIBUTE' | 'ATTACK_RULE' | 'DYNAMIC_RULE'
  readonly resolution: 'RESOLVED' | 'PARTIAL'
} & (
  | { readonly item: 'BLOCK_COUNT' | 'MAX_TARGETS'; readonly operation: 'SET'; readonly unit: 'ENEMY'; readonly value: CombatNumericValue }
  | { readonly item: 'HIT_COUNT' | 'STORED_CHARGES'; readonly operation: 'SET'; readonly unit: 'HIT'; readonly value: CombatNumericValue }
  | { readonly item: 'ATTACK_SCALE'; readonly operation: 'MULTIPLY'; readonly unit: 'MULTIPLIER'; readonly value: CombatNumericValue }
  | { readonly item: 'DAMAGE_TYPE'; readonly operation: 'SET'; readonly unit: 'DAMAGE_TYPE'; readonly value: 'ARTS' | 'PHYSICAL' }
  | { readonly item: 'RANGED_ATTACK_ENABLED' | 'NORMAL_ATTACK_ENABLED' | 'ALLY_HEALING_ENABLED' | 'NATURAL_SP_RECOVERY_ENABLED'; readonly operation: 'SET_ENABLED'; readonly unit: 'BOOLEAN'; readonly value: boolean }
  | { readonly item: 'ATTACK_RANGE'; readonly operation: 'USE_BASE_ATTRIBUTE'; readonly unit: 'RANGE_DEFINITION'; readonly value: { readonly rangeId: string | null } }
  | { readonly item: 'ATTACK_PRIORITY'; readonly operation: 'SET'; readonly unit: 'PRIORITY_RULE'; readonly value: 'AIRBORNE' | 'LOWEST_DEFENSE' | 'HIGHEST_WEIGHT' }
  | { readonly item: 'STATUS'; readonly operation: 'SET_ENABLED'; readonly unit: 'STATUS'; readonly value: 'SLUGGISH' }
  | { readonly item: 'DEFENSE_BUFF_RATIO'; readonly operation: 'ADD_RATIO'; readonly unit: 'RATIO'; readonly value: CombatNumericValue }
  | { readonly item: 'PHYSICAL_DODGE' | 'ARTS_DODGE'; readonly operation: 'ADD_RATIO'; readonly unit: 'RATIO'; readonly value: CombatNumericValue }
  | { readonly item: 'REDEPLOY_TIME'; readonly operation: 'USE_BASE_ATTRIBUTE'; readonly unit: 'SECOND'; readonly value: CombatNumericValue }
  | { readonly item: 'DP_ON_KILL'; readonly operation: 'ADD_VALUE'; readonly unit: 'POINT'; readonly value: CombatNumericValue }
  | { readonly item: 'RETREAT_COST_REFUND'; readonly operation: 'SET'; readonly unit: 'REFUND_RULE'; readonly value: 'INITIAL_DEPLOY_COST' | 'NONE' }
  | { readonly item: 'DP_CONSUMPTION'; readonly operation: 'ADD_VALUE'; readonly unit: 'POINT'; readonly value: CombatNumericValue }
  | { readonly item: 'REPLACEMENT_DURATION'; readonly operation: 'SET'; readonly unit: 'SECOND'; readonly value: CombatNumericValue }
  | { readonly item: 'TARGET_PRIORITY'; readonly operation: 'SET'; readonly unit: 'TARGET_PRIORITY'; readonly value: 'LOW' }
  | { readonly item: 'MAGIC_RESISTANCE'; readonly operation: 'ADD_VALUE'; readonly unit: 'POINT'; readonly value: CombatNumericValue }
  | { readonly item: 'DAMAGE_TO_HEAL_RATIO'; readonly operation: 'RESTORE'; readonly unit: 'DAMAGE_RATIO'; readonly value: CombatNumericValue }
  | { readonly item: 'ATTACK_TARGETING'; readonly operation: 'SET'; readonly unit: 'TARGET_SELECTION'; readonly value: {
      readonly mode: 'AREA' | 'LINE'; readonly maxTargets: null; readonly rangeId: null
    } }
  | { readonly item: 'SPLASH_DAMAGE'; readonly operation: 'SET'; readonly unit: 'SPLASH_RULE'; readonly value: {
      readonly damageType: 'PHYSICAL'; readonly attackScale: CombatNumericValue; readonly radiusTiles: CombatNumericValue
      readonly center: 'ATTACK_TARGET'; readonly includeMainTarget: false
    } }
  | { readonly item: 'CHAIN_ATTACK'; readonly operation: 'SET'; readonly unit: 'CHAIN_RULE'; readonly value: {
      readonly maxTargets: CombatNumericValue; readonly retention: CombatNumericValue
    } }
  | { readonly item: 'AFTERSHOCK'; readonly operation: 'SET'; readonly unit: 'AFTERSHOCK_RULE'; readonly value: {
      readonly attackScale: CombatNumericValue
    } }
  | { readonly item: 'HP'; readonly operation: 'RESTORE'; readonly unit: 'POINT'; readonly value: CombatNumericValue
      readonly applications: { readonly basis: 'ENEMIES_HIT' | 'UNSPECIFIED'; readonly perAttackLimit: CombatNumericValue } }
  | { readonly item: 'ATK_BUFF_RATIO'; readonly operation: 'INCREASE_TO_CAP'; readonly unit: 'RAMP_PROFILE'; readonly value: {
      readonly maxRatio: CombatNumericValue; readonly secondsToCap: CombatNumericValue; readonly curve: 'UNSPECIFIED'
      readonly accumulateWhile: CombatCondition; readonly resetEvent: 'SKILL_END'
    } }
  | { readonly item: 'ATK_BUFF_RATIO'; readonly operation: 'RESET_SOURCE_VALUE'; readonly unit: 'RATIO'; readonly value: 0
      readonly resetEffectId: string }
)

export interface TraitStructure {
  readonly basicInfo: TraitStructureSelection & {
    readonly operatorName: string; readonly profession: string; readonly professionLabel: string
    readonly subProfessionId: string; readonly subProfessionName: string
    readonly phaseIndex: number; readonly operatorLevel: number; readonly potentialRank: 1; readonly module: 'NONE'
  }
  readonly classificationInfo: { readonly definitionScope: 'JOB'; readonly coarseCategories: readonly TraitCoarseCategory[] }
  readonly activationSettings: { readonly activationMethod: 'PASSIVE'; readonly triggers: readonly CombatTiming[] }
  readonly status: 'STRUCTURED' | 'PARTIAL' | 'UNREVIEWED'
  readonly effects: readonly TraitStructureEffect[]
  readonly source: {
    readonly description: string; readonly rawDescription: string; readonly blackboard: readonly RawBlackboardEntry[]
    readonly requiredPotentialRank: number; readonly unlockCondition?: RawUnlockCondition; readonly prefabKey: string | null
    readonly rangeId: string | null
  }
  readonly issues: readonly string[]
  readonly notes: readonly string[]
}

interface JobDefinition {
  readonly descriptions: readonly string[]
  readonly keys: readonly string[]
  readonly categories: readonly TraitCoarseCategory[]
  readonly profession?: string
  readonly prefabKey?: string
  readonly rangeId?: string
  readonly rangeIds?: readonly (string | null)[]
}
const BLOCK = '敵を1体までブロック'
const MULTI = 'ブロック中の敵全員を同時に攻撃'
const MUSHA = '味方の治療対象にならない 敵を攻撃するたび自身のHPを{value}回復'
const REAPER = '味方の治療対象にならない 攻撃は範囲物理ダメージを与え、敵を1体攻撃するたび自身のHPを{value}回復(攻撃毎の最大回復回数はブロック数と同じ)'
const LIBRATOR = '通常時は攻撃せずブロック数が0となり、攻撃力が+{atk:0%}まで徐々に上昇していく(最大値になるまでの時間は{max_stack_cnt}秒) スキル終了時、特性による攻撃力上昇効果をリセット'
/** Exact reviewed JP semantics. Additional clauses never inherit a partial match. */
const DEFINITIONS: Record<TraitStructureJobId, JobDefinition> = {
  fighter: { descriptions: [BLOCK], keys: [], categories: ['BLOCK'] },
  fearless: { descriptions: [BLOCK], keys: [], categories: ['BLOCK'] },
  lord: { descriptions: ['80%の攻撃力で遠距離攻撃も行える'], keys: ['atk_scale'], categories: ['ATTACK_BEHAVIOR', 'DAMAGE'] },
  crusher: { descriptions: [MULTI], keys: [], categories: ['ATTACK_BEHAVIOR'] },
  centurion: { descriptions: [MULTI], keys: [], categories: ['ATTACK_BEHAVIOR'] },
  hammer: { descriptions: ['攻撃対象の周囲にいる敵に攻撃力の{attack@atk_scale_2:0%}の範囲物理ダメージを与える',
    '攻撃対象の周囲にいる敵に攻撃力の50%の範囲物理ダメージを与える'], keys: ['attack@ability_range_radius', 'attack@atk_scale_2'], categories: ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE', 'DAMAGE'] },
  sword: { descriptions: ['通常攻撃時、1回の攻撃で2回ダメージを与える'], keys: [], categories: ['ATTACK_BEHAVIOR'] },
  artsfghter: { descriptions: ['敵に術ダメージを与える'], keys: [], categories: ['DAMAGE_TYPE'] },
  musha: { descriptions: [MUSHA, `${MUSHA}(昇進1で効果強化)`, `${MUSHA}(昇進2で効果強化)`], keys: ['value'], categories: ['HEAL_RESTRICTION', 'HP_CHANGE'] },
  instructor: { descriptions: ['攻撃距離がやや長い、自身がブロックしていない敵を攻撃時、攻撃力が120%まで上昇'], keys: ['atk_scale'], categories: ['ATTACK_BEHAVIOR', 'DAMAGE'] },
  reaper: { descriptions: [REAPER, REAPER.replace('{value}', '50')], keys: ['value'], categories: ['HEAL_RESTRICTION', 'ATTACK_BEHAVIOR', 'DAMAGE_TYPE', 'HP_CHANGE'] },
  librator: { descriptions: [LIBRATOR, `${LIBRATOR}する`], keys: ['atk', 'max_stack_cnt', 'mid_stack_cnt', 'half_cnt_for_fx'], categories: ['ATTACK_BEHAVIOR', 'BLOCK', 'ABILITY'] },
  pioneer: { profession: 'PIONEER', descriptions: ['敵を2体までブロック'], keys: [], categories: ['BLOCK'] },
  agent: { profession: 'PIONEER', descriptions: ['再配置までの時間が短い、遠距離攻撃も行える'], keys: [], categories: ['DEPLOYMENT', 'ATTACK_BEHAVIOR'] },
  charger: { profession: 'PIONEER', descriptions: ['敵を倒す度所持コスト+1 撤退時に初期配置時のコストを返却'], keys: ['cost'], categories: ['RESOURCE', 'DEPLOYMENT'] },
  stalker: { profession: 'SPECIAL', descriptions: ['攻撃範囲内の敵全員を同時に攻撃 物理回避、術回避が50%上昇 敵に狙われにくい'], keys: ['prob'], categories: ['ATTACK_BEHAVIOR', 'ABILITY'] },
  protector: { profession: 'TANK', descriptions: ['敵を3体までブロック'], keys: [], categories: ['BLOCK'] },
  shotprotector: { profession: 'TANK', descriptions: ['敵を3体までブロック、遠距離攻撃も行える'], keys: [], categories: ['BLOCK', 'ATTACK_BEHAVIOR'] },
  artsprotector: { profession: 'TANK', descriptions: ['スキル発動中、敵に術ダメージを与える'], keys: [], categories: ['DAMAGE_TYPE'] },
  unyield: { profession: 'TANK', descriptions: ['味方からの治療効果を受けない'], keys: [], categories: ['HEAL_RESTRICTION'] },
  duelist: { profession: 'TANK', descriptions: ['未ブロック時、SPが自然回復しない'], keys: [], categories: ['RESOURCE'] },
  guardian: { profession: 'TANK', descriptions: ['HP回復スキルを所持'], keys: [], categories: ['HP_CHANGE'] },
  fortress: { profession: 'TANK', descriptions: ['未ブロック時、遠距離範囲物理攻撃を行う'], keys: [], categories: ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE'] },
  counsellor: { profession: 'PIONEER', descriptions: ['敵を2体までブロック 配置待機エリアの味方ユニットを強化可能'], keys: [], categories: ['BLOCK', 'ABILITY'] },
  fastshot: { profession: 'SNIPER', descriptions: ['飛行ユニットを優先して攻撃'], keys: [], categories: ['ATTACK_BEHAVIOR'] },
  aoesniper: { profession: 'SNIPER', descriptions: ['敵に範囲物理ダメージを与える'], keys: [], categories: ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE'] },
  longrange: { profession: 'SNIPER', descriptions: ['攻撃範囲内の防御力が一番低い敵を優先して攻撃'], keys: [], categories: ['ATTACK_BEHAVIOR'] },
  siegesniper: { profession: 'SNIPER', descriptions: ['重量が最も重い敵を優先して攻撃'], keys: [], categories: ['ATTACK_BEHAVIOR'] },
  reaperrange: { profession: 'SNIPER', descriptions: ['攻撃範囲内の敵全員を同時に攻撃し、自身の正面横3マスにいる敵を攻撃時攻撃力が150%まで上昇'],
    keys: ['atk_scale'], prefabKey: '-1', rangeId: '1-3', categories: ['ATTACK_BEHAVIOR', 'DAMAGE'] },
  closerange: { profession: 'SNIPER', descriptions: ['高威力の中距離射撃'], keys: [], categories: ['ATTACK_BEHAVIOR'] },
  hunter: { profession: 'SNIPER', descriptions: ['弾が装填されている状態でのみ攻撃でき、攻撃力が{atk_scale:0%}に上昇する。攻撃をしていない時は弾の装填を行う(最大装弾数:{value})'],
    keys: ['value', 'atk_scale'], prefabKey: '-1', categories: ['ATTACK_BEHAVIOR', 'DAMAGE'] },
  bombarder: { profession: 'SNIPER', descriptions: ['通常攻撃は地面上の敵に2回の範囲物理ダメージを与える(2回目は余震、与ダメージが攻撃力の50%になる)'],
    keys: ['attack@append_atk_scale', 'attack@times', 'attack@enable_third_attack'], prefabKey: '-1', categories: ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE', 'DAMAGE'] },
  loopshooter: { profession: 'SNIPER', descriptions: ['旋回投擲物を所持している場合のみ攻撃できる(投擲物は攻撃後一定速度で手元に戻る)'], keys: [], categories: ['ATTACK_BEHAVIOR'] },
  skybreaker: { profession: 'SNIPER', descriptions: ['配置後離陸する 離陸中は飛行ユニットのみを攻撃 スキル発動中は降下して範囲物理攻撃を行う'], keys: [], categories: ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE'] },
  craftsman: { profession: 'SUPPORT', descriptions: ['敵を2体までブロック <支援装置>を使用可能'], keys: [], categories: ['BLOCK', 'RESOURCE'] },
  merchant: { profession: 'SPECIAL', descriptions: ['再配置までの時間が短い 撤退時にコストを返却しない 配置中、3秒ごとにコストを3消費(所持コスト不足時自動的に撤退)'], keys: ['interval', 'cost'], categories: ['RESOURCE', 'DEPLOYMENT'] },
  dollkeeper: { profession: 'SPECIAL', descriptions: ['致命的なダメージを受けても撤退せず、<身替り>と入れ替わり戦闘を続行する(身替りのブロック数は0)。20秒後<身替り>から再び自身に入れ替わる'],
    keys: ['duration', 'atk', 'max_hp', 'talent_override_rangeid_flag'], prefabKey: '-1', rangeIds: [null, 'x-4', 'x-1', '1-1'], categories: ['HP_CHANGE', 'SUMMON'] },
  corecaster: { profession: 'CASTER', descriptions: ['敵に術ダメージを与える'], keys: [], categories: ['DAMAGE_TYPE'] },
  splashcaster: { profession: 'CASTER', descriptions: ['敵に範囲術ダメージを与える'], keys: [], categories: ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE'] },
  blastcaster: { profession: 'CASTER', descriptions: ['直線上の敵に範囲術ダメージを与える'], keys: [], categories: ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE'] },
  chain: { profession: 'CASTER', descriptions: ['{attack@max_target}体目まで跳躍していく術ダメージを敵に与え、跳躍するたびダメージが15%減衰し、敵を一瞬足止め'],
    keys: ['attack@max_target', 'attack@sluggish'], prefabKey: '-1', categories: ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE', 'DAMAGE', 'STATUS'] },
  slower: { profession: 'SUPPORT', descriptions: ['敵に術ダメージを与える 攻撃時、敵を一瞬足止め'], keys: ['sluggish'], categories: ['DAMAGE_TYPE', 'STATUS'] },
  underminer: { profession: 'SUPPORT', descriptions: ['敵に術ダメージを与える'], keys: [], categories: ['DAMAGE_TYPE'] },
  incantationmedic: { profession: 'MEDIC', descriptions: ['術ダメージを与え、敵を攻撃するたび攻撃範囲内の味方1人のHPを与ダメージの{scale:0%}回復'],
    keys: ['scale'], categories: ['DAMAGE_TYPE', 'HP_CHANGE'] },
  mystic: { profession: 'CASTER', descriptions: ['敵に術ダメージを与える 攻撃の対象がいない場合はエネルギーをチャージして(最大3回)次の攻撃時に一斉発射する'],
    keys: ['times', 'times_2'], categories: ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE'] },
  phalanx: { profession: 'CASTER', descriptions: ['通常時攻撃しない、防御力と術耐性大幅上昇 スキル発動中、通常攻撃が攻撃範囲内の敵全員に範囲術ダメージを与える'],
    keys: ['def', 'magic_resistance'], categories: ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE', 'ABILITY'] },
  traper: { profession: 'SPECIAL', descriptions: ['罠を使用可能、敵のいるマスに罠配置不可'], keys: [], categories: ['SUMMON', 'DEPLOYMENT'] },
  skywalker: { profession: 'SPECIAL', descriptions: ['離陸中、空中の敵を2体までブロックできる'], keys: [], categories: ['BLOCK'] },
  mercenary: { profession: 'WARRIOR', descriptions: ['コストを消費して戦闘能力を強化できる'], keys: [], categories: ['RESOURCE', 'ABILITY'] },
  physician: { profession: 'MEDIC', descriptions: ['味方のHPを回復'], keys: [], categories: ['HP_CHANGE'] },
  watchman: { profession: 'MEDIC', descriptions: ['味方のHPを回復 離陸できる'], keys: [], categories: ['HP_CHANGE', 'ATTACK_BEHAVIOR'] },
  chainhealer: { profession: 'MEDIC', descriptions: ['味方のHPを回復 味方を治療する際、3体目の味方まで治療が跳躍していく(跳躍するたびに治療量は25%ずつ減衰)'],
    keys: ['attack@chain.max_target', 'attack@chain.atk_scale'], prefabKey: '-1', categories: ['HP_CHANGE', 'ATTACK_BEHAVIOR'] },
}

export function isTraitStructureOperator(row: Pick<SkillRecord, 'profession' | 'subProfessionId'>): boolean {
  const definition = DEFINITIONS[row.subProfessionId as TraitStructureJobId]
  return Boolean(definition) && row.profession === (definition.profession ?? 'WARRIOR')
}
export function findTraitStructure(selection: TraitStructureSelection, structures: readonly TraitStructure[]): TraitStructure | null {
  return structures.find(structure => structure.basicInfo.operatorId === selection.operatorId) ?? null
}

/** Potential 1 and no module; source overrides at the chosen promotion/level take precedence. */
export function buildTraitStructures(rows: readonly TraitStructureOperator[], growth: TraitStructureGrowthSelection = {}): TraitStructure[] {
  const operators = new Map(rows.map(row => [row.operatorId, row]))
  return [...operators.values()].filter(isTraitStructureOperator).flatMap(operator => {
    const profile = operator.operatorProfile
    const phaseIndex = growth.phaseIndex ?? profile.phases.length - 1
    const maxLevel = profile.phases[phaseIndex]?.maxLevel
    const operatorLevel = growth.operatorLevel ?? maxLevel
    if (!Number.isInteger(phaseIndex) || phaseIndex < 0 || !Number.isInteger(maxLevel) || !maxLevel
      || !Number.isInteger(operatorLevel) || !operatorLevel || operatorLevel < 1 || operatorLevel > maxLevel) return []
    const passive = getOperatorPassives(profile, phaseIndex, operatorLevel, 1).sources.find(source => source.sourceKind === 'TRAIT')
    const candidate = profile.trait?.candidates?.filter(entry => entry.unlockCondition === passive?.unlockCondition
      && (entry.requiredPotentialRank ?? 0) === passive?.requiredPotentialRank).at(-1)
    const rawDescription = candidate?.overrideDescripton ?? candidate?.overrideDescription
      ?? profile.traitDescription ?? profile.subProfessionTraitDescription ?? ''
    const blackboard = passive?.blackboard ?? []
    const description = normalize(expandSkillDescription(rawDescription, blackboard).replace(/\{[^{}]+\}/g, '未確認'))
    const definition = DEFINITIONS[operator.subProfessionId as TraitStructureJobId]
    const issues: string[] = [], notes: string[] = []
    const source = { description, rawDescription, blackboard, requiredPotentialRank: passive?.requiredPotentialRank ?? 0,
      unlockCondition: passive?.unlockCondition, prefabKey: passive?.prefabKey ?? null, rangeId: candidate?.rangeId ?? null }
    const basicInfo = { operatorId: operator.operatorId, operatorName: operator.operatorName,
      profession: operator.profession, professionLabel: operator.professionLabel,
      subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionName,
      phaseIndex, operatorLevel, potentialRank: 1 as const, module: 'NONE' as const }
    let verified = Boolean(passive) && definition.descriptions.includes(normalize(rawDescription))
    if (!verified) issues.push('職分の確認済み定義と特性の説明文が一致しません。')
    for (const entry of blackboard) if (!entry.key || !definition.keys.includes(entry.key)) {
      verified = false
      issues.push(`未確認の特性パラメータ：${entry.key ?? 'キーなし'}`)
    }
    if (source.requiredPotentialRank !== 0 || source.prefabKey !== (definition.prefabKey ?? null)
      || !(definition.rangeIds ?? [definition.rangeId ?? null]).includes(source.rangeId)) {
      verified = false
      issues.push('確認済みの潜在1・基本特性とデータの識別情報が一致しません。')
    }
    if (source.unlockCondition && (!/^PHASE_[012]$/.test(source.unlockCondition.phase ?? '')
      || !Number.isInteger(source.unlockCondition.level) || (source.unlockCondition.level ?? 0) < 1)) {
      verified = false
      issues.push('特性候補の解放条件を確認できません。')
    }
    const read = (key: string, options: { positive?: boolean; expected?: number } = {}): number | null => {
      const matches = blackboard.filter(entry => entry.key === key)
      const value = matches.length === 1 ? matches[0].value : undefined
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (options.positive && value === 0)
        || (options.expected !== undefined && value !== options.expected)) {
        issues.push(`特性パラメータ「${key}」の値を確認できません。`)
        return null
      }
      return value
    }
    const effects: TraitStructureEffect[] = []
    if (verified) {
      const job = operator.subProfessionId
      if (['fighter', 'fearless', 'pioneer', 'protector', 'shotprotector', 'craftsman', 'counsellor'].includes(job)) {
        const block = ['pioneer', 'craftsman', 'counsellor'].includes(job) ? 2 : ['protector', 'shotprotector'].includes(job) ? 3 : 1
        const frames = profile.phases[phaseIndex].attributesKeyFrames ?? []
        const agrees = frames.length > 0 && frames.every(frame => frame.data?.blockCnt === block)
        if (!agrees) issues.push('特性のブロック数と基本ステータスの一致を確認できません。')
        effects.push({ ...context('base-block-count', 'CONTROL', 'BASE_ATTRIBUTE', 'description:block_count'),
          item: 'BLOCK_COUNT', operation: 'SET', unit: 'ENEMY', value: block, resolution: agrees ? 'RESOLVED' : 'PARTIAL',
          parameterBindings: { baseAttribute: `phases[${phaseIndex}].attributesKeyFrames[].data.blockCnt` } })
      }
      if (job === 'shotprotector' || job === 'agent') effects.push({ ...context('ranged-attack', 'DAMAGE', 'ATTACK_RULE', 'description:ranged_attack'),
        item: 'RANGED_ATTACK_ENABLED', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true })
      if (job === 'agent') {
        const frames = profile.phases[phaseIndex].attributesKeyFrames ?? []
        const seconds = frames[0]?.data?.respawnTime
        const valid = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
          && frames.every(frame => frame.data?.respawnTime === seconds)
        if (!valid) issues.push('基本ステータスの再配置時間を確認できません。')
        effects.push({ ...context('base-redeploy-time', 'CONTROL', 'BASE_ATTRIBUTE', `phases[${phaseIndex}].attributesKeyFrames[].data.respawnTime`),
          item: 'REDEPLOY_TIME', operation: 'USE_BASE_ATTRIBUTE', unit: 'SECOND', value: valid ? seconds : null })
      }
      if (job === 'charger') effects.push(
        { ...context('kill-deployment-points', 'CONTROL', 'DYNAMIC_RULE', 'cost', 'KILL'), item: 'DP_ON_KILL', operation: 'ADD_VALUE', unit: 'POINT', value: read('cost', { expected: 1 }) },
        { ...context('retreat-cost-refund', 'CONTROL', 'DYNAMIC_RULE', 'description:initial_cost_refund', 'RETREAT'), item: 'RETREAT_COST_REFUND', operation: 'SET', unit: 'REFUND_RULE', value: 'INITIAL_DEPLOY_COST' },
      )
      if (job === 'stalker') effects.push(
        { ...context('physical-dodge', 'SURVIVAL', 'DYNAMIC_RULE', 'prob'), item: 'PHYSICAL_DODGE', operation: 'ADD_RATIO', unit: 'RATIO', value: read('prob', { expected: 0.5 }) },
        { ...context('arts-dodge', 'SURVIVAL', 'DYNAMIC_RULE', 'prob'), item: 'ARTS_DODGE', operation: 'ADD_RATIO', unit: 'RATIO', value: read('prob', { expected: 0.5 }) },
        { ...context('low-target-priority', 'SURVIVAL', 'DYNAMIC_RULE', 'description:target_priority'), item: 'TARGET_PRIORITY', operation: 'SET', unit: 'TARGET_PRIORITY', value: 'LOW' },
      )
      if (job === 'unyield') effects.push({ ...context('ally-healing-restriction', 'SURVIVAL', 'DYNAMIC_RULE', 'description:healing_restriction'),
        item: 'ALLY_HEALING_ENABLED', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: false })
      if (job === 'duelist') effects.push({ ...context('unblocked-natural-sp-restriction', 'CONTROL', 'DYNAMIC_RULE', 'description:unblocked_natural_sp'),
        item: 'NATURAL_SP_RECOVERY_ENABLED', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: false,
        condition: compare('source.isBlocking', false) })
      if (['fastshot', 'longrange', 'siegesniper'].includes(job)) effects.push({
        ...context('attack-priority', 'CONTROL', 'ATTACK_RULE', 'description:priority', 'ATTACK'),
        item: 'ATTACK_PRIORITY', operation: 'SET', unit: 'PRIORITY_RULE',
        value: job === 'fastshot' ? 'AIRBORNE' : job === 'longrange' ? 'LOWEST_DEFENSE' : 'HIGHEST_WEIGHT',
      })
      if (['corecaster', 'splashcaster', 'blastcaster', 'chain', 'slower', 'underminer', 'incantationmedic', 'phalanx', 'mystic', 'artsprotector', 'aoesniper'].includes(job)) {
        effects.push({ ...context('normal-attack-damage-type', 'DAMAGE', 'ATTACK_RULE', 'description:damage_type', 'NORMAL_ATTACK'),
          condition: ['phalanx', 'artsprotector'].includes(job) ? compare('source.skillActive', true) : null,
          item: 'DAMAGE_TYPE', operation: 'SET', unit: 'DAMAGE_TYPE', value: job === 'aoesniper' ? 'PHYSICAL' : 'ARTS' })
      }
      if (['aoesniper', 'splashcaster', 'blastcaster', 'reaperrange', 'phalanx', 'stalker', 'bombarder', 'skybreaker'].includes(job)) {
        effects.push({ ...context('area-attack-targets', 'DAMAGE', 'ATTACK_RULE', 'description:area_damage', 'NORMAL_ATTACK'),
          condition: job === 'phalanx' || job === 'skybreaker' ? compare('source.skillActive', true) : null,
          item: 'ATTACK_TARGETING', operation: 'SET', unit: 'TARGET_SELECTION',
          value: { mode: job === 'blastcaster' ? 'LINE' : 'AREA', maxTargets: null, rangeId: null }, resolution: 'PARTIAL' })
        notes.push('範囲や位置による命中判定は未確認。ダメージ計算では、同じ範囲攻撃を受ける敵数を入力して扱う。')
      }
      if (job === 'reaperrange') effects.push({
        ...context('frontal-attack-scale', 'DAMAGE', 'ATTACK_RULE', 'atk_scale', 'ATTACK'),
        condition: compare('target.inFrontalTiles', true), item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: read('atk_scale', { expected: 1.5 }),
        parameterBindings: { 'condition.rangeId': source.rangeId! },
      })
      if (job === 'mystic') {
        if (source.blackboard.some(entry => entry.key === 'times_2')) read('times_2', { expected: 0 })
        effects.push({ ...context('stored-energy', 'DAMAGE', 'ATTACK_RULE', 'times', 'NORMAL_ATTACK'),
          item: 'STORED_CHARGES', operation: 'SET', unit: 'HIT', value: read('times', { expected: 3 }) })
        notes.push('通常弾と指定した貯蔵弾を分けて評価する。貯蔵に要する時間・攻撃間の再貯蔵は計算しない。')
      }
      if (job === 'hunter') {
        read('value', { positive: true })
        effects.push({ ...context('loaded-attack-scale', 'DAMAGE', 'ATTACK_RULE', 'atk_scale', 'NORMAL_ATTACK'),
          item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: read('atk_scale', { expected: 1.2 }) })
        notes.push('装填済みの弾による1攻撃を評価する。装填・消費による攻撃周期は別途確認する。')
      }
      if (job === 'loopshooter') notes.push('投擲物を所持した状態の1攻撃を評価する。飛距離による帰還時間は別途確認する。')
      if (job === 'traper') notes.push('配置が成立した罠の効果と本人の攻撃を個別に評価する。罠の配置可否や再配置待ち時間は計算しない。')
      if (job === 'mercenary') notes.push('コスト消費による強化量は各スキル・素質の定義に従う。特性から攻撃倍率を追加しない。')
      if (job === 'skywalker') {
        effects.push({ ...context('airborne-block-count', 'CONTROL', 'DYNAMIC_RULE', 'description:airborne_block_count'),
          item: 'BLOCK_COUNT', operation: 'SET', unit: 'ENEMY', value: 2, condition: compare('source.isAirborne', true) })
        notes.push('離陸中にブロックできる空中の敵の上限。攻撃対象数や地上の敵のブロック数として使用しない。')
      }
      if (['physician', 'watchman', 'chainhealer'].includes(job)) {
        effects.push({ ...context('healing-normal-action', 'DAMAGE', 'ATTACK_RULE', 'description:healing_instead_of_attack'),
          item: 'NORMAL_ATTACK_ENABLED', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: false })
        notes.push('基本の通常行動は味方の治療。敵への攻撃に置き換える確認済みのスキル段階だけが、この規則を上書きする。')
        if (job === 'watchman') notes.push('離陸による位置・治療対象の変化はダメージへ加算しない。')
        if (job === 'chainhealer') {
          const count = read('attack@chain.max_target', { expected: 3 })
          const retention = read('attack@chain.atk_scale', { expected: 0.75 })
          if (count === null || retention === null) verified = false
          notes.push('治療は最大3体、跳躍ごとに25%減衰。敵への攻撃の連鎖としては適用しない。')
        }
      }
      if (job === 'guardian') effects.push({ ...context('healing-skills', 'SURVIVAL', 'DYNAMIC_RULE', 'description:healing_skills'),
        item: 'ALLY_HEALING_ENABLED', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true })
      if (job === 'counsellor') notes.push('配置待機中の味方への効果は、本体の直接ダメージへ加算しない。')
      if (job === 'fortress') {
        effects.push({ ...context('unblocked-ranged-attack', 'DAMAGE', 'ATTACK_RULE', 'description:unblocked_area_attack', 'NORMAL_ATTACK'),
          condition: compare('source.isBlocking', false), item: 'ATTACK_TARGETING', operation: 'SET', unit: 'TARGET_SELECTION',
          value: { mode: 'AREA', maxTargets: null, rangeId: null }, resolution: 'PARTIAL' })
        notes.push('未ブロック時は同じ砲撃範囲内の敵を指定する。ブロック時は近接単体攻撃を評価する。')
      }
      if (job === 'merchant') {
        const cost = blackboard.filter(entry => entry.key === 'cost')
        if (cost.length !== 1 || cost[0].value !== -3) issues.push('行商人のコスト消費量を確認できません。')
        effects.push({ ...context('periodic-dp-consumption', 'CONTROL', 'DYNAMIC_RULE', 'cost'),
          timing: { type: 'PERIODIC', intervalSeconds: read('interval', { expected: 3 }), firstTickSeconds: null },
          item: 'DP_CONSUMPTION', operation: 'ADD_VALUE', unit: 'POINT', value: cost.length === 1 && cost[0].value === -3 ? -3 : null },
        { ...context('no-retreat-refund', 'CONTROL', 'DYNAMIC_RULE', 'description:no_refund'),
          item: 'RETREAT_COST_REFUND', operation: 'SET', unit: 'REFUND_RULE', value: 'NONE' })
        notes.push('配置を維持できている本体の攻撃を評価する。コスト不足による退場時刻は計算しない。')
      }
      if (job === 'dollkeeper') {
        const attack = read('atk', { expected: 0 }), hp = read('max_hp', { expected: 0 })
        const rangeFlag = !blackboard.some(entry => entry.key === 'talent_override_rangeid_flag')
          || read('talent_override_rangeid_flag', { expected: 1 }) !== null
        effects.push({ ...context('substitute-duration', 'SURVIVAL', 'DYNAMIC_RULE', 'duration'),
          item: 'REPLACEMENT_DURATION', operation: 'SET', unit: 'SECOND',
          value: attack !== null && hp !== null && rangeFlag ? read('duration', { expected: 20 }) : null })
        notes.push('本体の攻撃を評価する。身替りの別ステータス・攻撃と交代時刻は含めない。')
      }
      if (job === 'bombarder') {
        const scale = read('attack@append_atk_scale', { expected: 0.5 })
        const validTimes = !blackboard.some(entry => entry.key === 'attack@times') || read('attack@times', { expected: 2 }) !== null
        const validThird = !blackboard.some(entry => entry.key === 'attack@enable_third_attack') || read('attack@enable_third_attack', { expected: 0 }) !== null
        effects.push({ ...context('attack-aftershock', 'DAMAGE', 'ATTACK_RULE', 'attack@append_atk_scale', 'NORMAL_ATTACK'),
          item: 'AFTERSHOCK', operation: 'SET', unit: 'AFTERSHOCK_RULE', value: { attackScale: validTimes && validThird ? scale : null } })
      }
      if (job === 'bombarder' || job === 'skybreaker') effects.push({ ...context('normal-attack-damage-type', 'DAMAGE', 'ATTACK_RULE', 'description:physical_damage', 'NORMAL_ATTACK'),
        condition: job === 'skybreaker' ? compare('source.skillActive', true) : null,
        item: 'DAMAGE_TYPE', operation: 'SET', unit: 'DAMAGE_TYPE', value: 'PHYSICAL' })
      if (job === 'chain') effects.push({ ...context('chain-attack', 'DAMAGE', 'ATTACK_RULE', 'attack@max_target', 'NORMAL_ATTACK'),
        item: 'CHAIN_ATTACK', operation: 'SET', unit: 'CHAIN_RULE', value: { maxTargets: read('attack@max_target', { positive: true }), retention: 0.85 },
        parameterBindings: { 'value.retention': 'description:15_percent_decay_per_jump' } })
      if (job === 'slower' || job === 'chain') effects.push({ ...context('attack-sluggish', 'CONTROL', 'DYNAMIC_RULE', job === 'chain' ? 'attack@sluggish' : 'sluggish', 'ATTACK'),
        target: { type: 'RECIPIENTS', side: 'ENEMY', entity: 'UNIT', scope: 'ATTACK_TARGET', includeSelf: false,
          factionIds: [], tagIds: [], selection: { type: 'ALL' } },
        item: 'STATUS', operation: 'SET_ENABLED', unit: 'STATUS', value: 'SLUGGISH',
        lifetime: { type: 'FIXED_SECONDS', seconds: read(job === 'chain' ? 'attack@sluggish' : 'sluggish', { positive: true }) },
      })
      if (job === 'incantationmedic') effects.push({ ...context('damage-to-heal', 'SURVIVAL', 'DYNAMIC_RULE', 'scale', 'ATTACK'),
        item: 'DAMAGE_TO_HEAL_RATIO', operation: 'RESTORE', unit: 'DAMAGE_RATIO', value: read('scale'),
        target: { type: 'RECIPIENTS', side: 'ALLY', entity: 'UNIT', scope: 'ATTACK_RANGE', includeSelf: true,
          factionIds: [], tagIds: [], selection: { type: 'COUNT', count: 1 } },
      })
      if (job === 'phalanx') {
        const inactive = compare('source.skillActive', false)
        effects.push({ ...context('inactive-normal-attack', 'DAMAGE', 'DYNAMIC_RULE', 'description:normal_attack_disabled'),
          condition: inactive, item: 'NORMAL_ATTACK_ENABLED', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: false },
        { ...context('inactive-defense', 'SURVIVAL', 'DYNAMIC_RULE', 'def'), condition: inactive,
          item: 'DEFENSE_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: read('def') },
        { ...context('inactive-magic-resistance', 'SURVIVAL', 'DYNAMIC_RULE', 'magic_resistance'), condition: inactive,
          item: 'MAGIC_RESISTANCE', operation: 'ADD_VALUE', unit: 'POINT', value: read('magic_resistance') })
      }
      if (job === 'lord') effects.push(
        { ...context('ranged-attack', 'DAMAGE', 'ATTACK_RULE', 'description:ranged_attack'), item: 'RANGED_ATTACK_ENABLED', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true },
        { ...context('ranged-attack-scale', 'DAMAGE', 'ATTACK_RULE', 'atk_scale', 'ATTACK'),
          condition: compare('attack.distanceType', 'RANGED'), item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: read('atk_scale', { expected: 0.8 }) },
      )
      if (job === 'centurion' || job === 'crusher') effects.push({
        ...context('block-count-target-limit', 'DAMAGE', 'ATTACK_RULE', 'description:blocked_enemies', 'NORMAL_ATTACK'),
        item: 'MAX_TARGETS', operation: 'SET', unit: 'ENEMY', value: blockCount(),
        parameterBindings: { 'value.metric': 'source.blockCount' },
      })
      if (job === 'hammer') effects.push({
        ...context('surrounding-splash', 'DAMAGE', 'ATTACK_RULE', 'attack@atk_scale_2', 'NORMAL_ATTACK'),
        item: 'SPLASH_DAMAGE', operation: 'SET', unit: 'SPLASH_RULE', value: {
          damageType: 'PHYSICAL', attackScale: read('attack@atk_scale_2', rawDescription.includes('{attack@atk_scale_2:0%}') ? {} : { expected: 0.5 }), radiusTiles: read('attack@ability_range_radius', { positive: true }),
          center: 'ATTACK_TARGET', includeMainTarget: false,
        }, parameterBindings: { 'value.radiusTiles': 'attack@ability_range_radius', 'value.center': 'description:surrounding_target' },
      })
      if (job === 'sword') effects.push({
        ...context('normal-attack-hit-count', 'DAMAGE', 'ATTACK_RULE', 'description:normal_attack_hit_count', 'NORMAL_ATTACK'),
        item: 'HIT_COUNT', operation: 'SET', unit: 'HIT', value: 2,
      })
      if (job === 'artsfghter') effects.push({
        ...context('normal-attack-damage-type', 'DAMAGE', 'ATTACK_RULE', 'description:arts_damage', 'NORMAL_ATTACK'),
        item: 'DAMAGE_TYPE', operation: 'SET', unit: 'DAMAGE_TYPE', value: 'ARTS',
      })
      if (job === 'musha' || job === 'reaper') {
        effects.push({ ...context('ally-healing-restriction', 'SURVIVAL', 'DYNAMIC_RULE', 'description:healing_restriction'),
          item: 'ALLY_HEALING_ENABLED', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: false })
        effects.push({ ...context('attack-heal', 'SURVIVAL', 'DYNAMIC_RULE', 'value', 'ATTACK'),
          item: 'HP', operation: 'RESTORE', unit: 'POINT', value: read('value', job === 'reaper' && !rawDescription.includes('{value}') ? { expected: 50 } : {}),
          applications: { basis: job === 'reaper' ? 'ENEMIES_HIT' : 'UNSPECIFIED', perAttackLimit: job === 'reaper' ? blockCount() : null },
          resolution: job === 'musha' ? 'PARTIAL' : 'RESOLVED',
          parameterBindings: job === 'reaper' ? { 'applications.perAttackLimit': 'description:heals_per_attack_cap' } : {},
        })
        if (job === 'musha') notes.push('攻撃時回復の複数ヒットに対する発動単位は未確認。1攻撃につき1回とは仮定しない。')
      }
      if (job === 'instructor' || job === 'closerange') {
        const phase = profile.phases[phaseIndex] as { rangeId?: unknown }
        const rangeId = typeof phase.rangeId === 'string' && phase.rangeId ? phase.rangeId : null
        if (!rangeId) issues.push('基本攻撃範囲の参照IDを確認できません。')
        effects.push({ ...context('base-attack-range', 'DAMAGE', 'BASE_ATTRIBUTE', `phases[${phaseIndex}].rangeId`),
          item: 'ATTACK_RANGE', operation: 'USE_BASE_ATTRIBUTE', unit: 'RANGE_DEFINITION', value: { rangeId }, resolution: rangeId ? 'RESOLVED' : 'PARTIAL' })
        if (job === 'instructor') effects.push({ ...context('unblocked-by-source-scale', 'DAMAGE', 'ATTACK_RULE', 'atk_scale', 'ATTACK'),
          condition: compare('target.blockedBySource', false), item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: read('atk_scale', { expected: 1.2 }) })
      }
      if (job === 'reaper') {
        effects.push(
          { ...context('normal-attack-damage-type', 'DAMAGE', 'ATTACK_RULE', 'description:physical_damage', 'NORMAL_ATTACK'), item: 'DAMAGE_TYPE', operation: 'SET', unit: 'DAMAGE_TYPE', value: 'PHYSICAL' },
          { ...context('area-attack-targets', 'DAMAGE', 'ATTACK_RULE', 'description:area_damage', 'NORMAL_ATTACK'), item: 'ATTACK_TARGETING', operation: 'SET', unit: 'TARGET_SELECTION', value: { mode: 'AREA', maxTargets: null, rangeId: null }, resolution: 'PARTIAL' },
        )
        notes.push('範囲攻撃の対象範囲・上限数は特性データだけでは未確認。回復回数の上限を攻撃対象数に流用しない。')
      }
      if (job === 'librator') {
        const inactive = compare('source.skillActive', false)
        effects.push(
          { ...context('inactive-normal-attack', 'DAMAGE', 'DYNAMIC_RULE', 'description:normal_attack_disabled'), condition: inactive, item: 'NORMAL_ATTACK_ENABLED', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: false },
          { ...context('inactive-block-count', 'CONTROL', 'DYNAMIC_RULE', 'description:inactive_block_count'), condition: inactive, item: 'BLOCK_COUNT', operation: 'SET', unit: 'ENEMY', value: 0 },
          { ...context('idle-attack-charge', 'DAMAGE', 'DYNAMIC_RULE', 'atk'), item: 'ATK_BUFF_RATIO', operation: 'INCREASE_TO_CAP', unit: 'RAMP_PROFILE',
            value: { maxRatio: read('atk'), secondsToCap: read('max_stack_cnt', { positive: true }), curve: 'UNSPECIFIED', accumulateWhile: inactive, resetEvent: 'SKILL_END' },
            parameterBindings: { 'value.secondsToCap': 'max_stack_cnt', 'value.accumulateWhile': 'description:normal_state', 'value.resetEvent': 'description:skill_end' }, resolution: 'PARTIAL' },
          { ...context('reset-attack-charge', 'DAMAGE', 'DYNAMIC_RULE', 'description:skill_end_reset', 'SKILL_END'), item: 'ATK_BUFF_RATIO', operation: 'RESET_SOURCE_VALUE', unit: 'RATIO', value: 0, resetEffectId: 'idle-attack-charge' },
        )
        notes.push('攻撃力上昇の補間方式・内部の更新間隔は未確認。最大値と到達時間から直線増加を仮定しない。')
      }
    }
    const resolved = effects.map(effect => containsUnknownValue(effect) ? { ...effect, resolution: 'PARTIAL' as const } : effect)
    const status = !verified ? 'UNREVIEWED' : issues.length || resolved.some(effect => effect.resolution === 'PARTIAL') ? 'PARTIAL' : 'STRUCTURED'
    const triggers = [...new Map(resolved.map(effect => [JSON.stringify(effect.timing), effect.timing])).values()]
    return [{ basicInfo, classificationInfo: { definitionScope: 'JOB' as const, coarseCategories: verified ? definition.categories : ['UNKNOWN' as const] },
      activationSettings: { activationMethod: 'PASSIVE' as const, triggers }, status, effects: resolved, source, issues, notes }]
  })
}

const metricLabels: Record<string, string> = { 'attack.distanceType': '攻撃距離', 'target.blockedBySource': '自身が対象をブロック',
  'source.skillActive': 'スキル発動中', 'source.blockCount': '現在のブロック数', 'source.isBlocking': '自身が敵をブロック中', 'target.inFrontalTiles': '対象が正面横3マス内' }
export function formatTraitStructureCondition(condition: CombatCondition | null): string {
  return localize(formatCombatCondition(condition)).replace('＝RANGED', '＝遠距離').replace('＝MELEE', '＝近接')
}
export const formatTraitStructureTiming = formatCombatTiming
export const formatTraitStructureTarget = formatCombatRecipient
export function formatTraitStructureEffectItem(item: TraitStructureEffect['item']): string {
  return { BLOCK_COUNT: 'ブロック数', MAX_TARGETS: '同時攻撃対象数', HIT_COUNT: '通常攻撃のヒット数', STORED_CHARGES: '通常貯蔵数の上限', ATTACK_SCALE: '攻撃力倍率',
    DAMAGE_TYPE: '通常攻撃のダメージ種別', RANGED_ATTACK_ENABLED: '遠距離攻撃', NORMAL_ATTACK_ENABLED: '通常攻撃',
    ALLY_HEALING_ENABLED: '味方からの治療', NATURAL_SP_RECOVERY_ENABLED: 'SP自然回復', ATTACK_RANGE: '基本攻撃範囲', ATTACK_TARGETING: '通常攻撃の対象',
    SPLASH_DAMAGE: '周囲へのダメージ', HP: 'HP', ATK_BUFF_RATIO: '攻撃力上昇割合', ATTACK_PRIORITY: '攻撃の優先対象',
    STATUS: '付与状態', DEFENSE_BUFF_RATIO: '防御力上昇割合', MAGIC_RESISTANCE: '術耐性', DAMAGE_TO_HEAL_RATIO: '与ダメージからの回復',
    PHYSICAL_DODGE: '物理回避', ARTS_DODGE: '術回避', REDEPLOY_TIME: '基本再配置時間', DP_ON_KILL: '撃破時の所持コスト',
    RETREAT_COST_REFUND: '撤退時のコスト返却', TARGET_PRIORITY: '狙われやすさ', CHAIN_ATTACK: '跳躍攻撃', AFTERSHOCK: '余震',
    DP_CONSUMPTION: '所持コスト消費', REPLACEMENT_DURATION: '身替りの継続時間' }[item]
}
export function formatTraitStructureEffectOperation(effect: TraitStructureEffect): string {
  return { SET: '設定', MULTIPLY: '乗算', SET_ENABLED: '適用設定', USE_BASE_ATTRIBUTE: '基本値を参照', DEAL_DAMAGE: 'ダメージ付与',
    RESTORE: '回復', INCREASE_TO_CAP: '上限まで上昇', RESET_SOURCE_VALUE: '特性分をリセット', ADD_RATIO: '割合加算', ADD_VALUE: '加算' }[effect.operation]
}
export function formatTraitStructureEffectValue(effect: TraitStructureEffect): string {
  if (effect.unit === 'BOOLEAN') return effect.value ? '有効' : '無効'
  if (effect.unit === 'REFUND_RULE') return effect.value === 'NONE' ? '返却なし' : '初期配置時のコスト'
  if (effect.unit === 'TARGET_PRIORITY') return '低い'
  if (effect.unit === 'SECOND') return `${numeric(effect.value)}秒`
  if (effect.unit === 'DAMAGE_TYPE') return effect.value === 'ARTS' ? '術' : '物理'
  if (effect.unit === 'TARGET_SELECTION') return effect.value.mode === 'LINE' ? '直線上の範囲攻撃' : '範囲攻撃'
  if (effect.unit === 'PRIORITY_RULE') return { AIRBORNE: '飛行ユニット', LOWEST_DEFENSE: '防御力が最も低い敵', HIGHEST_WEIGHT: '重量が最も重い敵' }[effect.value]
  if (effect.unit === 'STATUS') return '足止め'
  if (effect.unit === 'DAMAGE_RATIO') return `与ダメージ×${numeric(effect.value)}`
  if (effect.unit === 'RANGE_DEFINITION') return effect.value.rangeId ? '基本範囲を参照' : '未確認'
  if (effect.unit === 'SPLASH_RULE') return `攻撃力×${numeric(effect.value.attackScale)}`
  if (effect.unit === 'AFTERSHOCK_RULE') return `攻撃力×${numeric(effect.value.attackScale)}・1回`
  if (effect.unit === 'CHAIN_RULE') return `最大${numeric(effect.value.maxTargets)}体・跳躍ごとに×${numeric(effect.value.retention)}`
  if (effect.unit === 'RAMP_PROFILE') return `最大${percent(effect.value.maxRatio)}`
  if (effect.unit === 'RATIO') return percent(effect.value)
  if (effect.unit === 'MULTIPLIER') return `×${numeric(effect.value)}`
  if (effect.unit === 'HIT') return `${numeric(effect.value)}回`
  if (effect.unit === 'ENEMY') return `${numeric(effect.value)}体`
  return numeric(effect.value)
}
export function getTraitStructureEffectValueRows(effect: TraitStructureEffect): [string, string | number][] {
  const rows: [string, string | number][] = [['表示値', formatTraitStructureEffectValue(effect)], ['単位', effect.unit]]
  if (effect.unit === 'SPLASH_RULE') rows.push(['ダメージ種別', '物理'], ['範囲の中心', '攻撃対象'], ['主対象を含む', 'いいえ'],
    ...getCombatNumericDefinitionRows(effect.value.attackScale, '攻撃力倍率'), ...getCombatNumericDefinitionRows(effect.value.radiusTiles, '半径（マス）'))
  else if (effect.unit === 'CHAIN_RULE') rows.push(...getCombatNumericDefinitionRows(effect.value.maxTargets, '対象数の上限'),
    ...getCombatNumericDefinitionRows(effect.value.retention, '跳躍ごとの残存倍率'))
  else if (effect.unit === 'AFTERSHOCK_RULE') rows.push(...getCombatNumericDefinitionRows(effect.value.attackScale, '余震の攻撃力倍率'))
  else if (effect.unit === 'RAMP_PROFILE') rows.push(...getCombatNumericDefinitionRows(effect.value.maxRatio, '攻撃力上昇の上限'),
    ...getCombatNumericDefinitionRows(effect.value.secondsToCap, '最大値までの秒数'), ['補間方式', '未確定'], ['蓄積条件', formatTraitStructureCondition(effect.value.accumulateWhile)], ['リセット契機', 'スキル終了'])
  else if (effect.unit === 'RANGE_DEFINITION') rows.push(['範囲ID', effect.value.rangeId ?? '未確認'])
  else if (effect.unit === 'TARGET_SELECTION') rows.push(['対象方式', formatTraitStructureEffectValue(effect)], ['対象範囲ID', '未確認'], ['攻撃対象数の上限', '未確認'])
  else if (effect.unit === 'PRIORITY_RULE' || effect.unit === 'STATUS') rows.push(['値', formatTraitStructureEffectValue(effect)])
  else if (typeof effect.value === 'boolean') rows.push(['値', effect.value ? 'はい' : 'いいえ'])
  else if (typeof effect.value === 'string') rows.push(['値', effect.value])
  else rows.push(...getCombatNumericDefinitionRows(effect.value))
  if (effect.item === 'HP') rows.push(['回復の発動単位', effect.applications.basis === 'ENEMIES_HIT' ? '攻撃した敵1体ごと' : '未確定'],
    ...getCombatNumericDefinitionRows(effect.applications.perAttackLimit, '攻撃ごとの回復回数上限'))
  if (effect.operation === 'RESET_SOURCE_VALUE') rows.push(['リセット対象の効果ID', effect.resetEffectId])
  return rows.map(([key, value]) => [key, typeof value === 'string' ? localize(value) : value])
}
export function getTraitStructureEffectDefinitionRows(effect: TraitStructureEffect): [string, string | number][] {
  const rows: [string, string | number][] = [['効果ID', effect.id], ['項目', formatTraitStructureEffectItem(effect.item)], ['項目キー', effect.item],
    ['演算', formatTraitStructureEffectOperation(effect)], ['演算コード', effect.operation],
    ['対象領域', { DAMAGE: 'ダメージ・攻撃', SURVIVAL: '生存・回復', CONTROL: '対象選択・状態・ブロック' }[effect.relevance]],
    ['ダメージ計算との関係', effect.calculationRelevance === 'RELEVANT' ? '計算に関わる' : '固定条件のダメージ計算には不要'],
    ['適用区分', { BASE_ATTRIBUTE: '基本ステータスを参照・加算しない', ATTACK_RULE: '基本攻撃の規則', DYNAMIC_RULE: '条件・イベントによる変更' }[effect.application]],
    ['定義状態', effect.resolution === 'RESOLVED' ? '構造化済み' : '未確定項目あり'],
    ...getCombatContextDefinitionRows(effect), ...getTraitStructureEffectValueRows(effect)]
  return rows.map(([key, value]) => [key, typeof value === 'string' ? localize(value) : value])
}

function context(id: string, relevance: TraitStructureEffect['relevance'], application: TraitStructureEffect['application'],
  sourceBinding: string, event?: 'ATTACK' | 'NORMAL_ATTACK' | 'SKILL_END' | 'KILL' | 'RETREAT'): CombatEffectContext & Pick<TraitStructureEffect, 'relevance' | 'calculationRelevance' | 'application' | 'resolution'> {
  return { id, relevance, calculationRelevance: relevance === 'DAMAGE' ? 'RELEVANT' : 'NOT_RELEVANT', application, resolution: 'RESOLVED',
    sourceBinding, timing: event ? { type: 'EVENT', event } : { type: 'CONTINUOUS', while: 'DEPLOYED' }, condition: null,
    target: { type: 'RECIPIENTS', side: 'SELF', entity: application === 'ATTACK_RULE' ? 'ATTACK' : 'UNIT', scope: 'SELF', includeSelf: true, factionIds: [], tagIds: [], selection: { type: 'ALL' } },
    probability: { chance: 1, rollScope: 'APPLICATION' }, lifetime: event ? { type: 'CURRENT_EVENT' } : { type: 'WHILE_SOURCE_ACTIVE' }, restrictions: [] }
}
function compare(metric: string, value: boolean | string): CombatCondition {
  return { type: 'COMPARE', metric, comparison: 'EQ', value, sourceBinding: `description:${metric}` }
}
function blockCount(): CombatNumericValue { return { type: 'AFFINE', base: 0, coefficient: 1, metric: 'source.blockCount', min: 0 } }
function normalize(value: string): string { return value.normalize('NFKC').replace(/<@[^>]+>|<\$ba\.[^>]+>|<\/>/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim() }
function localize(value: string): string { return Object.entries(metricLabels).reduce((text, [key, label]) => text.replaceAll(key, label), value) }
function numeric(value: CombatNumericValue): string {
  if (typeof value === 'object' && value !== null && value.type === 'AFFINE' && value.base === 0 && value.coefficient === 1) return metricLabels[value.metric] ?? formatCombatNumericValue(value)
  return localize(formatCombatNumericValue(value))
}
function percent(value: CombatNumericValue): string { return typeof value === 'number' ? `+${formatCombatNumber(value * 100)}％` : `${numeric(value)}（割合）` }
function containsUnknownValue(effect: TraitStructureEffect): boolean {
  const containsNull = (value: unknown): boolean => value === null || (typeof value === 'object' && value !== null && Object.values(value).some(containsNull))
  return containsNull(effect.value)
}
