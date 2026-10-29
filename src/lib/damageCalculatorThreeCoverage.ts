import type { SkillRecord } from '../types/skill.ts'
import { getDamageCalculatorThreeStructures } from './damageCalculatorThree.ts'
import { describeGuardPassiveEffects, getGuardPassiveCalculationConstraints, getGuardPassiveInputs, getGuardRegisteredTalentNames } from './guardCombatPassives.ts'
import { getExpandedDefinition } from './expandedCombatRegistry.ts'
import type { GuardCalculationIssue, GuardConditions, GuardSkillRecipe, GuardStage } from './guardCombatTypes.ts'
import { mergeGuardInputs, resolveGuardConditions } from './guardCombatValues.ts'
import type { SkillStructure, SkillStructureSelection, SkillStructureStage } from './skillStructure.ts'
import { getSkillStructureDeferredCases } from './skillStructureDeferredCases.ts'
import { isDamageCalculatorThreeTalentItemRelevant } from './damageCalculatorThreeTalents.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import { describeRegisteredTalentEffects } from './talentStructure.ts'
import { getExpandedTraitCoverage } from './traitEffectApplication.ts'
import { buildTraitStructures } from './traitStructure.ts'
import { evaluateGuardTraits } from './guardTraitEvaluation.ts'

export type DamageCalculatorThreeCoverageStatus = 'SUPPORTED' | 'CONDITIONAL' | 'PENDING' | 'UNSUPPORTED'
export type DamageCalculatorThreeCoverageSectionStatus = DamageCalculatorThreeCoverageStatus | 'NOT_APPLICABLE'

export const COVERAGE_STATUS_LABELS: Readonly<Record<DamageCalculatorThreeCoverageStatus, string>> = {
  SUPPORTED: '対応', CONDITIONAL: '条件付き', PENDING: '保留', UNSUPPORTED: '未対応',
}

export const COVERAGE_SECTION_STATUS_LABELS: Readonly<Record<DamageCalculatorThreeCoverageSectionStatus, string>> = {
  ...COVERAGE_STATUS_LABELS, NOT_APPLICABLE: '対象外',
}

export interface DamageCalculatorThreeCoverageDetail {
  readonly id: string
  readonly label: string
  readonly name: string
  readonly status: DamageCalculatorThreeCoverageSectionStatus
}

export interface DamageCalculatorThreeCoverageIssue {
  readonly id: string
  readonly reason: string
  readonly relatedSections: readonly string[]
  readonly supportedCondition?: string
  readonly impact: 'BLOCKING' | 'OUTSIDE_SCOPE'
  readonly currentTreatment?: string
  readonly stages?: readonly string[]
}

export const COVERAGE_STATUS_OPTIONS: readonly { value: DamageCalculatorThreeCoverageStatus; label: string }[] =
  (['SUPPORTED', 'CONDITIONAL', 'PENDING', 'UNSUPPORTED'] as const)
    .map(value => ({ value, label: COVERAGE_STATUS_LABELS[value] }))

export interface DamageCalculatorThreeCoverageRow {
  readonly skill: SkillRecord
  readonly status: DamageCalculatorThreeCoverageStatus
  readonly selection?: SkillStructureSelection
  readonly calculationScope: readonly string[]
  readonly supportedConditions: readonly string[]
  readonly deferredReasons: readonly string[]
  readonly scopeNotes: readonly string[]
  readonly sections: Readonly<Record<'skill' | 'talent' | 'trait', DamageCalculatorThreeCoverageSectionStatus>>
  readonly details: readonly DamageCalculatorThreeCoverageDetail[]
  readonly issues: readonly DamageCalculatorThreeCoverageIssue[]
}

type CoverageSummary = Omit<DamageCalculatorThreeCoverageRow, 'sections' | 'details' | 'issues'>

const unique = (values: readonly string[]): string[] => [...new Set(values)]
const identity = (skill: Pick<SkillRecord, 'operatorId' | 'skillId' | 'skillIndex'>): string =>
  JSON.stringify([skill.operatorId, skill.skillId, skill.skillIndex])

