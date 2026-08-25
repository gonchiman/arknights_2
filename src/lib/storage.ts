import type { SkillCategory } from '../types/skill'

const KEY = 'arknights-skill-analyzer-overrides'

export type SkillOverrides = Record<string, SkillCategory>

export function loadOverrides(): SkillOverrides {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as SkillOverrides
  } catch {
    return {}
  }
}

export function saveOverrides(overrides: SkillOverrides) {
  localStorage.setItem(KEY, JSON.stringify(overrides))
}
