export type AppRoute =
  | { view: 'skills' }
  | { view: 'skill-effects'; selection?: SkillEffectsRouteSelection }
  | { view: 'operators' }
  | { view: 'operator-detail'; operatorId: string }
  | { view: 'skill-json'; selection?: SkillJsonRouteSelection }
  | { view: 'skill-json-overview' }
  | { view: 'damage' }
  | { view: 'comparison' }
  | { view: 'enemies' }
  | { view: 'sources' }

const LEGACY_CLASSIFIER_SKILL_ROUTE_PREFIX = '#/skills/'
const OPERATOR_SKILL_ROUTE_PREFIX = '#/operators/skills/'
const OPERATOR_DETAIL_ROUTE_PREFIX = '#/operators/'
const SKILL_JSON_ROUTE = '#/skill-json'
const SKILL_EFFECTS_ROUTE = '#/skill-effects'

export interface SkillRouteSelection {
  operatorId: string
  skillIndex: number
  skillId: string
  levelIndex: number
}

export type SkillJsonRouteSelection = SkillRouteSelection
export type SkillEffectsRouteSelection = SkillRouteSelection

export function createOperatorDetailHash(operatorId: string): string {
  return `${OPERATOR_DETAIL_ROUTE_PREFIX}${encodeURIComponent(operatorId)}`
}

export function createSkillJsonHash(selection: SkillJsonRouteSelection): string {
  return createSkillSelectionHash(SKILL_JSON_ROUTE, selection)
}

export function createSkillEffectsHash(selection: SkillEffectsRouteSelection): string {
  return createSkillSelectionHash(SKILL_EFFECTS_ROUTE, selection)
}

function createSkillSelectionHash(route: string, selection: SkillRouteSelection): string {
  assertRouteId(selection.operatorId, 'operatorId')
  assertRouteId(selection.skillId, 'skillId')
  assertInteger(selection.skillIndex, 1, 'skillIndex')
  assertInteger(selection.levelIndex, 0, 'levelIndex')

  const query = new URLSearchParams({
    operatorId: selection.operatorId,
    skillIndex: String(selection.skillIndex),
    skillId: selection.skillId,
    levelIndex: String(selection.levelIndex),
  })
  return `${route}?${query.toString()}`
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
  if (hash === '#/skill-json/overview') return { view: 'skill-json-overview' }
  if (hash === SKILL_EFFECTS_ROUTE) return { view: 'skill-effects' }
  if (hash.startsWith(`${SKILL_EFFECTS_ROUTE}?`)) {
    return parseSkillSelectionRoute('skill-effects', hash.slice(SKILL_EFFECTS_ROUTE.length + 1))
  }
  if (hash === SKILL_JSON_ROUTE) return { view: 'skill-json' }
  if (hash.startsWith(`${SKILL_JSON_ROUTE}?`)) {
    return parseSkillSelectionRoute('skill-json', hash.slice(SKILL_JSON_ROUTE.length + 1))
  }
  if (hash === '#/damage') return { view: 'damage' }
  if (hash === '#/comparison') return { view: 'comparison' }
  if (hash === '#/enemies') return { view: 'enemies' }
  if (hash === '#/sources') return { view: 'sources' }
  if (hash === '#/skills') return { view: 'skills' }
  return { view: 'operators' }
}

function parseSkillSelectionRoute(view: 'skill-json' | 'skill-effects', query: string): AppRoute {
  const params = new URLSearchParams(query)
  const operatorId = readRouteId(params, 'operatorId')
  const skillId = readRouteId(params, 'skillId')
  const skillIndex = readInteger(params, 'skillIndex', 1)
  const levelIndex = readInteger(params, 'levelIndex', 0)

  if (operatorId === null || skillId === null || skillIndex === null || levelIndex === null) {
    return { view }
  }

  return {
    view,
    selection: { operatorId, skillIndex, skillId, levelIndex },
  }
}

function readRouteId(params: URLSearchParams, key: 'operatorId' | 'skillId'): string | null {
  const values = params.getAll(key)
  if (values.length !== 1 || !isValidRouteId(values[0])) return null
  return values[0]
}

function readInteger(
  params: URLSearchParams,
  key: 'skillIndex' | 'levelIndex',
  minimum: number,
): number | null {
  const values = params.getAll(key)
  if (values.length !== 1 || !/^(0|[1-9]\d*)$/.test(values[0])) return null
  const value = Number(values[0])
  return Number.isSafeInteger(value) && value >= minimum ? value : null
}

function assertRouteId(value: string, name: string): void {
  if (!isValidRouteId(value)) throw new TypeError(`${name} must be a non-empty ID`)
}

function assertInteger(value: number, minimum: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be an integer greater than or equal to ${minimum}`)
  }
}

function isValidRouteId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && value.trim() === value
    && !/[\u0000-\u001f\u007f\ufffd]/.test(value)
}
