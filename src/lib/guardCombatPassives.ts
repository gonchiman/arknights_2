import type { SkillRecord } from '../types/skill.ts'
import { getOperatorPassives, type PassiveSource } from './operatorProfile.ts'
import type { GuardCalculationIssue, GuardConditions, GuardInput, GuardPassiveModifiers, GuardStage } from './guardCombatTypes.ts'

type Context = { kind: 'NORMAL' | 'NEXT_ATTACK' | 'SKILL_ACTION'; skillIndex: number; stageId: string;
  stage?: Pick<GuardStage, 'actions'> }

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

/** Identity belongs to the reviewed source, not to a compatible-looking blackboard. */
const TALENTS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  char_264_f12yin: [['ハードパンチャー', '1'], ['頑健', '2']],
  char_2024_chyue: [['止戈', '1'], ['万象客となり', '2']],
  char_4037_demetr: [['ファミリーの流儀', '1'], ['路地裏の勘', '2']],
  char_4082_qiubai: [['虚突', '1'], ['落英', '2']],
  char_4182_oblvns: [['讃歌の音符', '1'], ['忘却を恐れるなかれ', '2']],
  char_4088_hodrer: [['攻勢の機', '1'], ['残火の幕', '2']],
  char_4145_ulpia: [['本性の維持', '2'], ['育まれし血脈', '1']],
  char_4058_pepe: [['語り継がれるもの', '1'], ['芳しき睡蓮', '2']],
  char_1051_headb2: [['渦巻く激情', '1'], ['連帯のうねり', '2']],
  char_010_chen: [['発破', '1'], ['帯刀格闘術', '2']],
  char_4116_blkkgt: [['「天性の武者」', '1'], ['生ける伝説', '2']],
  char_017_huang: [['緊急蘇生術', '1'], ['スパルタ訓練の成果', '2']],
  char_1026_gvial2: [['戦場の豪斧', '1'], ['医学の心得', '2']],
  char_4098_vvana: [['眼前を照らす燭火', '1'], ['散華', '2']],
  char_1019_siege2: [['諸王の息', '1'], ['縛られざる鋒芒', '2']],
  char_1050_chen3: [['形意洞察', '1'], ['寒暑覚知', '2']],
  char_188_helage: [['月満ち星隠る', '1'], ['策その身に宿る', '2']],
  char_4121_zuole: [['持燭人', '1'], ['守正自明', '2']],
  char_485_pallas: [['英雄の生誕', '1'], ['女神の抱擁', '2']],
  char_1014_nearl2: [['「長夜の終わり」', '1'], ['破暁', '2']],
  char_4011_lessng: [['苦しみを意志に', '1'], ['痛みを砥石に', '2']],
  char_1032_excu2: [['選ばれし者', '1'], ['銃弾の共感', '2']],
  char_4010_etlchi: [['血の集積', '1'], ['返り咲き', '2']],
  char_4064_mlynar: [['遊侠', '1'], ['我関せず', '2']],
  char_1043_leizi2: [['明断', '1'], ['責問', '2']],
}

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
  return (TALENTS[operatorId] ?? []).map(([name]) => name)
}

