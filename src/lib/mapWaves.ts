import type { MapDetail, MapWaveAction, MapWaveFragment } from '../types/map.ts'

export interface MapSpawnRow {
  action: MapWaveAction
  /** The source position stays stable when rows are ordered by their local delay. */
  actionIndex: number
}

const validTime = (value: number | null): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const validCount = (value: number | null): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const roundedTime = (time: number): number => {
  // Remove ordinary binary floating-point tails without multiplying large times.
  const rounded = Number(time.toPrecision(15))
  return Number.isFinite(rounded) ? rounded : time
}

/** SPAWN actions ordered by local preDelay; this is not a combat timeline. */
export function getMapSpawnRows(fragment: MapWaveFragment): MapSpawnRow[] {
  return fragment.actions.map((action, actionIndex) => ({ action, actionIndex }))
    .filter(({ action }) => action.actionType === 'SPAWN')
    .sort((a, b) => {
      const aTime = validTime(a.action.preDelay) ? a.action.preDelay : Infinity
      const bTime = validTime(b.action.preDelay) ? b.action.preDelay : Infinity
      return aTime === bTime ? a.actionIndex - b.actionIndex : aTime - bTime
    })
}

/**
 * Sum of configured SPAWN counts, including conditional actions. This is not the
 * number of enemies guaranteed to appear. Unknown or overflowing totals are null.
 */
export function getMapSpecifiedSpawnCount(actions: readonly MapWaveAction[]): number | null {
  let total = 0
  for (const action of actions) {
    if (action.actionType !== 'SPAWN') continue
    if (!validCount(action.count)) return null
    total += action.count
    if (!Number.isSafeInteger(total)) return null
  }
  return total
}

/**
 * Preview raw times relative to this fragment: preDelay + interval * i.
 * These are configured candidate times, including for conditional actions.
 * A bounded preview prevents unusually large source counts or limits allocating
 * unbounded arrays. Unknown required timing, unsafe counts, or overflow are null.
 */
export function getMapSpawnTimes(
  action: MapWaveAction,
  limit = 12,
): { times: number[]; remaining: number } | null {
  if (action.actionType !== 'SPAWN' || !validCount(action.count) || !validTime(action.preDelay)
    || !Number.isSafeInteger(limit) || limit < 0) return null
  if (action.count > 1 && !validTime(action.interval)) return null
  const interval = action.count > 1 ? action.interval! : 0
  if (action.count > 0 && !Number.isFinite(action.preDelay + interval * (action.count - 1))) return null
  const previewCount = Math.min(action.count, limit, 1000)
  const times = Array.from({ length: previewCount }, (_, i) => {
    const time = action.preDelay! + interval * i
    return roundedTime(time)
  })
  return { times, remaining: action.count - previewCount }
}

export interface MapEntrance {
  id: string
  label: string
  /** Source route coordinates: row zero is the bottom of the displayed map. */
  row: number
  col: number
}

export interface MapSpawnFlowRow {
  id: string
  /** Configured time relative to the fragment, not elapsed combat time. */
  time: number | null
  entrance: MapEntrance | null
  enemies: { key: string | null; count: number | null }[]
  count: number | null
  actions: MapWaveAction[]
  actionIndices: number[]
}

const ENTRANCE_TILE_KEYS = new Set(['tile_start', 'tile_flystart', 'tile_ftstart', 'tile_mpprts_enemy_born'])
const SPAWN_EVENT_LIMIT = 10_000

function entranceLabel(index: number): string {
  let label = ''
  for (let value = index; value >= 0; value = Math.floor(value / 26) - 1) {
    label = String.fromCharCode(65 + value % 26) + label
  }
  return label
}

function routeStart(detail: MapDetail, action: MapWaveAction): { row: number; col: number } | null {
  if (!validCount(action.routeIndex)) return null
  const start = detail.routes?.[action.routeIndex]?.startPosition
  if (!start || !validCount(start.row) || !validCount(start.col)) return null
  const gridRow = detail.grid[detail.grid.length - 1 - start.row]
  return gridRow && start.col < gridRow.length ? start : null
}

/** Map-wide labels stay stable when the selected wave or fragment changes. */
export function getMapEntrances(detail: MapDetail): MapEntrance[] {
  const positions = new Map<string, { row: number; col: number }>()
  const add = (position: { row: number; col: number }) => {
    positions.set(`${position.row}:${position.col}`, position)
  }
  detail.grid.forEach((row, gridRow) => row.forEach((tileIndex, col) => {
    if (ENTRANCE_TILE_KEYS.has(detail.tiles[tileIndex]?.tileKey)) {
      add({ row: detail.grid.length - 1 - gridRow, col })
    }
  }))
  for (const wave of detail.waves ?? []) for (const fragment of wave.fragments) {
    for (const action of fragment.actions) {
      if (action.actionType !== 'SPAWN') continue
      const position = routeStart(detail, action)
      if (position) add(position)
    }
  }
  return [...positions.values()].sort((a, b) => b.row - a.row || a.col - b.col)
    .map((position, index) => ({ id: `${position.row}:${position.col}`, label: entranceLabel(index), ...position }))
}

function addCounts(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null
  const result = left + right
  return Number.isSafeInteger(result) ? result : null
}

interface SpawnStream {
  action: MapWaveAction
  actionIndex: number
  entrance: MapEntrance | null
  time: number
  interval: number
  nextIndex: number
  remaining: number
}

const compareStreams = (a: SpawnStream, b: SpawnStream): number =>
  a.time - b.time || a.actionIndex - b.actionIndex

