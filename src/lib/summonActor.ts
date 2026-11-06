import retainedTokens from '../data/expandedSummonTokenSources.json' with { type: 'json' }
import type { SummonCombatSource } from '../types/skill.ts'
import type { DamageCalculatorThreeInput, DamageCalculatorThreeOutput } from './damageCalculatorThree.ts'
import { buildGuardDamageOutput, type GuardActorContext } from './guardDamageCalculator.ts'
import { evaluateGuardPassives, getGuardPassiveInputs } from './guardCombatPassives.ts'
import { getExpandedSource } from './expandedCombatRegistry.ts'
import { guardConditionMatches, mergeGuardInputs, resolveGuardConditions, resolveGuardValue } from './guardCombatValues.ts'
import { calculateAttackPipeline, getOperatorStats } from './damageCalculator.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import { buildTraitStructures } from './traitStructure.ts'
import type { GuardPassiveModifiers } from './guardCombatTypes.ts'
import type { SkillStructure } from './skillStructure.ts'

const sources = retainedTokens as unknown as Readonly<Record<string, SummonCombatSource>>
const ACTORS: Readonly<Record<string, string>> = {
  token_10010_folivo_car: 'char_336_folivo', token_10001_deepcl_tentac: 'char_110_deepcl',
  token_10004_otter_motter: 'char_242_otter',
  token_10036_lasher_mcbird: 'char_4140_lasher', token_10021_blkngt_hypnos: 'char_476_blkngt',
  token_10005_mgllan_drone2: 'char_248_mgllan', token_10005_mgllan_drone3: 'char_248_mgllan',
  token_10020_ling_soul1: 'char_2023_ling', token_10020_ling_soul2: 'char_2023_ling',
  token_10020_ling_soul3: 'char_2023_ling',
  token_10051_radian_tower1: 'char_4195_radian', token_10052_radian_tower2: 'char_4195_radian', token_10053_radian_tower3: 'char_4195_radian',
  token_10024_ebnhlz_rcube: 'char_4046_ebnhlz', token_10022_kazema_shadow: 'char_4016_kazema', token_10027_ironmn_pile3: 'char_4072_ironmn',
  token_10002_kalts_mon3tr: 'char_003_kalts', token_10028_vigil_wolf: 'char_427_vigil', token_10014_bstalk_crab: 'char_452_bstalk',
}

/** Compare all retained token fields, including hidden talents, skill sources and keyframe stats.
 * Object property order is irrelevant. Missing fields, new effects and numeric changes fail closed.
 */
export function sameReviewedSummon(actual: unknown, expected: unknown): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonical(entry)]))
    if (typeof value === 'number' && !Number.isFinite(value)) return '__invalid_number__'
    return value
  }
  return !!actual && !!expected && JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected))
}