/** One row per catalog skill. Registration, not a default-input calculation or the
 * historical source `supported` flag, determines coverage. A missing live profile
 * still belongs to its registered scope; calculator validation reports that error.
 */
export function buildDamageCalculatorThreeCoverage(rows: readonly SkillRecord[]): DamageCalculatorThreeCoverageRow[] {
  const skills = new Map<string, SkillRecord>()
  for (const skill of rows) {
    const key = identity(skill)
    const previous = skills.get(key)
    if (!previous || skill.skillLevels.length > previous.skillLevels.length) skills.set(key, skill)
  }
  const structures = new Map<string, SkillStructure>()
  for (const structure of getDamageCalculatorThreeStructures()) {
    const key = identity(structure.basicInfo)
    const previous = structures.get(key)
    if (!previous || structure.basicInfo.levelIndex > previous.basicInfo.levelIndex) structures.set(key, structure)
  }
  return [...skills.values()].map<CoverageSummary>(skill => {
    const structure = structures.get(identity(skill))
    if (!structure) return { skill, status: 'UNSUPPORTED', calculationScope: [], supportedConditions: [],
      deferredReasons: [], scopeNotes: [] }
    const { operatorId, skillId, skillIndex, levelIndex } = structure.basicInfo
    const selection = { operatorId, skillId, skillIndex, levelIndex }
    const deferred = getSkillStructureDeferredCases(selection)
    if (!structure.guardRecipe) return {
      skill, selection, status: 'SUPPORTED',
      calculationScope: unique(structure.effectStructure.stages.map(legacyStageScope)),
      supportedConditions: [],
      deferredReasons: deferred.map(entry => `${entry.title}：${entry.unresolved}`),
      scopeNotes: unique([...structure.notes, ...deferred.map(entry => entry.currentTreatment)]),
    }
    const recipe = structure.guardRecipe
    const stages = recipe.stages.map(stage => {
      const constraints = getGuardPassiveCalculationConstraints(recipe.operatorId,
        { kind: stage.kind, skillIndex: recipe.skillIndex, stageId: stage.id })
      return {
        stage,
        blocked: Boolean(stage.unresolved?.length) || constraints.some(constraint => !constraint.supportedCondition),
        conditions: constraints.flatMap(constraint => constraint.supportedCondition ? [constraint.supportedCondition] : []),
        reasons: [...(stage.unresolved ?? []), ...constraints.map(constraint => constraint.reason)],
      }
    })
    const available = stages.filter(stage => !stage.blocked)
    const partialStages = available.length > 0 && available.length < stages.length
    const conditional = partialStages || available.some(stage => stage.conditions.length > 0)
    const status: DamageCalculatorThreeCoverageStatus = !available.length ? 'PENDING' : conditional ? 'CONDITIONAL' : 'SUPPORTED'
    return {
      skill, selection, status,
      calculationScope: unique(available.map(({ stage }) => guardStageScope(stage))),
      supportedConditions: unique([
        ...(partialStages ? [`計算する段階：${available.map(({ stage }) => stageLabel(recipe, stage)).join('、')}`] : []),
        ...available.flatMap(stage => stage.conditions),
      ]),
      deferredReasons: unique(stages.flatMap(({ stage, reasons }) => reasons.map(reason =>
        stages.length > 1 ? `${stageLabel(recipe, stage)}：${reason}` : reason))),
      scopeNotes: unique([...(recipe.notes ?? []), ...recipe.stages.flatMap(stage => stage.notes ?? [])]),
    }
  }).map(row => addSectionCoverage(row, structures.get(identity(row.skill))))
}

