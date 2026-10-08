import type { RawSkillLevel, SkillRecord } from '../types/skill.ts'
import {
  calculateAttackPipeline,
  calculateSkillDamageBreakdown,
  deriveSkillModel,
  getOperatorStats,
  type DamageType,
  type OperatorStats,
  type SkillDamageBreakdown,
  type SkillModelDefaults,
} from './damageCalculator.ts'
import { getDamageSensitivityTablePoints } from './damageSensitivity.ts'
import {
  detectNormalAttackDamageType,
  detectSkillDamageType,
  getSkillDamageUnsupportedReasons,
} from './skillDamageModel.ts'

export interface DamageCalculatorTwoInput {
  operator: SkillRecord
  /** null selects the operator's normal attack. */
  skill: SkillRecord | null
  phaseIndex: number
  operatorLevel: number
  trust: number
  skillLevelIndex: number
}

export interface DamageCalculatorTwoRow {
  axisValue: number
  perHit: number
  perAttack: number
  dps: number | null
  breakdown: SkillDamageBreakdown
}

export interface DamageCalculatorTwoOutput {
  stats: OperatorStats
  model: SkillModelDefaults | null
  damageType: DamageType | null
  damageTypeReason: string
  axisLabel: '敵の防御力' | '敵の術耐性' | '防御力・術耐性'
  rows: DamageCalculatorTwoRow[]
  unsupportedReasons: string[]
  dpsReason: string | null
  canShowDps: boolean
  effectiveAttack: number | null
}

/**
 * Basic operator/skill damage only. Talent, trait, potential, module, and external
 * modifiers are intentionally never passed into the shared calculation pipeline.
 * Trait text is read solely to identify the normal attack's damage type.
 */
export function buildDamageCalculatorTwoOutput(input: DamageCalculatorTwoInput): DamageCalculatorTwoOutput {
  const { operator, skill } = input
  const stats = getOperatorStats(operator.operatorProfile, input.phaseIndex, input.operatorLevel, input.trust)
  const traitDescription = [
    operator.operatorProfile.traitDescription,
    operator.operatorProfile.subProfessionTraitDescription,
  ].filter(Boolean).join(' ')
  const normalDetection = detectNormalAttackDamageType(operator.profession, traitDescription)
  const levelIndex = Number.isFinite(input.skillLevelIndex) ? Math.round(input.skillLevelIndex) : 0
  const skillLevel = skill?.skillLevels[Math.min(Math.max(levelIndex, 0), Math.max(0, skill.skillLevels.length - 1))] ?? null
  const selectedSkill = skill && skillLevel ? normalizeNextAttackClassification({
    ...skill,
    description: normalizeDescription(skillLevel.description ?? skill.description),
    raw: skillLevel,
  }) : skill
  const detection = selectedSkill
    ? detectSkillDamageType(selectedSkill, normalDetection.damageType, skillLevel?.description ?? selectedSkill.description)
    : normalDetection
  const damageType = detection.damageType
  const model = skillLevel
    ? deriveSkillModel(skillLevel, stats.attackInterval, stats.attackSpeed)
    : skill === null ? createNormalModel(stats.attackInterval) : null
  const reasons: string[] = []

  if (operator.operatorProfile.phases.length === 0 || !operator.operatorProfile.phases.some(phase => (
    phase.attributesKeyFrames?.some(frame => typeof frame.data?.atk === 'number')
  ))) reasons.push('オペレーターの攻撃力データを取得できません。')
  if (operator.subProfessionId === 'funnel') {
    reasons.push('浮遊ユニットの攻撃は独立した計算モデルが必要です。')
  }
  if (skill && skill.operatorId !== operator.operatorId) {
    reasons.push('選択したオペレーターとスキルが一致していません。')
  }
  if (skill && !skillLevel) reasons.push('選択したスキルのレベル別データを取得できません。')
  if (selectedSkill) reasons.push(...getSkillDamageUnsupportedReasons(selectedSkill))
  if (skillLevel && model) reasons.push(...getUnresolvedModelReasons(skillLevel, selectedSkill!, model))
  if (damageType === null) reasons.push(detection.reason)
  if (model && (!Number.isFinite(model.attackInterval) || model.attackInterval <= 0)) {
    reasons.push('攻撃間隔を計算できません。')
  }

  const unsupportedReasons = [...new Set(reasons)]
  const canShowDps = unsupportedReasons.length === 0 && (
    skill === null || Boolean(
      selectedSkill?.classification.outputCapabilities.canShowDps
      && selectedSkill.classification.activationTrigger.value !== 'NEXT_ATTACK'
      && !selectedSkill.classification.damageComponents.value.includes('BURST'),
    )
  )
  const dpsReason = unsupportedReasons.length ? null : canShowDps ? null : (
    selectedSkill?.classification.activationTrigger.value === 'NEXT_ATTACK'
      ? '次回攻撃時に発動するスキルのため、連続攻撃のDPSは表示しません。'
      : '発動ごとの攻撃を通常の攻撃間隔で繰り返すスキルではないため、DPSは表示しません。'
  )
  const effectiveAttack = unsupportedReasons.length === 0 && model ? calculateAttackPipeline(stats.attack, {
    directMultiplierPercent: model.directMultiplierPercent,
    attackScale: model.attackScalePercent / 100,
  }).finalAttack : null
  const axisLabel = damageType === 'PHYSICAL' ? '敵の防御力' : damageType === 'ARTS' ? '敵の術耐性' : '防御力・術耐性'
  const rows = unsupportedReasons.length === 0 && damageType && model && effectiveAttack !== null
    ? getDamageSensitivityTablePoints(damageType, [effectiveAttack * 0.95]).map(axisValue => {
      const breakdown = calculateSkillDamageBreakdown(
        stats.attack,
        damageType,
        damageType === 'PHYSICAL' ? axisValue : 0,
        damageType === 'ARTS' ? axisValue : 0,
        model,
        { canShowDps, totalMode: 'NONE' },
      )
      return { axisValue, perHit: breakdown.perHit, perAttack: breakdown.perAttack, dps: breakdown.dps, breakdown }
    }) : []

  return {
    stats, model, damageType, damageTypeReason: detection.reason, axisLabel, rows,
    unsupportedReasons, dpsReason, canShowDps, effectiveAttack,
  }
}

