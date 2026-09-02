export type AppRoute =
  | { view: 'skills' }
  | { view: 'operators' }
  | { view: 'damage' }
  | { view: 'comparison' }
  | { view: 'enemies' }
  | { view: 'sources' }

const LEGACY_CLASSIFIER_SKILL_ROUTE_PREFIX = '#/skills/'
const OPERATOR_SKILL_ROUTE_PREFIX = '#/operators/skills/'

export function parseHashRoute(hash: string): AppRoute {
  if (
    hash.startsWith(OPERATOR_SKILL_ROUTE_PREFIX)
    || hash.startsWith(LEGACY_CLASSIFIER_SKILL_ROUTE_PREFIX)
  ) {
    return { view: 'operators' }
  }
  if (hash === '#/operators') return { view: 'operators' }
  if (hash === '#/damage') return { view: 'damage' }
  if (hash === '#/comparison') return { view: 'comparison' }
  if (hash === '#/enemies') return { view: 'enemies' }
  if (hash === '#/sources') return { view: 'sources' }
  if (hash === '#/skills') return { view: 'skills' }
  return { view: 'operators' }
}