function addSectionCoverage(row: CoverageSummary, structure: SkillStructure | undefined): DamageCalculatorThreeCoverageRow {
  const skill = row.skill
  const phaseIndex = structure ? getExpandedDefinition(skill.operatorId)?.phaseIndex ?? 2 : Math.max(0, skill.operatorProfile.phases.length - 1)
  const sources = getOperatorPassives(skill.operatorProfile, phaseIndex,
    skill.operatorProfile.phases[phaseIndex]?.maxLevel ?? 1, 1).sources
  const registeredNames = structure?.guardRecipe ? getGuardRegisteredTalentNames(skill.operatorId) : []
  const registeredTalents = structure && !structure.guardRecipe ? describeRegisteredTalentEffects([skill]) : []
  const talentNames = new Map(sources.flatMap(source => source.sourceKind === 'TALENT' && source.talentIndex !== null
    && (source.description.trim() || (source.sourceName.trim() && source.sourceName !== '名称なし'))
    ? [[source.talentIndex, source.sourceName] as const] : []))
  registeredNames.forEach((name, index) => talentNames.set(index, name))
  for (const talent of registeredTalents) talentNames.set(talent.talentIndex, talent.talentName)
  const details: DamageCalculatorThreeCoverageDetail[] = [
    { id: 'skill', label: 'スキル', name: skill.skillName, status: structure ? 'SUPPORTED' : 'UNSUPPORTED' },
    ...[...talentNames].sort(([a], [b]) => a - b).map(([index, name]) => ({
      id: `talent-${index + 1}`, label: `素質${index + 1}`, name,
      status: (structure ? 'SUPPORTED' : 'UNSUPPORTED') as DamageCalculatorThreeCoverageSectionStatus,
    })),
    { id: 'trait', label: '特性', name: skill.subProfessionName || '基本特性', status: structure ? 'SUPPORTED' : 'UNSUPPORTED' },
  ]
  if (!talentNames.size) details.splice(1, 0, { id: 'talent-none', label: '素質', name: 'なし', status: 'NOT_APPLICABLE' })

  const issues: DamageCalculatorThreeCoverageIssue[] = []
  const recipe = structure?.guardRecipe
  if (recipe) {
    const values = resolveGuardConditions(mergeGuardInputs(getGuardPassiveInputs(skill.operatorId), recipe.inputs), {}).values
    const stageResults = recipe.stages.map(stage => {
      const conditions: GuardConditions = { ...values, ...conditionsForStage(stage) }
      const context = { kind: stage.kind, skillIndex: recipe.skillIndex, stageId: stage.id, stage }
      const evaluations = describeGuardPassiveEffects(skill, conditions, context)
      const constraints = getGuardPassiveCalculationConstraints(skill.operatorId, context)
      // Older external recipes can still supply unresolved strings. Reviewed recipes
      // carry stable IDs so cross-source issues can be merged without text matching.
      const stageIssues: readonly GuardCalculationIssue[] = stage.calculationIssues ?? (stage.unresolved ?? []).map((reason, index) => ({
        id: `${skill.operatorId}-s${skill.skillIndex}-${stage.id}-unresolved-${index}`, reason, relatedSections: ['スキル'],
      }))
      for (const issue of [...stageIssues, ...constraints]) {
        const condition = 'supportedCondition' in issue ? issue.supportedCondition : undefined
        appendIssue(issues, { id: issue.id, relatedSections: issue.relatedSections, impact: 'BLOCKING', reason: issue.reason,
          ...(recipe.stages.length > 1 ? { stages: [stageLabel(recipe, stage)] } : {}),
          ...(typeof condition === 'string' ? { supportedCondition: condition } : {}) })
      }
      return details.map(detail => {
        let status: DamageCalculatorThreeCoverageSectionStatus = detail.status
        if (detail.id !== 'skill' && detail.id !== 'talent-none') {
          const results = evaluations.filter(value => value.source === (detail.id === 'trait' ? '特性' : detail.name))
          // Invalid live sources are calculator errors, not proof that a registered
          // effect is unsupported or absent. Only explicit exclusions establish N/A.
          status = results.length > 0 && results.every(value => !value.relevant) ? 'NOT_APPLICABLE' : 'SUPPORTED'
          if (detail.id === 'trait' && getExpandedDefinition(skill.operatorId)) status = getExpandedTraitCoverage(skill.operatorId, stage)
          else if (detail.id === 'trait') {
            try {
              // Coverage reads the registered skill, independently of live source availability.
              const board = new Map(structure.source.blackboard.flatMap(entry =>
                entry.key && typeof entry.value === 'number' ? [[entry.key.toLowerCase(), entry.value] as const] : []))
              const trait = buildTraitStructures([skill])[0]
              const evaluated = evaluateGuardTraits(skill, stage, { actualAttackTargetCount: 1, ...conditions }, board,
                { phaseIndex: 2, operatorLevel: skill.operatorProfile.phases[2]?.maxLevel ?? 90 }).evaluation
              const relevant = evaluated.evaluations.filter(row => trait?.effects.some(effect => effect.id === row.effectId
                && effect.calculationRelevance !== 'NOT_RELEVANT' && !['NORMAL_ATTACK_ENABLED', 'RANGED_ATTACK_ENABLED', 'ATTACK_RANGE'].includes(effect.item)
                && effect.operation !== 'RESET_SOURCE_VALUE'))
              status = !trait || evaluated.blockers.length ? 'UNSUPPORTED'
                : relevant.some(row => row.status === 'APPLIED' || row.status === 'CONDITION_FALSE') ? 'SUPPORTED' : 'NOT_APPLICABLE'
            } catch { status = 'UNSUPPORTED' }
          }
          if (detail.id.startsWith('talent-') && !registeredNames[Number(detail.id.slice('talent-'.length)) - 1]) status = 'UNSUPPORTED'
        }
        const relevantStageIssues = stageIssues.filter(issue => issue.relatedSections.some(section => section === detail.label))
        const relevantConstraints = constraints.filter(issue => issue.relatedSections.some(section => section === detail.label))
        if (relevantStageIssues.length || relevantConstraints.some(issue => !issue.supportedCondition)) status = 'PENDING'
        else if (relevantConstraints.length) status = 'CONDITIONAL'
        return status
      })
    })
    details.forEach((detail, index) => {
      details[index] = { ...detail, status: combineAlternativeStages(stageResults.map(stage => stage[index])) }
    })
  } else if (structure) {
    const stages = structure.effectStructure.stages.map(stage => ({ stage, kind: legacyAttackKind(stage) }))
    details.forEach((detail, index) => {
      if (!detail.id.startsWith('talent-') || detail.id === 'talent-none') return
      const talentIndex = Number(detail.id.slice('talent-'.length)) - 1
      const relevant = registeredTalents.find(talent => talent.talentIndex === talentIndex)?.items ?? []
      details[index] = { ...detail, status: !registeredTalents.some(talent => talent.talentIndex === talentIndex) ? 'UNSUPPORTED'
        : relevant.length > 0 && relevant.every(item => !isDamageCalculatorThreeTalentItemRelevant(item)) ? 'NOT_APPLICABLE' : 'SUPPORTED' }
    })
    const trait = buildTraitStructures([skill])[0]
    const traitUsed = Boolean(trait?.effects.some(effect => effect.item === 'ATTACK_SCALE'
      || (['HIT_COUNT', 'DAMAGE_TYPE'].includes(effect.item)
        && stages.some(({ stage }) => !stage.effects.some(effect => effect.item === 'DIRECT_DAMAGE')))))
    const traitIndex = details.findIndex(detail => detail.id === 'trait')
    details[traitIndex] = { ...details[traitIndex], status: traitUsed ? 'SUPPORTED' : 'NOT_APPLICABLE' }
  }
  if (row.selection) for (const deferred of getSkillStructureDeferredCases(row.selection)) appendIssue(issues, {
    id: deferred.id, reason: `${deferred.title}：${deferred.unresolved}`,
    relatedSections: deferred.relatedSections ?? ['スキル'], impact: 'OUTSIDE_SCOPE', currentTreatment: deferred.currentTreatment,
  })
  return { ...row, details, issues: issues.map(issue => ({ ...issue,
    reason: issue.stages?.length ? `${issue.stages.join('・')}：${issue.reason}` : issue.reason })), sections: {
    skill: details.find(detail => detail.id === 'skill')!.status,
    talent: combineRequiredEffects(details.filter(detail => detail.id.startsWith('talent-')).map(detail => detail.status)),
    trait: details.find(detail => detail.id === 'trait')!.status,
  } }
}