function createNormalModel(attackInterval: number): SkillModelDefaults {
  return {
    directMultiplierPercent: 0, attackScalePercent: 100, hitCount: 1,
    attackInterval, duration: 0, ammoCount: 0, notes: [],
  }
}

function normalizeDescription(description: string): string {
  return description.normalize('NFKC').replace(/<[^>]*>/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeNextAttackClassification(skill: SkillRecord): SkillRecord {
  const components = skill.classification.damageComponents.value
  // The shared text classifier also calls a next-attack damage description a
  // burst. For a single enhanced attack these describe the same hit, rather than
  // two independent attacks. Explicit additional damage still stays unsupported.
  if (skill.classification.activationTrigger.value !== 'NEXT_ATTACK'
    || !components.includes('BASIC_ATTACK_MODIFIER') || !components.includes('BURST')
    || /(?:追加|さらに|別途)/.test(skill.description)) return skill
  return {
    ...skill,
    classification: {
      ...skill.classification,
      damageComponents: {
        ...skill.classification.damageComponents,
        value: components.filter(component => component !== 'BURST'),
      },
    },
  }
}

function getUnresolvedModelReasons(level: RawSkillLevel, skill: SkillRecord, model: SkillModelDefaults): string[] {
  const reasons: string[] = []
  const entries = level.blackboard ?? []
  const description = normalizeDescription(level.description ?? skill.description)
  const supportedAttackKeys = new Set([
    'atk', 'atk_scale', 'attack@atk_scale', 'attack@times', 'attack_times', 'multi_times',
    'attack_speed', 'attack@attack_speed', 'base_attack_time', 'attack@base_attack_time',
  ])
  const attackEntries = entries.filter(entry => typeof entry.key === 'string' && (
    /(?:^|[.@])(?:atk|atk_scale|attack_speed|base_attack_time)$/.test(entry.key.toLowerCase())
    || /(?:^|[.@])(?:atk_scale|attack_speed|base_attack_time)_/.test(entry.key.toLowerCase())
    || /^(?:attack@times$|attack_times$|multi_times$)/.test(entry.key.toLowerCase())
  ))
  if (attackEntries.some(entry => !supportedAttackKeys.has(entry.key!.toLowerCase()))) {
    reasons.push('条件・用途ごとに異なる攻撃補正を選ぶ必要があります。')
  }
  if (attackEntries.some(entry => typeof entry.value !== 'number' || !Number.isFinite(entry.value))) {
    reasons.push('攻撃補正の数値データを取得できません。')
  }
  if (entries.some(entry => entry.key?.toLowerCase() === 'atk' && (entry.value ?? 0) < 0)) {
    reasons.push('攻撃力が減少するスキルは現在の基本モデルに対応していません。')
  }
  if (entries.some(entry => /(?:penetrat|def_ignore|res(?:ist(?:ance)?)?_ignore|fragil|damage_taken|damage_receive)/i.test(entry.key ?? ''))
    || /(?:防御力|術耐性).{0,24}(?:無視|貫通)|(?:敵|攻撃対象|対象).{0,24}(?:防御力|術耐性).{0,24}(?:減少|低下|\-)|脆弱/.test(description)) {
    reasons.push('スキルによる防御力・術耐性の無視や被ダメージ補正は現在の基本モデルに対応していません。')
  }
  if (/(?:攻撃対象|敵|対象)(?:の)?(?:攻撃速度|攻撃間隔|攻撃力)/.test(description)
    && entries.some(entry => /(?:attack_speed|base_attack_time)$/.test(entry.key ?? ''))) {
    reasons.push('攻撃対象への速度補正を自身の攻撃間隔として適用できません。')
  }
  const intervalEntries = entries.filter(entry => ['base_attack_time', 'attack@base_attack_time'].includes(entry.key?.toLowerCase() ?? ''))
  if (intervalEntries.some(entry => entry.value !== 0)
    && !/攻撃間隔.{0,24}[+\-](?:\d+(?:\.\d+)?|\{[^}]+\})秒/.test(description)) {
    reasons.push('攻撃間隔の変更が秒数の加算か、倍率・置き換えかを特定できません。')
  }
  if (model.notes.some(note => note.includes('初期版の計算対象外'))) {
    reasons.push('計算対象外の独立ダメージ倍率を含みます。')
  }
  if (model.notes.some(note => note.includes('複数の攻撃力補正E'))) {
    reasons.push('複数の攻撃倍率を別々に扱うモデルが必要です。')
  }
  if (/攻撃力(?:が)?(?:\+|上昇|を上げ)/.test(description)
    && !entries.some(entry => entry.key?.toLowerCase() === 'atk')) {
    reasons.push('スキルの攻撃力補正をゲームデータから特定できません。')
  }
  if (/(?:攻撃力の|攻撃力に相当する).{0,40}(?:ダメージ|攻撃)/.test(description)
    && !attackEntries.some(entry => /atk_scale/.test(entry.key!))) {
    reasons.push('攻撃の倍率をゲームデータから特定できません。')
  }
  if (skill.classification.conditions.value.some(condition => [
    'OVERCHARGE', 'PHASE', 'MODE', 'TARGET_STATE', 'DEPLOY_TIME', 'ACTIVATION_COUNT', 'OTHER',
  ].includes(condition))) reasons.push('条件によって変わるスキル効果の選択が必要です。')
  if (/(?:徐々に|(?:攻撃|発動)する(?:たび|度|毎)|攻撃する毎|攻撃回数に応じ|HPが.{0,24}(?:以下|未満|以上)|(?:確率で|確率の)|(?:初回|2回目以降)).{0,60}(?:攻撃力|攻撃速度|ダメージ|攻撃)|(?:攻撃力|攻撃速度).{0,40}(?:徐々に|確率)/.test(description)) {
    reasons.push('変動・確率・条件による攻撃補正は現在の基本モデルに対応していません。')
  }
  if (/(?:追加(?:で|の)?|さらに|別途)[^。\n]{0,100}(?:ダメージを与|攻撃を行う|攻撃する)|(?:追加|追撃|余分).{0,20}(?:ダメージ|攻撃)/.test(description)) {
    reasons.push('通常攻撃と追加ダメージ・追加攻撃を別々に計算するモデルが必要です。')
  }
  const hasHitKey = entries.some(entry => ['attack@times', 'attack_times', 'multi_times'].includes(entry.key?.toLowerCase() ?? ''))
  if (entries.some(entry => ['attack@times', 'attack_times', 'multi_times'].includes(entry.key?.toLowerCase() ?? '')
    && (!Number.isInteger(entry.value) || entry.value! < 1 || entry.value! > 100))) {
    reasons.push('1攻撃のヒット数データが不正です。')
  }
  if (!hasHitKey && /(?:連撃|連続で.{0,12}(?:回|攻撃)|攻撃が.{0,20}回攻撃|通常攻撃.{0,24}(?:回|連射)|(?:\d+|\{[^}]+\})回(?:連続)?攻撃|(?:\d+|\{[^}]+\})連(?:続攻撃|射))/.test(description)) {
    reasons.push('1攻撃のヒット数をゲームデータから特定できません。')
  }
  if (skill.classification.damageComponents.value.includes('BURST') && !attackEntries.some(entry => /atk_scale/.test(entry.key!))) {
    reasons.push('独立した攻撃の倍率をゲームデータから特定できません。')
  }
  return reasons
}
