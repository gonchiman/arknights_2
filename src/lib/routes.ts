export type AppRoute =
  | { view: 'skills' }
  | { view: 'operators' }
  | { view: 'operator-detail'; operatorId: string }
  | { view: 'damage' }
  | { view: 'comparison' }
  | { view: 'enemies' }
  | { view: 'sources' }

const LEGACY_CLASSIFIER_SKILL_ROUTE_PREFIX = '#/skills/'
const OPERATOR_SKILL_ROUTE_PREFIX = '#/operators/skills/'
const OPERATOR_DETAIL_ROUTE_PREFIX = '#/operators/'

export function createOperatorDetailHash(operatorId: string): string {
  return `${OPERATOR_DETAIL_ROUTE_PREFIX}${encodeURIComponent(operatorId)}`
}

export function parseHashRoute(hash: string): AppRoute {
  if (
    hash.startsWith(OPERATOR_SKILL_ROUTE_PREFIX)
    || hash.startsWith(LEGACY_CLASSIFIER_SKILL_ROUTE_PREFIX)
  ) {
    return { view: 'operators' }
  }
  if (hash === '#/operators') return { view: 'operators' }
  if (hash.startsWith(OPERATOR_DETAIL_ROUTE_PREFIX)) {
    const encodedOperatorId = hash.slice(OPERATOR_DETAIL_ROUTE_PREFIX.length)
    if (!encodedOperatorId || encodedOperatorId.includes('/')) return { view: 'operators' }

    try {
      const operatorId = decodeURIComponent(encodedOperatorId)
      return operatorId ? { view: 'operator-detail', operatorId } : { view: 'operators' }
    } catch {
      return { view: 'operators' }
    }
  }
  if (hash === '#/damage') return { view: 'damage' }
  if (hash === '#/comparison') return { view: 'comparison' }
  if (hash === '#/enemies') return { view: 'enemies' }
  if (hash === '#/sources') return { view: 'sources' }
  if (hash === '#/skills') return { view: 'skills' }
  return { view: 'operators' }
}
