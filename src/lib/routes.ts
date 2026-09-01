export type AppRoute =
  | { view: 'list' }
  | { view: 'skills' }
  | { view: 'operators' }
  | { view: 'operatorSkill'; skillId: string }
  | { view: 'skill'; skillId: string }
  | { view: 'damage' }
  | { view: 'comparison' }
  | { view: 'enemies' }
  | { view: 'sources' }

const SKILL_ROUTE_PREFIX = '#/skills/'
const OPERATOR_SKILL_ROUTE_PREFIX = '#/operators/skills/'

export function parseHashRoute(hash: string): AppRoute {
  if (hash.startsWith(OPERATOR_SKILL_ROUTE_PREFIX)) {
    try {
      const skillId = decodeURIComponent(hash.slice(OPERATOR_SKILL_ROUTE_PREFIX.length))
      return skillId ? { view: 'operatorSkill', skillId } : { view: 'operators' }
    } catch {
      return { view: 'operators' }
    }
  }
  if (hash === '#/operators') return { view: 'operators' }
  if (hash === '#/damage') return { view: 'damage' }
  if (hash === '#/comparison') return { view: 'comparison' }
  if (hash === '#/enemies') return { view: 'enemies' }
  if (hash === '#/sources') return { view: 'sources' }
  if (hash === '#/skills') return { view: 'skills' }
  if (!hash.startsWith(SKILL_ROUTE_PREFIX)) return { view: 'list' }

  try {
    const skillId = decodeURIComponent(hash.slice(SKILL_ROUTE_PREFIX.length))
    return skillId ? { view: 'skill', skillId } : { view: 'list' }
  } catch {
    return { view: 'list' }
  }
}

export function getSkillRouteHash(skillId: string): string {
  return `${SKILL_ROUTE_PREFIX}${encodeURIComponent(skillId)}`
}

export function getOperatorSkillRouteHash(skillId: string): string {
  return `${OPERATOR_SKILL_ROUTE_PREFIX}${encodeURIComponent(skillId)}`
}