export function getGuardPassiveInputs(operatorId: string): GuardInput[] {
  return (INPUTS[operatorId] ?? []).map(input => ({ ...input }))
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
  const n = (key: string) => Number(values[key])
  const yes = (key: string) => values[key] === true
  const conditionsFor = (...keys: string[]): RowDetails => ({ condition: keys.map(key => {
    const definition = INPUTS[operator.operatorId].find(input => input.key === key)
    const value = definition?.options?.find(option => option.value === values[key])?.label ?? String(values[key])
    return `${definition?.label ?? key}：${value}`
  }).join('、') })
  const requires = (key: string): RowDetails => ({
    condition: `${INPUTS[operator.operatorId].find(input => input.key === key)?.label ?? key}：あり`,
  })
  const selected = getOperatorPassives(operator.operatorProfile, 2,
    operator.operatorProfile.phases[2]?.maxLevel ?? 90, 1).sources
  const selectedTrait = selected.find(source => source.sourceKind === 'TRAIT')
  const trait: PassiveSource | undefined = selectedTrait ?? (registrationOnly ? {
    sourceKind: 'TRAIT', sourceName: '特性', talentIndex: null, description: '', blackboard: [],
    requiredPotentialRank: 0, prefabKey: null, tokenKey: null,
  } : undefined)
  const talents: PassiveSource[] = registrationOnly ? (TALENTS[operator.operatorId] ?? []).map(([name, prefabKey], talentIndex) => ({
    sourceKind: 'TALENT', talentIndex, sourceName: name, prefabKey,
    description: selected.find(source => source.talentIndex === talentIndex)?.description ?? '',
    blackboard: selected.find(source => source.talentIndex === talentIndex)?.blackboard ?? [],
    requiredPotentialRank: 0, tokenKey: null, unlockCondition: { phase: 'PHASE_2', level: 1 },
  })) : selected.filter(source => source.sourceKind === 'TALENT')
  if (!trait) block({ sourceKind: 'TRAIT', sourceName: '特性', talentIndex: null }, '昇進2・潜在1の特性を取得できません。')
  for (const index of [0, 1]) if (!talents.some(source => source.talentIndex === index))
    block({ sourceKind: 'TALENT', sourceName: TALENTS[operator.operatorId]?.[index]?.[0] ?? `素質${index + 1}`,
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
  const skillValue = (key: string) => {
    const value = skill.blackboard?.find(entry => entry.key?.toLowerCase() === key.toLowerCase())?.value
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      block('スキル効果', `参照値「${key}」を取得できません。`)
      return 0
    }
    return value
  }
  const percent = (value: number) => `${Math.round(value * 100_000) / 1000}％`
  const applyRatio = (source: PassiveSource, value: number, active = true, details: RowDetails = {}) => {
    if (active) output.attackRatio += value
    row(source, '攻撃力', `＋${percent(value)}`, active ? 'APPLIED' : 'CONDITION_FALSE', '', details)
  }
  const applyScale = (source: PassiveSource, value: number, details: RowDetails = {}) => {
    output.attackScale *= value
    row(source, '攻撃倍率', `×${value}`, 'APPLIED', '', details)
  }
  const berserk = (source: PassiveSource) => {
    const limit = read(source, 'min_hp_ratio'), speed = read(source, 'min_attack_speed')
    if (limit < 0 || limit >= 1) { block(source, '不屈のHP境界が無効です。'); return }
    const bonus = speed * Math.min(1, Math.max(0, (1 - n('selfHpPercent') / 100) / (1 - limit)))
    output.attackSpeed += bonus
    row(source, '攻撃速度', `＋${Math.round(bonus * 1e6) / 1e6}`, 'APPLIED', '', conditionsFor('selfHpPercent'))
    output.notes.push('自身のHPを指定値に固定した状態の攻撃速度です。HPの推移やスキル発動周期は計算しません。')
  }

  if (trait) {
    if (operator.subProfessionId === 'librator') {
      let scale = 1
      if (operator.operatorId === 'char_4064_mlynar' && context.skillIndex === 3) {
        scale = Math.max(0, skillValue('trait_up') + skillValue('per_kill_reduce') * n('skillKillCount'))
      }
      const maximum = read(trait, 'atk')
      applyRatio(trait, maximum * n('traitChargePercent') / 100 * scale)
      output.notes.push('特性の攻撃力蓄積率とスキル中の撃破数を固定した状態を計算します。')
    } else if (operator.subProfessionId === 'lord' && context.kind === 'NORMAL'
      && operator.operatorId === 'char_4082_qiubai') {
      const multiplier = values.attackDistanceType === 'RANGED' && context.skillIndex !== 3 ? 0.8 : 1
      applyScale(trait, multiplier)
    } else if (operator.subProfessionId === 'instructor') {
      const multiplier = yes('targetBlockedBySelf') ? 1 : 1.2
      applyScale(trait, multiplier)
    } else if (operator.subProfessionId === 'hammer'
      || (operator.subProfessionId === 'sword' && (context.kind === 'NORMAL'
        || (context.kind === 'NEXT_ATTACK' && context.stage?.actions.length === 1 && context.stage.actions[0].hits === 2)))
      || (context.kind !== 'SKILL_ACTION'
        && ['crusher', 'centurion', 'artsfghter', 'reaper'].includes(operator.subProfessionId))) {
      row(trait, '攻撃属性・回数・対象', '攻撃定義に反映', 'APPLIED',
        '基礎攻撃またはスキルの攻撃列で扱い、素質側で回数や対象数を再乗算しません。')
    } else {
      row(trait, 'ブロック・回復・通常攻撃等', '—', 'NOT_RELEVANT',
        '選択した攻撃のダメージ計算では、この特性による追加補正を使用しません。')
    }
  }

  for (const source of talents) {
    const index = source.talentIndex
    const definition = index === null ? null : TALENTS[operator.operatorId]?.[index]
    if (!definition || source.sourceName !== definition[0] || source.prefabKey !== definition[1]
      || source.requiredPotentialRank !== 0 || source.unlockCondition?.phase !== 'PHASE_2') {
      if (!definition && !source.description) irrelevant(source, '説明・計算値のない補助定義です。')
      else block(source, '昇進2・潜在1の確認済み素質と名称・識別子・解放条件が一致しません。')
      continue
    }
    for (const constraint of getGuardPassiveCalculationConstraints(operator.operatorId, context)) {
      if (constraint.talentIndex === index && !constraint.allows(values, key => read(source, key)))
        block(source, constraint.reason)
    }
    switch (operator.operatorId) {
      case 'char_264_f12yin':
        if (index === 0) {
          output.critChance = context.skillIndex === 3 ? skillValue('talent@prob') : read(source, 'prob')
          output.critScale = read(source, 'atk_scale')
          row(source, '攻撃倍率', `×${output.critScale}`, 'APPLIED', '', { probability: output.critChance, timing: '攻撃時' })
        } else irrelevant(source)
        break
      case 'char_2024_chyue':
        if (index === 0) {
          const scale = read(source, 'damage_scale')
          if (yes('talentActive')) output.damageScale *= scale
          row(source, '与ダメージ', `×${scale}`, yes('talentActive') ? 'APPLIED' : 'CONDITION_FALSE', '', requires('talentActive'))
          output.notes.push('止戈が適用されているかを入力します。確率と効果時間から常時発動とは仮定しません。')
        } else irrelevant(source)
        break
      case 'char_4037_demetr':
        if (index === 0) {
          const stacks = n('defenseDebuffStacks'), maximum = read(source, context.skillIndex === 2 ? 'attack@s2_limited_stack_cnt' : 'attack@limited_stack_cnt')
          if (stacks > maximum) block(source, `防御力低下の重複上限は${maximum}です。`)
          output.defenseReductionRatio = Math.min(1, -read(source, 'attack@def') * stacks)
          const hp = n('targetHpPercent') / 100, upper = read(source, 'min_hp_ratio'), lower = read(source, 'max_hp_ratio')
          if (hp >= upper) output.damageScale *= 1 + read(source, 'min_add_on_scale')
          else if (hp <= lower) output.damageScale *= 1 + read(source, 'max_add_on_scale')
          row(source, '防御力低下', `－${percent(output.defenseReductionRatio)}`, 'APPLIED', '', conditionsFor('defenseDebuffStacks'))
          row(source, '与ダメージ', `×${output.damageScale}`, output.blockers.length ? 'UNSUPPORTED' : 'APPLIED', '', conditionsFor('targetHpPercent'))
        } else irrelevant(source)
        break
      case 'char_4082_qiubai':
        if (index === 0) {
          const scale = read(source, 'atk_scale') * (context.skillIndex === 3 ? skillValue('talent_scale') : 1)
          if (yes('targetSlowedOrBound')) output.additionalActions.push({ label: source.sourceName, damageType: 'ARTS', scale })
          row(source, '追加術ダメージ', `×${scale}`, yes('targetSlowedOrBound') ? 'APPLIED' : 'CONDITION_FALSE', '',
            { ...requires('targetSlowedOrBound'), timing: '攻撃時' })
        } else {
          row(source, 'バインド', `${read(source, 'duration')}秒`, 'NOT_RELEVANT',
            '発動中かは状態条件で指定します。発動確率から追加術ダメージの常時発生を仮定しません。')
        }
        break
      case 'char_4182_oblvns':
        if (index === 0) {
          output.defenseIgnoreRatio = read(source, 'def_penetrate_ratio') * n('noteCount')
          output.resistanceIgnoreRatio = read(source, 'magic_resist_penetrate_ratio') * n('noteCount')
          row(source, '防御力無視', percent(output.defenseIgnoreRatio), 'APPLIED', '', conditionsFor('noteCount'))
          row(source, '術耐性無視', percent(output.resistanceIgnoreRatio), 'APPLIED', '', conditionsFor('noteCount'))
          output.notes.push('戦場中の音符数を指定値に固定します。音符の移動・消滅・再命中は時間シミュレーションの対象外です。')
        } else {
          const bonus = read(source, 'attack_speed')
          if (yes('selfInTalentRange')) output.attackSpeed += bonus
          row(source, '攻撃速度', `＋${bonus}`, yes('selfInTalentRange') ? 'APPLIED' : 'CONDITION_FALSE', '', requires('selfInTalentRange'))
          output.notes.push('Fever値と味方による追加攻撃範囲は、選択したスキル状態・命中数へ反映します。')
        }
        break
      case 'char_4088_hodrer':
        if (index === 0) applyScale(source, read(source, yes('targetStunnedOrBound') ? 'atk_scale' : 'atk_scale_2'), conditionsFor('targetStunnedOrBound'))
        else irrelevant(source)
        break
      case 'char_4145_ulpia':
        if (source.prefabKey === '1') {
          output.attackFlat += read(source, 'atk') * n('killStacks')
          row(source, '攻撃力（固定値）', `＋${output.attackFlat}`, 'APPLIED', '', conditionsFor('killStacks'))
        } else irrelevant(source)
        break
      case 'char_4058_pepe':
        if (index === 1) applyRatio(source, read(source, 'atk'))
        else irrelevant(source)
        break
      case 'char_1051_headb2':
        if (index === 0) {
          output.splashDamageScale = read(source, 'damage_scale')
          const scale = read(source, 'attack@splash_atk_scale')
          if (n('terrainHitCount')) output.additionalActions.push({ label: '高台による追加ダメージ', damageType: 'PHYSICAL',
            scale: scale * (context.skillIndex === 3 ? skillValue('splash_atk_scale_bonus') : 1), hits: n('terrainHitCount') })
          row(source, '高台の追加ダメージ', `${n('terrainHitCount')}回`, n('terrainHitCount') ? 'APPLIED' : 'CONDITION_FALSE', '',
            { condition: '対象に命中する高台効果の回数 ＞ 0' })
          row(source, '範囲対象の与ダメージ', `×${output.splashDamageScale}`, 'APPLIED', '主対象への攻撃倍率とは分けて適用します。')
        } else applyRatio(source, read(source, 'atk') * read(source, 'scale_bonus'))
        break
      case 'char_010_chen':
        if (index === 1) applyRatio(source, read(source, 'atk'))
        else irrelevant(source)
        break
      case 'char_4116_blkkgt':
        if (index === 0) {
          output.critChance = context.skillIndex === 3 || (context.skillIndex === 2 && yes('targetBlocked'))
            ? skillValue('prob') : read(source, 'prob')
          output.critScale = read(source, 'atk_scale')
          row(source, '攻撃倍率', `×${output.critScale}`, 'APPLIED', '',
            { ...conditionsFor('targetBlocked'), probability: output.critChance, timing: '攻撃時' })
        } else {
          const ratio = read(source, 'def_penetrate')
          if (yes('targetTrembling')) output.defenseIgnoreRatio = ratio
          row(source, '防御力無視', percent(ratio), yes('targetTrembling') ? 'APPLIED' : 'CONDITION_FALSE', '', requires('targetTrembling'))
        }
        break
      case 'char_017_huang': irrelevant(source); break
      case 'char_1026_gvial2':
        if (index === 0) {
          const maximum = context.skillIndex === 3 ? 5 : 3
          if (n('blockedEnemyCount') > maximum) block(source, `このスキル中のブロック数上限は${maximum}です。`)
          applyRatio(source, read(source, 'atk') + read(source, 'atk_add') * n('blockedEnemyCount'), true, conditionsFor('blockedEnemyCount'))
        } else irrelevant(source)
        break
      case 'char_4098_vvana':
        if (index === 0) {
          output.damageScale *= 1 + read(source, 'damage_scale_m') * (yes('eliteInRange') ? read(source, 'super_scale') : 1)
          row(source, '術の与ダメージ', `×${output.damageScale}`, 'APPLIED', '', conditionsFor('eliteInRange'))
        } else irrelevant(source)
        break
      case 'char_1019_siege2':
        if (index === 0) applyRatio(source, read(source, 'atk') * n('nearbyAllyCount'), true, conditionsFor('nearbyAllyCount'))
        else irrelevant(source, '対象ごとの1回限りの戦慄付与は、直接ダメージを変更しません。')
        break
      case 'char_1050_chen3':
        if (index === 0) {
          applyRatio(source, read(source, 'atk'))
          output.attackSpeed += read(source, 'attack_speed')
          row(source, '攻撃速度', `＋${output.attackSpeed}`, 'APPLIED')
        } else irrelevant(source)
        break
      case 'char_188_helage':
      case 'char_4121_zuole':
        if (index === 0) berserk(source)
        else irrelevant(source)
        break
      case 'char_485_pallas':
        if (index === 0) {
          const bonus = read(source, 'peak_performance.atk'), threshold = read(source, 'peak_performance.hp_ratio')
          applyRatio(source, bonus, n('selfHpPercent') / 100 >= threshold, { condition: `自身のHP ≧ ${percent(threshold)}` })
        }
        else irrelevant(source)
        break
      case 'char_1014_nearl2':
        if (index === 1) {
          output.defenseIgnoreRatio = read(source, 'def_penetrate')
          row(source, '防御力無視', percent(output.defenseIgnoreRatio), 'APPLIED')
        } else irrelevant(source, '配置時の1〜2回の確定ダメージは、各スキルの1攻撃へ加算しません。')
        break
      case 'char_4011_lessng':
        if (index === 1) applyRatio(source, read(source, 'atk'), yes('recentDamageTaken'), requires('recentDamageTaken'))
        else irrelevant(source)
        break
      case 'char_1032_excu2':
        if (index === 0 && context.kind === 'NORMAL') {
          const chance = Math.min(1, read(source, 'prob') + read(source, 'prob_add') * n('ammoSpent'))
          output.additionalActions.push({ label: source.sourceName, damageType: 'PHYSICAL', scale: 1, probability: chance })
          row(source, '追加攻撃', '1回', 'APPLIED', '', { ...conditionsFor('ammoSpent'), probability: chance, timing: '通常攻撃時' })
          output.notes.push('消費弾薬数を固定した時点の1攻撃を計算します。追加攻撃を起点とする再抽選は行いません。')
        } else if (index === 0) irrelevant(source, '通常攻撃ではない終了時ダメージから追加攻撃を発生させません。')
        else irrelevant(source, '弾薬上限は発動周期・スキル全体の攻撃回数に関わり、1攻撃のダメージへは加算しません。')
        break
      case 'char_4010_etlchi':
        if (index === 0) {
          if (yes('dotActive')) output.additionalActions.push({ label: source.sourceName, damageType: 'ARTS', scale: 0,
            flatDamage: read(source, 'magic_value'), hits: 1, timing: 'PER_SECOND' })
          row(source, '付与中の術ダメージ/秒', String(read(source, 'magic_value')),
            yes('dotActive') ? 'APPLIED' : 'CONDITION_FALSE', '', { ...requires('dotActive'), timing: '毎秒' })
          output.notes.push('最大HP奪取によるHP変化はダメージに加算しません。継続ダメージは付与中の毎秒値として別計算します。')
        } else irrelevant(source)
        break
      case 'char_4064_mlynar':
        if (index === 0) applyScale(source, read(source, n('nearbyEnemyCount') >= read(source, 'cnt') ? 'atk_scale_up' : 'atk_scale_base'), conditionsFor('nearbyEnemyCount'))
        else irrelevant(source, '味方が攻撃を受けた時の反撃は、自身の通常攻撃へ加算しません。')
        break
      case 'char_1043_leizi2':
        if (index === 0) {
          applyScale(source, read(source, 'atk_scale[skill_up]'))
          if (!/毎秒10%/.test(source.description.normalize('NFKC'))) block(source, '毎秒の落雷確率を確認できません。')
          else {
            const action = { label: '周期落雷の期待値', damageType: 'ARTS' as const,
              scale: read(source, 'atk_scale_t'), hits: 1 / read(source, 'interval'), probability: 0.1, timing: 'PER_SECOND' as const }
            output.additionalActions.push(action)
            row(source, '周期落雷の術ダメージ倍率', `×${action.scale}`, 'APPLIED', '', { timing: '毎秒', probability: action.probability })
            row(source, '周期落雷の判定回数', `${action.hits}回/秒`, 'APPLIED', '', { timing: '毎秒', probability: action.probability })
          }
        } else if (context.kind === 'SKILL_ACTION') {
          output.additionalActions.push({ label: source.sourceName, damageType: 'ARTS', scale: read(source, 'atk_scale_t2') })
          row(source, '発動時の術ダメージ', `×${read(source, 'atk_scale_t2')}`, 'APPLIED', '', { timing: 'スキル発動時' })
        } else irrelevant(source, '発動時だけの落雷を、継続中の通常攻撃ごとには加算しません。')
        break
      default: block(source, 'この素質の計算定義が未登録です。')
    }
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
