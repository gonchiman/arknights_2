export type OperatorDetailSource = 'goldenglow-home' | 'surtr-home' | 'damage-three'

export type AppRoute =
  | { view: 'home' }
  | { view: 'skills' }
  | { view: 'skill-classification' }
  | { view: 'skill-kmeans' }
  | { view: 'skill-hdbscan' }
  | { view: 'skill-hierarchical' }
  | { view: 'talent-classification' }
  | { view: 'trait-classification' }
  | { view: 'trait-structure'; selection?: TraitRouteSelection; invalidSelection?: boolean }
  | { view: 'talent-structure'; selection?: TalentRouteSelection; invalidSelection?: boolean }
  | { view: 'skill-effects'; selection?: SkillEffectsRouteSelection }
  | { view: 'skill-summary'; selection?: SkillRouteSelection }
  | { view: 'skill-structure'; selection?: SkillRouteSelection }
  | { view: 'operators' }
  | { view: 'operator-pca' }
  | { view: 'operator-detail'; operatorId: string; source?: OperatorDetailSource }
  | { view: 'skill-json'; selection?: SkillJsonRouteSelection }
  | { view: 'skill-json-overview' }
  | { view: 'code-analysis' }
  | { view: 'damage' }
  | { view: 'damage-two' }
  | { view: 'damage-three'; selection?: SkillRouteSelection }
  | { view: 'damage-three-coverage' }
  | { view: 'damage-three-comparison' }
  | { view: 'damage-verification' }
  | { view: 'goldenglow-home' }
  | { view: 'surtr-home' }
  | { view: 'surtr-s3' }
  | { view: 'surtr-s3-comparison' }
  | { view: 'surtr-skill-comparison' }
  | { view: 'surtr-total-damage' }
  | { view: 'surtr-duration' }
  | { view: 'surtr-remnant-attacks' }
  | { view: 'goldenglow-guide' }
  | { view: 'goldenglow-performance' }
  | { view: 'goldenglow-target-switch' }
  | { view: 'goldenglow-target-switch-two' }
  | { view: 'goldenglow-target-switch-three' }
  | { view: 'goldenglow-single-trial' }
  | { view: 'goldenglow-trial-benchmark' }
  | { view: 'comparison' }
  | { view: 'enemies' }
  | { view: 'enemy-analysis' }
  | { view: 'enemy-regression' }
  | { view: 'enemy-map-coverage' }
  | { view: 'main-enemy-trends' }
  | { view: 'maps' }
  | { view: 'roguelike' }
  | { view: 'sources' }
  | { view: 'slide-maker' }

const LEGACY_CLASSIFIER_SKILL_ROUTE_PREFIX = '#/skills/'
const OPERATOR_SKILL_ROUTE_PREFIX = '#/operators/skills/'
const OPERATOR_DETAIL_ROUTE_PREFIX = '#/operators/'
const SKILL_JSON_ROUTE = '#/skill-json'
const SKILL_EFFECTS_ROUTE = '#/skill-effects'
const SKILL_SUMMARY_ROUTE = '#/skill-summary'
const SKILL_STRUCTURE_ROUTE = '#/skill-structure'
const TALENT_STRUCTURE_ROUTE = '#/talent-structure'
const TRAIT_STRUCTURE_ROUTE = '#/trait-structure'
const DAMAGE_THREE_ROUTE = '#/damage-3'

export interface TraitRouteSelection {
  operatorId: string
}

export interface TalentRouteSelection {
  operatorId: string
  talentIndex: number
}

export interface SkillRouteSelection {
  operatorId: string
  skillIndex: number
  skillId: string
  levelIndex: number
}

export type SkillJsonRouteSelection = SkillRouteSelection
export type SkillEffectsRouteSelection = SkillRouteSelection

export function createOperatorDetailHash(
  operatorId: string,
  options?: { source?: OperatorDetailSource },
): string {
  const sourceQuery = options?.source === 'goldenglow-home' ? '?from=goldenglow'
    : options?.source === 'surtr-home' ? '?from=surtr'
      : options?.source === 'damage-three' ? '?from=damage-3' : ''
  return `${OPERATOR_DETAIL_ROUTE_PREFIX}${encodeURIComponent(operatorId)}${sourceQuery}`
}

export function createSkillJsonHash(selection: SkillJsonRouteSelection): string {
  return createSkillSelectionHash(SKILL_JSON_ROUTE, selection)
}

export function createSkillEffectsHash(selection: SkillEffectsRouteSelection): string {
  return createSkillSelectionHash(SKILL_EFFECTS_ROUTE, selection)
}

export function createSkillSummaryHash(selection: SkillRouteSelection): string {
  return createSkillSelectionHash(SKILL_SUMMARY_ROUTE, selection)
}

export function createSkillStructureHash(selection: SkillRouteSelection): string {
  return createSkillSelectionHash(SKILL_STRUCTURE_ROUTE, selection)
}

