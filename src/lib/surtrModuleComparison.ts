import type { OperatorCombatProfile } from '../types/skill.ts'
import {
  getOperatorModuleId, getOperatorModuleLevels, getOperatorModules, isOperatorModuleUnlocked,
} from './operatorModules.ts'
import { getModuleComparisonColors } from './moduleColors.ts'
import type { SurtrDpsLineStyle } from './surtrDpsOutput.ts'

export interface SurtrModuleChoice {
  id: string
  type: 'X' | 'Y' | null
  label: string
  levels: number[]
  unlocked: boolean
}

export interface SelectedSurtrModuleStage {
  moduleId: string
  id: string
  type: SurtrModuleChoice['type']
  label: string
  level: number
  lineStyle: SurtrDpsLineStyle
  color: string
}

/** Surtr's analysis pages share the same final-promotion module choices and unlock rules. */
export function getSurtrModuleChoices(
  profile: Pick<OperatorCombatProfile, 'modules'> | null | undefined,
  level: number,
): SurtrModuleChoice[] {
  return [
    { id: '', type: null, label: '未装備', levels: [], unlocked: true },
    ...getOperatorModules(profile ?? {}).flatMap((module, index): SurtrModuleChoice[] => {
      const type = module.typeName2?.trim().toUpperCase()
      if (type !== 'X' && type !== 'Y') return []
      return [{ id: getOperatorModuleId(module, index), type, label: `MOD ${type}`,
        levels: getOperatorModuleLevels(module), unlocked: isOperatorModuleUnlocked(module, 2, level) }]
    }),
  ]
}

/** Preserve the selected stage order, default maximum stage, and stable chart identities. */
export function getSelectedSurtrModuleStages(
  choices: readonly SurtrModuleChoice[],
  excluded: readonly string[] = [],
  moduleLevels: Readonly<Record<string, readonly number[]>> = {},
): SelectedSurtrModuleStage[] {
  const selected = choices.filter(choice => choice.unlocked && !excluded.includes(choice.id)).flatMap(choice => {
    const levels = choice.id
      ? choice.levels.filter(level => (moduleLevels[choice.id] ?? [choice.levels.at(-1) ?? 3]).includes(level))
      : [0]
    return levels.map(level => ({
      moduleId: choice.id,
      id: choice.id ? `${choice.id}:lv${level}` : 'none',
      type: choice.type,
      label: choice.id ? `${choice.label} Lv.${level}` : choice.label,
      level,
      lineStyle: (level === 1 ? 'dotted' : level === 2 ? 'dashed' : 'solid') as SurtrDpsLineStyle,
    }))
  })
  const colors = getModuleComparisonColors(selected.map(choice => ({ moduleType: choice.type, moduleLevel: choice.level })),
    { shadeBy: 'moduleLevel' })
  return selected.map((choice, index) => ({ ...choice, color: colors[index] }))
}
