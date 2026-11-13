import type { RawOperatorModule, SkillRecord } from '../types/skill.ts'
import type { DamageCalculatorThreeModuleLevel } from './damageCalculatorThreeModuleCoverage.ts'
import {
  applyOperatorModule, getOperatorModuleLevels, getOperatorModules, isOperatorModuleUnlocked,
  type OperatorModuleApplication, type OperatorModuleChange,
} from './operatorModules.ts'
import { getOperatorPassives, type OperatorPassives, type PassiveSource } from './operatorProfile.ts'

const SURTR_OPERATOR_ID = 'char_350_surtr'
const SURTR_X_MODULE_ID = 'uniequip_002_surtr'
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

function resolveModuleStage(operator: SkillRecord, module: RawOperatorModule, level: number) {
  if (!getOperatorModuleLevels(module).includes(level)) return null
  const profile = operator.operatorProfile
  const phaseIndex = Math.max(0, profile.phases.length - 1)
  const operatorLevel = profile.phases[phaseIndex]?.maxLevel ?? 1
  const basePassives = getOperatorPassives(profile, phaseIndex, operatorLevel, POTENTIAL_RANK)
  const application = applyOperatorModule(basePassives, module, level, POTENTIAL_RANK)
  return {
    basePassives, application,
    reviewedSurtrX: operator.operatorId === SURTR_OPERATOR_ID && module.uniEquipId === SURTR_X_MODULE_ID
      && phaseIndex === 2 && isOperatorModuleUnlocked(module, phaseIndex, operatorLevel),
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

export function getModuleEffectStructure(operator: SkillRecord, module: RawOperatorModule, level: number): ModuleEffectStructure {
  const stage = resolveModuleStage(operator, module, level)
  if (!stage) return { available: false, rows: [], otherChanges: [] }
  const { application, basePassives, reviewedSurtrX } = stage
  const rows: ModuleEffectStructureRow[] = application.attributeEffects.map((effect, index) => ({
    id: `attribute-${effect.key}-${index}`, category: 'ステータス',
    item: effect.key === 'magic_resistance' ? '自身の術耐性' : effect.label,
    condition: '常時', value: effect.valueLabel,
  }))
  const represented = new Set<OperatorModuleChange>()
  if (reviewedSurtrX) {
    const trait = application.passives.sources.find(source => source.sourceKind === 'TRAIT')
    const speed = readNonNegativeValue(trait, 'attack_speed')
    const speedChange = speed === undefined ? undefined : application.changes.find(effect =>
      effect.kind === 'TRAIT' && effect.description === `未ブロック時、攻撃速度+${speed}`)
    if (speedChange) {
      rows.push({ id: 'surtr-x-unblocked-attack-speed', category: '特性', item: '攻撃速度',
        condition: '未ブロック時', value: `+${speed}` })
      represented.add(speedChange)
    }
    const talent = getReviewedSurtrTalent(basePassives, application, level)
    if (talent?.change && talent.baseValue !== talent.equippedValue) {
      rows.push({ id: SURTR_RESISTANCE_IGNORE_EFFECT_ID, category: '素質', item: '劫火の術耐性固定無視',
        condition: '攻撃時', value: `${talent.baseValue} → ${talent.equippedValue}`, talentIndex: 0, talentName: '劫火' })
      represented.add(talent.change)
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
    if (!stage?.reviewedSurtrX) return []
    const talent = getReviewedSurtrTalent(stage.basePassives, stage.application, level)
    if (!talent) return []
    const { baseValue, equippedValue, equippedDescription } = talent
    return [{ moduleId: SURTR_X_MODULE_ID, moduleLabel: `MOD X Lv.${level}`, level,
      effectId: SURTR_RESISTANCE_IGNORE_EFFECT_ID, baseValue, equippedValue, equippedDescription }]
  })
}