function conditionsForStage(stage: GuardStage): GuardConditions {
  if (!stage.when) return {}
  const { input, value, comparison } = stage.when
  return { [input]: typeof value === 'number' && comparison === 'GT' ? value + 1
    : typeof value === 'number' && comparison === 'LT' ? value - 1 : value }
}

function combineAlternativeStages(statuses: readonly DamageCalculatorThreeCoverageSectionStatus[]): DamageCalculatorThreeCoverageSectionStatus {
  const applicable = statuses.filter(status => status !== 'NOT_APPLICABLE')
  if (!applicable.length) return 'NOT_APPLICABLE'
  const usable = applicable.some(status => status === 'SUPPORTED' || status === 'CONDITIONAL')
  if (usable && applicable.some(status => status === 'PENDING' || status === 'UNSUPPORTED')) return 'CONDITIONAL'
  return combineRequiredEffects(applicable)
}

function combineRequiredEffects(statuses: readonly DamageCalculatorThreeCoverageSectionStatus[]): DamageCalculatorThreeCoverageSectionStatus {
  for (const status of ['PENDING', 'UNSUPPORTED', 'CONDITIONAL', 'SUPPORTED'] as const) if (statuses.includes(status)) return status
  return 'NOT_APPLICABLE'
}

function appendIssue(issues: DamageCalculatorThreeCoverageIssue[], issue: DamageCalculatorThreeCoverageIssue): void {
  const index = issues.findIndex(existing => existing.id === issue.id)
  if (index < 0) { issues.push(issue); return }
  const previous = issues[index]
  issues[index] = { ...previous, relatedSections: unique([...previous.relatedSections, ...issue.relatedSections]),
    ...(previous.stages || issue.stages ? { stages: unique([...(previous.stages ?? []), ...(issue.stages ?? [])]) } : {}) }
}

