import type { SkillCoarseCategory } from './skillCoarseClassification.ts'
import type { SkillStructure, SkillStructureEffect, SkillStructureSelection } from './skillStructure.ts'
import type { GuardSkillRecipe, GuardSource, GuardValue } from './guardCombatTypes.ts'
import { GUARD_SKILL_RECIPES } from './guardSkillRecipes.ts'
import { GUARD_SKILL_SOURCES } from './guardSkillSources.ts'
import { resolveGuardValue } from './guardCombatValues.ts'
import { expandSkillDescription } from './skillJsonAnalysis.ts'

export function getGuardSkillRecipe(selection: Pick<SkillStructureSelection, 'operatorId' | 'skillIndex' | 'levelIndex'>): GuardSkillRecipe | null {
  return selection.levelIndex === 9 ? GUARD_SKILL_RECIPES.find(recipe => recipe.operatorId === selection.operatorId
    && recipe.skillIndex === selection.skillIndex) ?? null : null
}

export function buildGuardSkillStructures(recipes: readonly GuardSkillRecipe[] = GUARD_SKILL_RECIPES,
  sources: readonly GuardSource[] = GUARD_SKILL_SOURCES, levelIndex = 9): SkillStructure[] {
  return recipes.map(recipe => {
    const source = sources.find(operator => operator.id === recipe.operatorId)
    const skill = source?.skills.find(skill => skill.skillIndex === recipe.skillIndex)
    if (!source || !skill) throw new RangeError(`スキル説明文を取得できません：${recipe.operatorId} S${recipe.skillIndex}`)
    const raw = skill.raw
    const board = new Map((raw.blackboard ?? []).flatMap(entry => typeof entry.value === 'number' && entry.key
      ? [[entry.key.toLowerCase(), entry.value] as const] : []))
    const defaults = Object.fromEntries(recipe.inputs.map(input => [input.key, input.defaultValue]))
    const preview = (value: GuardValue | undefined, fallback = 0) => {
      if (value === undefined) return fallback
      try { return resolveGuardValue(value, board, { actualAttackTargetCount: 1, ...defaults }) } catch { return fallback }
    }
    const categories: SkillCoarseCategory[] = []
    if (recipe.stages.some(stage => stage.kind === 'NEXT_ATTACK')) categories.push('NEXT_ATTACK')
    if (recipe.stages.some(stage => stage.kind === 'NORMAL')) categories.push('SUSTAINED')
    if (recipe.stages.some(stage => stage.kind === 'SKILL_ACTION')) categories.push('BURST')
    if (/切り替/.test(raw.description ?? '')) categories.push('MODE')
    if (/召喚/.test(raw.description ?? '')) categories.push('SUMMON')
    if (raw.skillType === 'PASSIVE') categories.push('PASSIVE')
    return {
      basicInfo: { operatorId: source.id, operatorName: source.name, skillIndex: skill.skillIndex, skillId: skill.skillId,
        levelIndex, skillLevel: levelIndex < 7 ? `Lv.${levelIndex + 1}` : `特化${levelIndex - 6}`, skillName: raw.name ?? skill.skillId },
      classificationInfo: { coarseCategories: categories },
      activationSettings: {
        spRecovery: (['INCREASE_WITH_TIME', 'INCREASE_WHEN_ATTACK', 'INCREASE_WHEN_TAKEN_DAMAGE', 'NO_SP'].includes(raw.spData?.spType ?? '')
          ? raw.spData!.spType : 'NO_SP') as SkillStructure['activationSettings']['spRecovery'],
        initialSp: raw.spData?.initSp ?? 0, spCost: raw.spData?.spCost ?? 0, maxCharges: raw.spData?.maxChargeTime ?? 1,
        activationMethod: raw.skillType === 'PASSIVE' ? 'PASSIVE' : raw.skillType === 'AUTO' ? 'AUTO' : 'MANUAL',
        activationTrigger: recipe.stages.some(stage => stage.kind === 'NEXT_ATTACK') ? 'NEXT_NORMAL_ATTACK'
          : raw.skillType === 'PASSIVE' ? 'ON_DEPLOY' : raw.skillType === 'AUTO' ? 'SP_FULL' : 'MANUAL_INPUT',
      },
      effectStructure: { stages: recipe.stages.map(stage => {
        const duration = stage.duration ?? raw.duration ?? 0
        const seconds = typeof duration === 'string' ? 0 : preview(duration)
        const timing = stage.kind === 'NEXT_ATTACK' ? 'ON_NEXT_NORMAL_ATTACK' as const
          : stage.kind === 'SKILL_ACTION' ? 'ON_STAGE_ENTER' as const : 'WHILE_STAGE_ACTIVE' as const
        const effects: SkillStructureEffect[] = []
        for (const [key, item, operation, unit] of [
          ['atk', 'ATK_BUFF_RATIO', 'ADD_RATIO', 'RATIO'], ['aspd', 'ATTACK_SPEED', 'ADD_VALUE', 'POINT'],
        ] as const) if (stage[key] !== undefined) effects.push({ id: `${stage.id}-${key}`, timing: 'WHILE_STAGE_ACTIVE',
          condition: null, target: 'SELF', sourceBinding: JSON.stringify(stage[key]), item, operation,
          unit, value: preview(stage[key]) } as SkillStructureEffect)
        stage.actions.forEach((action, index) => effects.push({ id: `${stage.id}-attack-${index}`, timing,
          condition: null, target: 'ENEMIES_IN_ACTION_RANGE', sourceBinding: JSON.stringify(action.scale),
          item: 'DIRECT_DAMAGE', operation: 'DEAL_DAMAGE', unit: 'DAMAGE_ACTION',
          value: { damageType: action.damageType, attackScale: preview(action.scale), count: preview(action.hits, 1) } }))
        return { id: stage.id, label: stage.label, applicability: null,
          duration: stage.kind === 'NEXT_ATTACK' ? { type: 'SINGLE_ATTACK' as const }
            : stage.kind === 'SKILL_ACTION' ? { type: 'SKILL_ACTION' as const }
              : duration === 'UNTIL_EXIT' || seconds < 0 ? { type: 'UNTIL_EXIT' as const }
                : { type: 'FIXED_SECONDS' as const, seconds },
          endCondition: stage.kind === 'NEXT_ATTACK' || stage.kind === 'SKILL_ACTION' ? { type: 'ATTACK_RESOLVED' as const }
            : duration === 'UNTIL_EXIT' || seconds < 0 ? { type: 'OPERATOR_EXIT' as const }
              : { type: 'SECONDS_ELAPSED' as const, seconds }, effects }
      }) },
      source: { description: expandSkillDescription(raw.description ?? '', raw.blackboard ?? []).replace(/<[^>]+>/g, '').replace(/\\n/g, '\n'),
        rawDescription: raw.description ?? '', blackboard: (raw.blackboard ?? []).flatMap(entry => entry.key && typeof entry.value === 'number'
          ? [{ key: entry.key, value: entry.value, valueStr: entry.valueStr ?? null }] : []),
        rangeId: raw.rangeId ?? null, duration: raw.duration ?? 0 },
      notes: [...(recipe.notes ?? []), ...recipe.stages.flatMap(stage => [...(stage.notes ?? []), ...(stage.unresolved ?? [])])],
      guardRecipe: recipe,
    }
  })
}
