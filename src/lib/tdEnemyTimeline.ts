import type { MapDetail, MapIndex, MapPosition, MapRoute } from '../types/map.ts'
import { getMapSpawnTimes } from './mapWaves.ts'

type EnemyMotion = 'moving' | 'waiting' | 'hidden'

export interface TdEnemyPosition extends MapPosition {
  enemyId: string
  state: EnemyMotion
}

interface RouteStep {
  from: MapPosition
  to: MapPosition
  start: number
  end: number
  state: EnemyMotion
}

interface Journey {
  duration: number
  steps: RouteStep[]
}

export interface TdEnemyTimeline {
  duration: number
  spawns: { enemyId: string; start: number; journey: Journey }[]
}

const validSeconds = (seconds: number | null): seconds is number =>
  seconds !== null && Number.isFinite(seconds) && seconds >= 0

function isWalkable(detail: MapDetail, point: MapPosition): boolean {
  const tile = detail.grid[detail.grid.length - 1 - point.row]?.[point.col]
  const mask = detail.tiles[tile]?.passableMask
  return mask === 'ALL' || mask === 'WALK_ONLY'
}

// Resolve equal-length walks consistently in screen order: right, down, left, up.
const NEIGHBORS = [[0, 1], [-1, 0], [0, -1], [1, 0]] as const

function findWalk(detail: MapDetail, from: MapPosition, to: MapPosition): MapPosition[] | null {
  const width = detail.grid[0].length
  const tileId = (p: MapPosition) => p.row * width + p.col
  const previous = new Map<number, MapPosition | null>([[tileId(from), null]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i]
    if (point.row === to.row && point.col === to.col) {
      const path: MapPosition[] = []
      let current = point
      let parent = previous.get(tileId(current))
      while (parent) {
        path.push(current)
        current = parent
        parent = previous.get(tileId(current))
      }
      return path.reverse()
    }
    for (const [dr, dc] of NEIGHBORS) {
      const neighbor = { row: point.row + dr, col: point.col + dc }
      if (!isWalkable(detail, neighbor) || previous.has(tileId(neighbor))) continue
      previous.set(tileId(neighbor), point)
      queue.push(neighbor)
    }
  }
  return null
}

function buildJourney(detail: MapDetail, route: MapRoute, speed: number): Journey | null {
  if (!route.startPosition || !isWalkable(detail, route.startPosition) || !route.endPosition || !route.checkpoints) return null
  let position: MapPosition = route.startPosition
  let elapsed = 0
  let walkedTiles = 0
  let waitedSeconds = 0
  let hidden = false
  const steps: RouteStep[] = []
  function addStep(to: MapPosition, state: EnemyMotion) {
    // Dividing total distance once avoids accumulating a rounding error at each tile.
    const end = waitedSeconds + walkedTiles / speed
    if (end > elapsed) steps.push({ from: position, to, start: elapsed, end, state })
    elapsed = end
    position = to
  }
  function walkTo(target: MapPosition) {
    const path = findWalk(detail, position, target)
    if (!path) return false
    for (const next of path) {
      walkedTiles++
      addStep(next, 'moving')
    }
    return true
  }

  for (const checkpoint of route.checkpoints) {
    switch (checkpoint.type) {
      case 'MOVE':
        if (hidden || !checkpoint.position || !walkTo(checkpoint.position)) return null
        break
      case 'WAIT_FOR_SECONDS':
        if (!validSeconds(checkpoint.time)) return null
        waitedSeconds += checkpoint.time
        addStep(position, hidden ? 'hidden' : 'waiting')
        break
      case 'DISAPPEAR':
        hidden = true
        break
      case 'APPEAR_AT_POS':
        if (!checkpoint.position || !isWalkable(detail, checkpoint.position)) return null
        position = checkpoint.position
        hidden = false
        break
      default:
        return null
    }
  }
  if (hidden || !walkTo(route.endPosition) || !Number.isFinite(elapsed)) return null
  return { steps, duration: elapsed }
}

/** Estimate the fixed TD spawn schedule without combat, fragment gates or wave-clear triggers. */
export function buildTdEnemyTimeline(detail: MapDetail, index: MapIndex): TdEnemyTimeline | null {
  if (detail.waves?.length !== 1 || !detail.routes || !detail.grid[0]?.length) return null
  const wave = detail.waves[0]
  if (wave.advancedWaveTag || !validSeconds(wave.preDelay)) return null
  const journeys = new Map<string, Journey>()
  const spawns: TdEnemyTimeline['spawns'] = []
  let duration = 0
  let fragmentEnd = wave.preDelay
  for (const fragment of wave.fragments) {
    if (!validSeconds(fragment.preDelay)) return null
    const fragmentStart = fragmentEnd + fragment.preDelay
    fragmentEnd = fragmentStart
    for (const action of fragment.actions) {
      if (action.actionType !== 'SPAWN' || action.blockFragment !== false || action.spawnKind !== 'fixed') return null
      const resolution = action.resolution
      if (resolution && (resolution.status !== 'included' || resolution.resolvedCount !== action.count)) return null
      const times = getMapSpawnTimes(action, action.count ?? 0)
      if (!times || times.remaining > 0) return null
      if (!times.times.length) continue
      const enemyId = resolution ? resolution.resolvedEnemyId : action.key
      if (!enemyId || action.routeIndex === null) return null
      const enemy = index.enemies[enemyId]
      const speed = enemy?.moveSpeed
      const route = detail.routes[action.routeIndex]
      if (!route || enemy?.motion !== 'WALK' || speed == null || !Number.isFinite(speed) || speed <= 0) return null
      const cacheKey = `${action.routeIndex}:${speed}`
      let journey = journeys.get(cacheKey)
      if (!journey) {
        const result = buildJourney(detail, route, speed)
        if (!result) return null
        journey = result
        journeys.set(cacheKey, journey)
      }
      for (const delay of times.times) {
        const start = fragmentStart + delay
        spawns.push({ enemyId, start, journey })
        fragmentEnd = Math.max(fragmentEnd, start)
        duration = Math.max(duration, start + journey.duration)
      }
    }
  }
  return spawns.length && Number.isSafeInteger(Math.ceil(duration)) ? { spawns, duration: Math.ceil(duration) } : null
}

/** Positions use the source coordinate system: row zero is the bottom of the map. */
export function getTdEnemyPositions(timeline: TdEnemyTimeline, time: number): TdEnemyPosition[] {
  const positions: TdEnemyPosition[] = []
  if (!Number.isFinite(time) || time < 0 || time >= timeline.duration) return positions
  for (const { enemyId, start, journey } of timeline.spawns) {
    const age = time - start
    if (age < 0 || age >= journey.duration) continue
    const step = journey.steps.find(part => age < part.end)
    if (!step) continue
    const fraction = (age - step.start) / (step.end - step.start)
    positions.push({
      enemyId,
      row: step.from.row + fraction * (step.to.row - step.from.row),
      col: step.from.col + fraction * (step.to.col - step.from.col),
      state: step.state,
    })
  }
  return positions
}
