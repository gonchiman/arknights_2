import type { RawOperatorModule, SkillRecord } from '../types/skill.ts'
import type { DamageCalculatorThreeModuleLevel } from './damageCalculatorThreeModuleCoverage.ts'
import {
  applyOperatorModule, getOperatorModuleLevels, getOperatorModules, isOperatorModuleUnlocked,
  type OperatorModuleApplication, type OperatorModuleChange,
} from './operatorModules.ts'
import { getOperatorPassives, type OperatorPassives, type PassiveSource } from './operatorProfile.ts'
import { getSurtrRemnantAttackSpeedBonus } from './surtrRemnantAttackSpeed.ts'

const SURTR_OPERATOR_ID = 'char_350_surtr'
export const SURTR_X_MODULE_ID = 'uniequip_002_surtr'
export const SURTR_Y_MODULE_ID = 'uniequip_003_surtr'
const SURTR_RESISTANCE_IGNORE_KEY = 'magic_resist_penetrate_fixed'
const SURTR_RESISTANCE_IGNORE_EFFECT_ID = 'resistance-ignore'
const POTENTIAL_RANK = 1

export interface ModuleEffectStructureRow {
  id: string
  category: string
  item: string
  condition: string
  value: string
  talentIndex?: number
  talentName?: string
}

export interface ModuleEffectStructure {
  available: boolean
  rows: ModuleEffectStructureRow[]
  otherChanges: OperatorModuleChange[]
}

export interface TalentModuleComparison {
  moduleId: string
  moduleLabel: string
  level: DamageCalculatorThreeModuleLevel
  effectId: string
  baseValue: number
  equippedValue: number
  equippedDescription: string
}

type ModuleEffectOperator = Pick<SkillRecord, 'operatorId' | 'operatorProfile'>

function resolveModuleStage(operator: ModuleEffectOperator, module: RawOperatorModule, level: number) {
  if (!getOperatorModuleLevels(module).includes(level)) return null
  const profile = operator.operatorProfile
  const phaseIndex = Math.max(0, profile.phases.length - 1)
  const operatorLevel = profile.phases[phaseIndex]?.maxLevel ?? 1
  const basePassives = getOperatorPassives(profile, phaseIndex, operatorLevel, POTENTIAL_RANK)
  const application = applyOperatorModule(basePassives, module, level, POTENTIAL_RANK)
  return {
    basePassives, application,
    reviewedSurtr: operator.operatorId === SURTR_OPERATOR_ID && phaseIndex === 2
      && isOperatorModuleUnlocked(module, phaseIndex, operatorLevel),
  }
}