export function createDamageCalculatorThreeHash(selection?: SkillRouteSelection): string {
  return selection ? createSkillSelectionHash(DAMAGE_THREE_ROUTE, selection) : DAMAGE_THREE_ROUTE
}

export function createTalentStructureHash(selection: TalentRouteSelection): string {
  assertRouteId(selection.operatorId, 'operatorId')
  assertInteger(selection.talentIndex, 0, 'talentIndex')
  const query = new URLSearchParams({ operatorId: selection.operatorId, talentIndex: String(selection.talentIndex) })
  return `${TALENT_STRUCTURE_ROUTE}?${query.toString()}`
}

export function createTraitStructureHash(selection: TraitRouteSelection): string {
  assertRouteId(selection.operatorId, 'operatorId')
  const query = new URLSearchParams({ operatorId: selection.operatorId })
  return `${TRAIT_STRUCTURE_ROUTE}?${query.toString()}`
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
  if (hash === '' || hash === '#' || hash === '#/') return { view: 'home' }
  if (hash === TRAIT_STRUCTURE_ROUTE) return { view: 'trait-structure' }
  if (hash.startsWith(`${TRAIT_STRUCTURE_ROUTE}?`)) {
    const params = new URLSearchParams(hash.slice(TRAIT_STRUCTURE_ROUTE.length + 1))
    if (!params.has('operatorId')) return { view: 'trait-structure' }
    const operatorId = readRouteId(params, 'operatorId')
    return operatorId === null
      ? { view: 'trait-structure', invalidSelection: true }
      : { view: 'trait-structure', selection: { operatorId } }
  }
  if (hash === TALENT_STRUCTURE_ROUTE) return { view: 'talent-structure' }
  if (hash.startsWith(`${TALENT_STRUCTURE_ROUTE}?`)) {
    const params = new URLSearchParams(hash.slice(TALENT_STRUCTURE_ROUTE.length + 1))
    if (!params.has('operatorId') && !params.has('talentIndex')) return { view: 'talent-structure' }
    const operatorId = readRouteId(params, 'operatorId')
    const talentIndex = readInteger(params, 'talentIndex', 0)
    return operatorId === null || talentIndex === null
      ? { view: 'talent-structure', invalidSelection: true }
      : { view: 'talent-structure', selection: { operatorId, talentIndex } }
  }
  if (
    hash.startsWith(OPERATOR_SKILL_ROUTE_PREFIX)
    || hash.startsWith(LEGACY_CLASSIFIER_SKILL_ROUTE_PREFIX)
  ) {
    return { view: 'operators' }
  }
  if (hash === '#/operators') return { view: 'operators' }
  if (hash.startsWith(OPERATOR_DETAIL_ROUTE_PREFIX)) {
    const detailPath = hash.slice(OPERATOR_DETAIL_ROUTE_PREFIX.length)
    const queryIndex = detailPath.indexOf('?')
    const encodedOperatorId = queryIndex < 0 ? detailPath : detailPath.slice(0, queryIndex)
    if (!encodedOperatorId || encodedOperatorId.includes('/')) return { view: 'operators' }

    try {
      const operatorId = decodeURIComponent(encodedOperatorId)
      if (!operatorId) return { view: 'operators' }

      const sources = new URLSearchParams(queryIndex < 0 ? '' : detailPath.slice(queryIndex + 1)).getAll('from')
      if (sources.length === 1) {
        if (sources[0] === 'goldenglow') return { view: 'operator-detail', operatorId, source: 'goldenglow-home' }
        if (sources[0] === 'surtr') return { view: 'operator-detail', operatorId, source: 'surtr-home' }
        if (sources[0] === 'damage-3') return { view: 'operator-detail', operatorId, source: 'damage-three' }
      }
      return { view: 'operator-detail', operatorId }
    } catch {
      return { view: 'operators' }
    }
  }
  if (hash === '#/skill-json/overview') return { view: 'skill-json-overview' }
  if (hash === SKILL_STRUCTURE_ROUTE) return { view: 'skill-structure' }
  if (hash.startsWith(`${SKILL_STRUCTURE_ROUTE}?`)) {
    return parseSkillSelectionRoute('skill-structure', hash.slice(SKILL_STRUCTURE_ROUTE.length + 1))
  }
  if (hash === SKILL_SUMMARY_ROUTE) return { view: 'skill-summary' }
  if (hash.startsWith(`${SKILL_SUMMARY_ROUTE}?`)) {
    return parseSkillSelectionRoute('skill-summary', hash.slice(SKILL_SUMMARY_ROUTE.length + 1))
  }
  if (hash === SKILL_EFFECTS_ROUTE) return { view: 'skill-effects' }
  if (hash.startsWith(`${SKILL_EFFECTS_ROUTE}?`)) {
    return parseSkillSelectionRoute('skill-effects', hash.slice(SKILL_EFFECTS_ROUTE.length + 1))
  }
  if (hash === SKILL_JSON_ROUTE) return { view: 'skill-json' }
  if (hash.startsWith(`${SKILL_JSON_ROUTE}?`)) {
    return parseSkillSelectionRoute('skill-json', hash.slice(SKILL_JSON_ROUTE.length + 1))
  }
  if (hash === '#/damage') return { view: 'damage' }
  if (hash === '#/damage-2') return { view: 'damage-two' }
  if (hash === '#/damage-3/coverage') return { view: 'damage-three-coverage' }
  if (hash === '#/damage-3/comparison') return { view: 'damage-three-comparison' }
  if (hash === DAMAGE_THREE_ROUTE) return { view: 'damage-three' }
  if (hash.startsWith(`${DAMAGE_THREE_ROUTE}?`)) {
    return parseSkillSelectionRoute('damage-three', hash.slice(DAMAGE_THREE_ROUTE.length + 1))
  }
  if (hash === '#/analysis/damage-verification') return { view: 'damage-verification' }
  if (hash === '#/analysis/code') return { view: 'code-analysis' }
  if (hash === '#/analysis/operators/pca') return { view: 'operator-pca' }
  if (hash === '#/analysis/skills/kmeans') return { view: 'skill-kmeans' }
  if (hash === '#/analysis/skills/hdbscan') return { view: 'skill-hdbscan' }
  if (hash === '#/analysis/skills/hierarchical') return { view: 'skill-hierarchical' }
  if (hash === '#/analysis/goldenglow') return { view: 'goldenglow-home' }
  if (hash === '#/analysis/surtr') return { view: 'surtr-home' }
  if (hash === '#/analysis/surtr/s3') return { view: 'surtr-s3' }
  if (hash === '#/analysis/surtr/s3-comparison') return { view: 'surtr-s3-comparison' }
  if (hash === '#/analysis/surtr/s2-s3-comparison') return { view: 'surtr-skill-comparison' }
  if (hash === '#/analysis/surtr/total-damage') return { view: 'surtr-total-damage' }
  if (hash === '#/analysis/surtr/duration') return { view: 'surtr-duration' }
  if (hash === '#/analysis/surtr/remnant-attacks') return { view: 'surtr-remnant-attacks' }
  if (hash === '#/analysis/goldenglow/performance') return { view: 'goldenglow-performance' }
  if (hash === '#/analysis/goldenglow/explosion') return { view: 'goldenglow-guide' }
  if (hash === '#/analysis/goldenglow/target-switch') return { view: 'goldenglow-target-switch' }
  if (hash === '#/analysis/goldenglow/target-switch-2') return { view: 'goldenglow-target-switch-two' }
  if (hash === '#/analysis/goldenglow/target-switch-3') return { view: 'goldenglow-target-switch-three' }
  if (hash === '#/analysis/goldenglow/single-trial') return { view: 'goldenglow-single-trial' }
  if (hash === '#/analysis/goldenglow/trial-benchmark') return { view: 'goldenglow-trial-benchmark' }
  if (hash === '#/guides/goldenglow-explosion') return { view: 'goldenglow-guide' }
  if (hash === '#/analysis/goldenglow-performance') return { view: 'goldenglow-performance' }
  if (hash === '#/analysis/goldenglow-target-switch') return { view: 'goldenglow-target-switch' }
  if (hash === '#/comparison') return { view: 'comparison' }
  if (hash === '#/enemies') return { view: 'enemies' }
  if (matchesEnemyAggregationRoute(hash, '#/analysis/enemies')) return { view: 'enemy-analysis' }
  if (hash === '#/analysis/enemies/regression') return { view: 'enemy-regression' }
  if (matchesEnemyAggregationRoute(hash, '#/analysis/enemies/maps')) return { view: 'enemy-map-coverage' }
  if (hash === '#/analysis/enemies/main-trends') return { view: 'main-enemy-trends' }
  if (hash === '#/maps') return { view: 'maps' }
  if (hash === '#/roguelike') return { view: 'roguelike' }
  if (hash === '#/sources') return { view: 'sources' }
  if (hash === '#/slide-maker') return { view: 'slide-maker' }
  if (hash === '#/skills') return { view: 'skills' }
  if (hash === '#/skill-classification') return { view: 'skill-classification' }
  if (hash === '#/talent-classification') return { view: 'talent-classification' }
  if (hash === '#/trait-classification') return { view: 'trait-classification' }
  return { view: 'operators' }
}

function matchesEnemyAggregationRoute(hash: string, path: string): boolean {
  if (hash === path) return true
  if (!hash.startsWith(`${path}?`)) return false
  return new URLSearchParams(hash.split('?')[1] ?? '').has('aggregationVersion')
}

function parseSkillSelectionRoute(view: 'skill-json' | 'skill-effects' | 'skill-summary' | 'skill-structure' | 'damage-three', query: string): AppRoute {
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
  key: 'skillIndex' | 'levelIndex' | 'talentIndex',
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
