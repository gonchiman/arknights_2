export type AppRoute =
  | { view: 'list' }
  | { view: 'skills' }
  | { view: 'skill'; skillId: string }
  | { view: 'damage' }
  | { view: 'comparison' }
  | { view: 'enemies' }

const SKILL_ROUTE_PREFIX = '#/skills/'

export function parseHashRoute(hash: string): AppRoute {
  if (hash === '#/damage') return { view: 'damage' }
  if (hash === '#/comparison') return { view: 'comparison' }
  if (hash === '#/enemies') return { view: 'enemies' }
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