function readNonNegativeValue(source: PassiveSource | undefined, key: string): number | undefined {
  const value = source?.blackboard.find(entry => entry.key === key)?.value
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function getSurtrTalent(passives: OperatorPassives) {
  return passives.sources.find(source => source.sourceKind === 'TALENT' && source.talentIndex === 0
    && source.sourceName === '劫火' && source.prefabKey === '1' && source.requiredPotentialRank === 0)
}

function getReviewedSurtrTalent(basePassives: OperatorPassives, application: OperatorModuleApplication, level: number) {
  const original = getSurtrTalent(basePassives)
  const equipped = getSurtrTalent(application.passives)
  const baseValue = readNonNegativeValue(original, SURTR_RESISTANCE_IGNORE_KEY)
  const equippedValue = readNonNegativeValue(equipped, SURTR_RESISTANCE_IGNORE_KEY)
  // If the source changes the reviewed timing or operation, keep its original description.
  if (!original || !equipped || baseValue === undefined || equippedValue === undefined
    || original.description !== `攻撃時、対象の術耐性を${baseValue}無視`
    || equipped.description !== `攻撃時、対象の術耐性を${equippedValue}無視`) return null

  const change = application.changes.find(effect => effect.kind === 'TALENT' && effect.talentIndex === 0)
  if (level === 1 ? Boolean(change) || baseValue !== equippedValue : change?.description !== equipped.description) {
    return null
  }
  return { baseValue, equippedValue, equippedDescription: equipped.description, change }
}

export function getReviewedSurtrXEffects(
  basePassives: OperatorPassives,
  application: OperatorModuleApplication,
  level: number,
) {
  const trait = application.passives.sources.find(source => source.sourceKind === 'TRAIT')
  const speed = readNonNegativeValue(trait, 'attack_speed')
  const change = speed === undefined ? undefined : application.changes.find(effect =>
    effect.kind === 'TRAIT' && effect.description === `未ブロック時、攻撃速度+${speed}`)
  return {
    unblockedSpeed: speed !== undefined && change ? { value: speed, change } : null,
    talent: getReviewedSurtrTalent(basePassives, application, level),
  }
}

export function getReviewedSurtrYEffects(
  basePassives: OperatorPassives,
  application: OperatorModuleApplication,
  level: number,
) {
  const trait = application.passives.sources.find(source => source.sourceKind === 'TRAIT')
  const scale = readNonNegativeValue(trait, 'damage_scale')
  const percent = scale === undefined ? null : formatFragilityPercent(scale)
  const fragilityChange = application.changes.find(effect => effect.kind === 'TRAIT'
    && effect.description === `自身がブロックしている敵に${percent}の対術脆弱状態を付与`)
  const blockedFragility = scale !== undefined && scale > 1 && fragilityChange
    ? { value: scale, change: fragilityChange } : null

  const original = basePassives.sources.find(isSurtrRemnantTalent)
  const equipped = application.passives.sources.find(isSurtrRemnantTalent)
  const speed = getSurtrRemnantAttackSpeedBonus(application.passives, 'Y', level)
  const originalDuration = readNonNegativeValue(original, 'surtr_t_2[withdraw].interval')
  const duration = readNonNegativeValue(equipped, 'surtr_t_2[withdraw].interval')
  const change = application.changes.find(effect => effect.kind === 'TALENT' && effect.talentIndex === 1)
  const remnantSpeed = original && equipped && speed !== null && originalDuration !== undefined && duration !== undefined
    && original.description.replace(/\s+/g, ' ') === `致命的なダメージを受けてもHPが1残る 効果発動から${originalDuration}秒後強制退場`
    && (level === 1
      ? !change && speed === 0 && originalDuration === duration
      : speed > 0 && change?.description === `致命的なダメージを受けてもHPが1残り、攻撃速度+${speed} 効果発動から${duration}秒後強制退場`)
    ? { value: speed, change, originalDuration, duration } : null
  return { blockedFragility, remnantSpeed }
}

function isSurtrRemnantTalent(source: PassiveSource): boolean {
  return source.sourceKind === 'TALENT' && source.talentIndex === 1 && source.sourceName === '余燼'
    && source.prefabKey === '2' && source.requiredPotentialRank === 0
}

export function formatFragilityPercent(multiplier: number): string {
  return `${Number(((multiplier - 1) * 100).toFixed(4))}%`
}

export function getModuleEffectStructure(operator: ModuleEffectOperator, module: RawOperatorModule, level: number): ModuleEffectStructure {
  const stage = resolveModuleStage(operator, module, level)
  if (!stage) return { available: false, rows: [], otherChanges: [] }
  const { application, basePassives, reviewedSurtr } = stage
  const rows: ModuleEffectStructureRow[] = application.attributeEffects.map((effect, index) => ({
    id: `attribute-${effect.key}-${index}`, category: 'ステータス',
    item: effect.key === 'magic_resistance' ? '自身の術耐性' : effect.label,
    condition: '常時', value: effect.valueLabel,
  }))
  const represented = new Set<OperatorModuleChange>()
  if (reviewedSurtr && module.uniEquipId === SURTR_X_MODULE_ID) {
    const { unblockedSpeed, talent } = getReviewedSurtrXEffects(basePassives, application, level)
    if (unblockedSpeed) {
      rows.push({ id: 'surtr-x-unblocked-attack-speed', category: '特性', item: '攻撃速度',
        condition: '未ブロック時', value: `+${unblockedSpeed.value}` })
      represented.add(unblockedSpeed.change)
    }
    if (talent?.change && talent.baseValue !== talent.equippedValue) {
      rows.push({ id: SURTR_RESISTANCE_IGNORE_EFFECT_ID, category: '素質', item: '劫火の術耐性固定無視',
        condition: '攻撃時', value: `${talent.baseValue} → ${talent.equippedValue}`, talentIndex: 0, talentName: '劫火' })
      represented.add(talent.change)
    }
  }
  if (reviewedSurtr && module.uniEquipId === SURTR_Y_MODULE_ID) {
    const { blockedFragility, remnantSpeed } = getReviewedSurtrYEffects(basePassives, application, level)
    if (blockedFragility) {
      rows.push({ id: 'surtr-y-blocked-arts-fragility', category: '特性', item: '対術脆弱',
        condition: '自身がブロックしている敵', value: formatFragilityPercent(blockedFragility.value) })
      represented.add(blockedFragility.change)
    }
    if (remnantSpeed?.change) {
      rows.push({ id: 'surtr-y-remnant-attack-speed', category: '素質', item: '余燼の攻撃速度',
        condition: '余燼発動中', value: `+${remnantSpeed.value}` })
      if (remnantSpeed.duration !== remnantSpeed.originalDuration) {
        rows.push({ id: 'surtr-y-remnant-duration', category: '素質', item: '余燼の退場までの時間',
          condition: '余燼発動後', value: `${remnantSpeed.originalDuration}秒 → ${remnantSpeed.duration}秒` })
      }
      represented.add(remnantSpeed.change)
    }
  }
  return { available: true, rows, otherChanges: application.changes.filter(change => !represented.has(change)) }
}

export function getTalentModuleComparisons(operator: SkillRecord, talentIndex: number): TalentModuleComparison[] {
  if (operator.operatorId !== SURTR_OPERATOR_ID || talentIndex !== 0) return []
  const module = getOperatorModules(operator.operatorProfile).find(candidate => candidate.uniEquipId === SURTR_X_MODULE_ID)
  if (!module) return []
  return ([1, 2, 3] as const).flatMap(level => {
    const stage = resolveModuleStage(operator, module, level)
    if (!stage?.reviewedSurtr) return []
    const talent = getReviewedSurtrTalent(stage.basePassives, stage.application, level)
    if (!talent) return []
    const { baseValue, equippedValue, equippedDescription } = talent
    return [{ moduleId: SURTR_X_MODULE_ID, moduleLabel: `MOD X Lv.${level}`, level,
      effectId: SURTR_RESISTANCE_IGNORE_EFFECT_ID, baseValue, equippedValue, equippedDescription }]
  })
}