/** Keep owner/skill identity intact; only the reviewed actor's execution context changes. */
export function buildSummonDamageOutput(input: DamageCalculatorThreeInput, structure: SkillStructure,
  initialErrors: string[] = []): DamageCalculatorThreeOutput {
  const recipe = structure.guardRecipe!
  const selection = resolveGuardConditions(mergeGuardInputs(getGuardPassiveInputs(input.operator.operatorId), recipe.inputs), input.conditions?.guard ?? {})
  const stages = recipe.stages.filter(stage => !stage.when || guardConditionMatches(stage.when, selection.values))
  // Ambiguous or invalid selections are diagnosed by the common guard validator.
  if (stages.length !== 1 || !stages[0].actor) return buildGuardDamageOutput(input, structure, initialErrors)
  const stage = stages[0], tokenKey = stage.actor!.tokenKey
  const retained = sources[tokenKey], live = input.operator.operatorProfile.summonProfiles?.[tokenKey]
  const ownerSource = getExpandedSource(input.operator.operatorId)
  const errors = [...initialErrors]
  if (ACTORS[tokenKey] !== input.operator.operatorId || !retained || !sameReviewedSummon(live, retained))
    errors.push('召喚物のステータス・特性・素質・スキルが確認済みのデータと一致しません。')
  if (!sameReviewedSummon(input.operator.operatorProfile.summonSkillTokenKeys, ownerSource?.profile.summonSkillTokenKeys)
    || (input.skill.overrideTokenKey ?? null) !== (ownerSource?.profile.summonSkillTokenKeys?.[input.skill.skillIndex - 1] ?? null))
    errors.push('召喚物と選択スキルの対応関係を確認できません。')
  const overrideToken = ownerSource?.profile.summonSkillTokenKeys?.[input.skill.skillIndex - 1]
  if (overrideToken && overrideToken !== tokenKey) errors.push('スキルが指定する召喚物と計算する召喚物が一致しません。')
  if (!Number.isSafeInteger(input.operatorLevel) || input.operatorLevel < 1
    || input.operatorLevel > (live?.profile.phases[input.phaseIndex]?.maxLevel ?? 0))
    errors.push('召喚物の昇進段階・レベルが有効範囲外です。')
  // Safe preview stats are returned on invalid source, but errors prevent all numerical damage rows.
  const profile = errors.length || !live ? input.operator.operatorProfile : live.profile
  const stats = getOperatorStats(profile, Number.isFinite(input.phaseIndex) ? input.phaseIndex : 0,
    Number.isFinite(input.operatorLevel) ? input.operatorLevel : 1, 0)
  let ownerAttackStat: number | undefined, attackFinalAddition: number | undefined
  // These exact skills have an owner-ATK reference. Token stage ATK (e.g. Ling's merged form)
  // must never be reused as the owner's skill bonus. The owner and token are evaluated once each.
  const referencesOwner = input.operator.operatorId === 'char_4195_radian'
    || input.skill.skillIndex === 3 && ['char_2023_ling', 'char_427_vigil', 'char_4072_ironmn'].includes(input.operator.operatorId)
    || input.skill.skillIndex === 2 && input.operator.operatorId === 'char_4046_ebnhlz'
  if (referencesOwner) try {
    const raw = input.skill.skillLevels[input.skillLevelIndex]
    const ownerSkillBonus = ['char_427_vigil', 'char_4046_ebnhlz'].includes(input.operator.operatorId) || input.skill.skillIndex === 1
      || input.operator.operatorId === 'char_4072_ironmn' && selection.values.ironmnSkillActive === false
      ? 0 : raw?.blackboard?.find(entry => entry.key === 'atk')?.value
    const frames = input.operator.operatorProfile.phases[input.phaseIndex]?.attributesKeyFrames
    if (!frames?.length || [...frames, ...input.operator.operatorProfile.favorKeyFrames].some(frame =>
      typeof frame.data?.atk !== 'number' || !Number.isFinite(frame.data.atk) || frame.data.atk < 0))
      throw new RangeError('召喚者の攻撃力ステータスを確認できません。')
    if (typeof ownerSkillBonus !== 'number' || !Number.isFinite(ownerSkillBonus) || ownerSkillBonus < 0)
      throw new RangeError('召喚者のスキル攻撃力を確認できません。')
    const ownerStats = getOperatorStats(input.operator.operatorProfile, input.phaseIndex, input.operatorLevel, input.trust)
    const ownerPassive = evaluateGuardPassives(input.operator, selection.values, { kind: stage.kind,
      skillIndex: recipe.skillIndex, stageId: stage.id, stage, phaseIndex: input.phaseIndex, operatorLevel: input.operatorLevel })
    errors.push(...ownerPassive.blockers)
    ownerAttackStat = calculateAttackPipeline(ownerStats.attack, { directAddition: ownerPassive.attackFlat,
      directMultiplierPercent: (ownerSkillBonus + ownerPassive.attackRatio) * 100,
      finalAddition: ownerPassive.attackFinalFlat ?? 0 }).finalAttack
    if (input.operator.operatorId === 'char_4195_radian') {
      const inspiration = getOperatorPassives(input.operator.operatorProfile, input.phaseIndex, input.operatorLevel).sources
        .find(source => source.sourceKind === 'TALENT' && source.talentIndex === 1)?.blackboard.find(entry => entry.key === 'atk')?.value
      if (inspiration !== 0.12) throw new RangeError('レイディアンの確認済み鼓舞倍率12%と一致しません。')
      attackFinalAddition = ownerAttackStat * inspiration
    }
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)) }
  const context: GuardActorContext = {
    stats, ownerAttackStat, attackFinalAddition,
    evaluatePassives(operator, conditions, passiveContext) {
      // Validate every owner passive without copying self-only ATK/ASPD to the token.
      const owner = evaluateGuardPassives(operator, conditions, passiveContext)
      const output: GuardPassiveModifiers = { attackRatio: 0, attackFlat: 0, attackScale: 1, attackSpeed: 0,
        damageScale: tokenKey === 'token_10036_lasher_mcbird' ? owner.damageScale : 1,
        defenseIgnoreRatio: 0, defenseIgnoreFixed: tokenKey === 'token_10028_vigil_wolf' ? owner.defenseIgnoreFixed : 0,
        resistanceIgnoreFixed: 0, resistanceIgnoreRatio: 0,
        defenseReductionRatio: 0, critChance: 0, critScale: 1, additionalActions: [],
        evaluations: tokenKey === 'token_10024_ebnhlz_rcube' ? owner.evaluations.map(row => ({ ...row, status: 'NOT_RELEVANT', reason: '残像は貯蔵弾・本人の攻撃ではなく、本人の攻撃素質を継承しません。' }))
          : tokenKey.startsWith('token_10020_ling_') && !referencesOwner ? owner.evaluations.map(row => row.talentIndex === 1
          ? { ...row, status: 'NOT_RELEVANT', reason: 'リィン本人への攻撃力・SP効果は召喚物に継承しません。' } : row) : owner.evaluations,
        blockers: owner.blockers, notes: [...owner.notes, referencesOwner
          ? `${retained?.name ?? tokenKey}1体の基礎攻撃力と召喚者の参照攻撃力を別々に計算。`
          : `${retained?.name ?? tokenKey}1体の独立ステータスを使用。本人の信頼度・潜在・MODの攻撃力を継承しない。`] }
      return output
    },
    evaluateTraits(operator, selectedStage, conditions, board, growth) {
      const ownerTrait = buildTraitStructures([operator], growth)[0]
      const blockers = !ownerTrait || ownerTrait.status !== 'STRUCTURED'
        ? ['召喚者の確認済み特性を取得できません。'] : []
      if (selectedStage.actor?.tokenKey !== tokenKey) blockers.push('計算段階と召喚物が一致しません。')
      // Reviewed token native attributes are in the stage; summoner/tactician traits belong to the owner.
      return { evaluation: { attackScale: 1, attackRatio: 0, blockers, evaluations: [] },
        actions: selectedStage.actions.map(action => ({ ...action })), splashActions: new Map(),
        maxTargets: selectedStage.maxTargets === null ? null : selectedStage.maxTargets === undefined ? 1
          : resolveGuardValue(selectedStage.maxTargets, board, conditions) }
    },
  }
  const result = buildGuardDamageOutput(input, structure, errors, context)
  return { ...result, actor: { kind: 'TOKEN', tokenKey, name: retained?.name ?? tokenKey,
    ...(result.rows.length > 0 && stage.actions.some(action => action.basis === 'OWNER_ATK_STAT')
      && typeof ownerAttackStat === 'number' && Number.isFinite(ownerAttackStat) && ownerAttackStat >= 0
      ? { ownerAttackStat } : {}),
  } }
}
