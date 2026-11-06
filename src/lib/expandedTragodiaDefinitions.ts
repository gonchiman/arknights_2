import { ELEMENTAL_BUILDUP_INPUTS } from './elementalBuildup.ts'
import type { ExpandedOperatorDefinition, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardDamageAction, GuardElementalBuildup, GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'
import type { TalentStructureEffect } from './talentStructure.ts'

// https://prts.wiki/w/酒神 : primary/splash buildup precedes HP damage.
// S2 token pulses snapshot the summoner's ATK; positive buildup resistance is
// deliberately excluded because the documented engine behavior is disputed.
const operatorId = 'char_1042_phatm2'
const k = (key: string): GuardValue => ({ key })
const mul = (...args: GuardValue[]): GuardValue => ({ op: 'mul', args })
const choose = (input: string, value: string | boolean, yes: GuardValue, no: GuardValue = 0): GuardValue =>
  ({ op: 'if', input, comparison: 'EQ', value, yes, no })
const selection = (key: string, label: string, options: [string, string][]): GuardInput => ({ key, label, kind: 'select',
  defaultValue: options[0][0], options: options.map(([value, label]) => ({ value, label })) })
const bool = (key: string, label: string, defaultValue = true): GuardInput => ({ key, label, kind: 'boolean', defaultValue })
const reason = '選択した1イベントの値。神経爆発・周期・移動・複数イベントの時間方向の合算は未対応です。'
const periodTotal = { kind: 'UNSUPPORTED', reason } as const
const buildup = (scale: GuardValue): GuardElementalBuildup => ({ id: 'neural', label: '神経損傷',
  damageKind: { type: 'ELEMENTAL_BUILDUP', elementId: 'neural' }, basis: { type: 'ATK_STAT' }, scale })
const hit = (scale: GuardValue = 1): GuardDamageAction => ({ id: 'main', label: '術ダメージ', role: 'MAIN', damageType: 'ARTS', scale })
const stage = (id: string, label: string, actions: GuardDamageAction[], scale?: GuardValue, extra: Partial<GuardStage> = {}): GuardStage => ({
  id, label, kind: 'SKILL_ACTION', when: { input: 'tragodiaEvent', comparison: 'EQ', value: id }, actions,
  elementalBuildups: scale === undefined ? [] : [buildup(scale)], maxTargets: 1,
  periodTotal, dpsUnsupportedReason: reason,
  resistanceReductionFixed: choose('targetElementalBurst', 'BURN', 20),
  defenseReductionFixed: mul(120, { input: 'previousCorrosionBursts' }), ...extra,
})
const enemyAttack = (skillIndex: number) => stage('ENEMY_ATTACK', '敵の通常攻撃直前に反応する素質', [], undefined, {
  elementalBuildups: [{ ...buildup(70), basis: { type: 'FIXED' },
    scale: skillIndex === 1 ? mul(70, choose('tragodiaS1Bound', true, k('ep_damage_scale'), 1)) : 70 }],
  notes: ['素質2の固定神経損傷1回。本人の攻撃力や敵の攻撃ダメージでは増減しない。'],
})
function recipe(skillIndex: number, stages: GuardStage[], options: [string, string][], inputs: GuardInput[] = [],
  requirements: NonNullable<GuardSkillRecipe['conditionRequirements']> = []): GuardSkillRecipe {
  return { operatorId, skillIndex, stages, inputs: [selection('tragodiaEvent', '計算する効果', options), ...inputs,
    ...ELEMENTAL_BUILDUP_INPUTS, { key: 'previousCorrosionBursts', label: '対象の過去の侵蝕爆発回数', kind: 'number', defaultValue: 0, min: 0, max: 100, step: 1 }],
    conditionRequirements: [{ when: { input: 'targetElementalBurst', comparison: 'EQ', value: 'CORROSION' },
      condition: { input: 'previousCorrosionBursts', comparison: 'GTE', value: 1 }, reason: '侵蝕爆発効果中は過去の侵蝕爆発回数が1以上必要です。' }, ...requirements],
    notes: [reason, '周囲への神経損傷は主対象を除く。主攻撃と別に評価する。'] }
}
const state = (id: string, binding: string, status: string): TalentStructureEffect => ({ id, sourceBinding: binding,
  item: 'STATUS', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true, status,
  timing: { type: 'CONTINUOUS', while: 'DEPLOYED' }, condition: null,
  target: { type: 'RECIPIENTS', side: 'SELF', entity: 'UNIT', scope: 'SELF', includeSelf: true,
    factionIds: [], tagIds: [], selection: { type: 'ALL' } },
  probability: { chance: 1, rollScope: 'APPLICATION' }, lifetime: { type: 'WHILE_SOURCE_ACTIVE' }, restrictions: [],
}) as TalentStructureEffect
const talent = (talentIndex: number, name: string, effects: ExpandedTalentDefinition['effects']): ExpandedTalentDefinition =>
  ({ talentIndex, name, prefabKey: String(talentIndex + 1), categories: ['DAMAGE', 'STATUS'], effects })
const eventOptions: [string, string][] = [['ATTACK', '本人の攻撃1回'], ['SPLASH', '周囲への神経損傷1回'], ['ENEMY_ATTACK', '敵の通常攻撃への反応']]
export const EXPANDED_TRAGODIA_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [{ operatorId, phaseIndex: 2, skillLevelIndex: 9,
  talents: [
    talent(0, '形は心に役する', v => {
      // These exact reviewed coefficients are used by separate primary/splash
      // events rather than applying both to the primary target.
      if (v.read('attack@ep_damage_ratio') !== 0.3 || v.read('ep_damage_ratio') !== 0.2 || v.read('range_radius') !== 1.3)
        v.issue('神経損傷の確認済み主対象・周囲倍率と一致しません。')
      return [state('primary-and-splash', 'attack@ep_damage_ratio / ep_damage_ratio / range_radius', '主対象30%・周囲の他の敵20%の神経損傷を別イベントへ適用')]
    }),
    talent(1, '夢に堕ちる', v => {
      v.read('attack_speed')
      if (v.read('value') !== 70) v.issue('敵通常攻撃に対する確認済みの固定神経損傷70と一致しません。')
      return [state('enemy-response', 'attack_speed / value', '神経爆発中の敵の攻撃速度低下。敵通常攻撃直前の固定70神経損傷を独立イベントで評価。')]
    }),
  ],
  recipes: [
    recipe(1, [stage('ATTACK', '強化2連撃のうちHPダメージ1命中', [hit(k('atk_scale'))], undefined, {
      notes: ['先行する元素損傷の処理が終わった、生存中の対象へのHPダメージのみ。ダメージ時点の元素爆発状態を指定する。素質の発動回数と2連撃への配分は未確認のため合算しない。'],
    }),
      stage('PRIMARY_BUILDUP', '主対象への素質損傷1発動', [], mul(0.3, k('ep_damage_scale')), {
        notes: ['S1のバインドが既に有効な対象への素質発動1回。各命中で発動するかは推定しない。'],
      }),
      stage('SPLASH', '周囲への素質損傷1発動', [], mul(0.2, choose('tragodiaS1Bound', true, k('ep_damage_scale'), 1)), { maxTargets: null }), enemyAttack(1)],
      [['ATTACK', 'HPダメージ1命中'], ['PRIMARY_BUILDUP', '主対象への素質損傷1発動'], ['SPLASH', '周囲への素質損傷1発動'], ['ENEMY_ATTACK', '敵の通常攻撃への反応']],
      [bool('tragodiaS1Bound', '対象がS1のバインド中')],
      [{ when: { input: 'tragodiaEvent', comparison: 'EQ', value: 'PRIMARY_BUILDUP' }, condition: { input: 'tragodiaS1Bound', comparison: 'EQ', value: true },
        reason: '新規バインドの付与順が未確認です。S1によるバインドが既に有効な命中だけを計算します。' }]),
    recipe(2, [stage('ATTACK', '本人の通常攻撃1回', [hit()], 0.3, { aspd: k('attack_speed'), duration: 'UNTIL_EXIT' }),
      stage('SPLASH', '通常攻撃に伴う周囲損傷1回', [], 0.2, { maxTargets: null, duration: 'UNTIL_EXIT' }),
      stage('TOKEN_TICK', '本能の召喚退場後の効果1回', [{ ...hit(k('atk_scale')), basis: 'ATK_STAT' }], k('ep_damage_ratio_token'), { maxTargets: null }), enemyAttack(2)],
      [...eventOptions, ['TOKEN_TICK', '召喚退場後の効果1回']], [bool('tragodiaSnapshotUnchanged', '召喚時から攻撃力が変わっていない')],
      [{ when: { input: 'tragodiaEvent', comparison: 'EQ', value: 'TOKEN_TICK' }, condition: { input: 'elementalBuildupResistance', comparison: 'EQ', value: 0 },
        reason: '召喚退場後の神経損傷は損傷耐性の処理が未確認です。耐性0の対象だけを計算します。' },
      { when: { input: 'tragodiaEvent', comparison: 'EQ', value: 'TOKEN_TICK' }, condition: { input: 'tragodiaSnapshotUnchanged', comparison: 'EQ', value: true },
        reason: '召喚時の攻撃力を保持する効果です。召喚後に攻撃力が変化した場合は未対応です。' }]),
    recipe(3, [stage('ATTACK', '本人の通常攻撃1回', [hit()], 0.3, { atk: k('atk') }),
      stage('SPLASH', '通常攻撃に伴う周囲損傷1回', [], 0.2, { atk: k('atk'), maxTargets: null }),
      stage('SKILL_TICK', '付与済みの神経損傷1周期', [], k('ep_damage_ratio'), { atk: k('atk'), maxTargets: null }), enemyAttack(3)],
      [...eventOptions, ['SKILL_TICK', '付与済みの神経損傷1周期']]),
  ],
}]