/** A min-heap merges repeated spawn streams without allocating their full counts. */
function pushStream(heap: SpawnStream[], stream: SpawnStream): void {
  let index = heap.length
  heap.push(stream)
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2)
    if (compareStreams(heap[parent], stream) <= 0) break
    heap[index] = heap[parent]
    index = parent
  }
  heap[index] = stream
}

function popStream(heap: SpawnStream[]): SpawnStream {
  const first = heap[0]
  const last = heap.pop()!
  if (heap.length) {
    let index = 0
    while (index * 2 + 1 < heap.length) {
      let child = index * 2 + 1
      if (child + 1 < heap.length && compareStreams(heap[child + 1], heap[child]) < 0) child++
      if (compareStreams(last, heap[child]) <= 0) break
      heap[index] = heap[child]
      index = child
    }
    heap[index] = last
  }
  return first
}

/**
 * Expand configured candidate times and combine fixed spawns at the same time and
 * entrance. Conditional alternatives and unresolved entrances keep their source
 * action identity. This does not infer fragment starts or absolute combat times.
 */
export function getMapSpawnFlow(detail: MapDetail, fragment: MapWaveFragment): {
  rows: MapSpawnFlowRow[]
  /** A decimal string preserves exact totals beyond the safe integer range. */
  omittedCount: number | string
  /** SPAWN action count whose configured timing or count could not be expanded. */
  unknownCount: number
} {
  const entrances = getMapEntrances(detail)
  const entranceById = new Map(entrances.map((entrance) => [entrance.id, entrance]))
  const entranceOrder = new Map(entrances.map((entrance, index) => [entrance.id, index]))
  const rowsById = new Map<string, MapSpawnFlowRow>()
  const streams: SpawnStream[] = []
  let unknownCount = 0

  const append = (action: MapWaveAction, actionIndex: number, entrance: MapEntrance | null, time: number | null, count: number | null) => {
    const scope = action.spawnKind === 'fixed' && entrance && time !== null
      ? `entrance:${entrance.id}` : `action:${actionIndex}`
    const id = `${scope}:time:${time ?? 'unknown'}`
    const existing = rowsById.get(id)
    if (!existing) {
      rowsById.set(id, { id, time, entrance, enemies: [{ key: action.key, count }], count, actions: [action], actionIndices: [actionIndex] })
      return
    }
    existing.count = addCounts(existing.count, count)
    const enemy = existing.enemies.find((entry) => entry.key === action.key)
    if (enemy) enemy.count = addCounts(enemy.count, count)
    else existing.enemies.push({ key: action.key, count })
    if (!existing.actionIndices.includes(actionIndex)) {
      existing.actions.push(action)
      existing.actionIndices.push(actionIndex)
    }
  }

  fragment.actions.forEach((action, actionIndex) => {
    if (action.actionType !== 'SPAWN' || action.count === 0) return
    const position = routeStart(detail, action)
    const entrance = position ? entranceById.get(`${position.row}:${position.col}`) ?? null : null
    const timing = getMapSpawnTimes(action, 0)
    if (!timing) unknownCount++
    if (!timing) {
      append(action, actionIndex, entrance, null, validCount(action.count) ? action.count : null)
      return
    }
    const interval = action.count! > 1 ? action.interval! : 0
    pushStream(streams, { action, actionIndex, entrance, time: roundedTime(action.preDelay!), interval, nextIndex: 0, remaining: action.count! })
  })

  let emitted = 0
  let lastTime: number | null = null
  let lastTimeCount = 0n
  while (streams.length && emitted < SPAWN_EVENT_LIMIT) {
    const stream = popStream(streams)
    // Simultaneous repeats consume one slot even for enormous configured counts.
    const count = stream.interval === 0 ? stream.remaining : 1
    append(stream.action, stream.actionIndex, stream.entrance, stream.time, count)
    if (stream.time !== lastTime) {
      lastTime = stream.time
      lastTimeCount = 0n
    }
    lastTimeCount += BigInt(count)
    emitted++
    stream.remaining -= count
    if (stream.remaining > 0) {
      stream.nextIndex++
      stream.time = roundedTime(stream.action.preDelay! + stream.interval * stream.nextIndex)
      pushStream(streams, stream)
    }
  }
  let omittedTotal = streams.reduce((total, stream) => total + BigInt(stream.remaining), 0n)
  if (streams.length && streams[0].time === lastTime) {
    // Never show a partial simultaneous total. Discard the incomplete final time
    // instead of extending expansion beyond the hard cap to finish that bucket.
    for (const [id, row] of rowsById) if (row.time === lastTime) rowsById.delete(id)
    omittedTotal += lastTimeCount
  }
  const omittedCount = omittedTotal <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(omittedTotal) : omittedTotal.toString()
  const rows = [...rowsById.values()]
  for (const row of rows) {
    const pairs = row.actionIndices.map((index, i) => ({ index, action: row.actions[i] })).sort((a, b) => a.index - b.index)
    row.actionIndices = pairs.map(({ index }) => index)
    row.actions = pairs.map(({ action }) => action)
  }
  rows.sort((a, b) => {
    const aTime = a.time ?? Infinity
    const bTime = b.time ?? Infinity
    if (aTime !== bTime) return aTime - bTime
    const aEntrance = a.entrance ? entranceOrder.get(a.entrance.id)! : Infinity
    const bEntrance = b.entrance ? entranceOrder.get(b.entrance.id)! : Infinity
    return aEntrance === bEntrance ? a.actionIndices[0] - b.actionIndices[0] : aEntrance - bEntrance
  })
  return { rows, omittedCount, unknownCount }
}