function legacyAttackKind(stage: SkillStructureStage): 'NORMAL' | 'NEXT_ATTACK' | 'COUNTER' | 'SKILL_ACTION' {
  return stage.effects.some(effect => effect.item === 'TRIGGERED_ATTACK') ? 'COUNTER'
    : stage.duration.type === 'SINGLE_ATTACK' ? 'NEXT_ATTACK' : stage.duration.type === 'SKILL_ACTION' ? 'SKILL_ACTION' : 'NORMAL'
}

function stageLabel(recipe: GuardSkillRecipe, stage: GuardStage): string {
  if (!stage.when) return stage.label
  const input = recipe.inputs.find(input => input.key === stage.when!.input)
  return input?.options?.find(option => option.value === stage.when!.value)?.label ?? stage.label
}

function guardStageScope(stage: GuardStage): string {
  const scope = stage.kind === 'NEXT_ATTACK' ? '強化攻撃1回'
    : stage.kind === 'SKILL_ACTION' ? '発動・命中1回' : '1攻撃・攻撃中DPS'
  return `${stage.label}：${scope}`
}

function legacyStageScope(stage: SkillStructureStage): string {
  const scope = stage.effects.some(effect => effect.item === 'TRIGGERED_ATTACK') ? '反撃1回'
    : stage.duration.type === 'SINGLE_ATTACK' ? '強化攻撃1回'
      : stage.duration.type === 'SKILL_ACTION' ? 'スキル発動1回' : '1攻撃・攻撃中DPS'
  return `${stage.label}：${scope}`
}
