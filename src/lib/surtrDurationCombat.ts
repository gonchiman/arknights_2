import {
  calculateSurtrDuration,
  type SurtrDurationDrainTick,
  type SurtrDurationModel,
  type SurtrDurationPoint,
  type SurtrDurationResult,
} from './surtrDuration.ts'

/** A periodic, already mitigated HP change. Times are seconds since S3 activation. */
export interface SurtrDurationExternalAction {
  id: string
  kind: 'damage' | 'heal'
  /** HP change per unit and per occurrence, before the maximum-HP cap or one-HP floor. */
  amount: number
  interval: number
  firstTime: number
  /** Number of units acting at the same time, not the number of repetitions. */
  count: number
  /** Inclusive start and exclusive end; the periodic schedule remains anchored at firstTime. */
  activeFrom?: number
  activeUntil?: number
}

export interface SurtrDurationCombatEvent {
  time: number
  kind: 'startup' | 'drain' | 'damage' | 'heal' | 'remnant-start' | 'retreat'
  sourceId?: string
  requestedAmount: number
  /** Non-negative HP actually gained or lost, after the cap/floor. */
  appliedAmount: number
  hpBefore: number
  hpAfter: number
  maxHp: number
}

export interface SurtrDurationCombatResult extends Omit<SurtrDurationResult, 'remnantStart' | 'retreatTime'> {
  remnantStart: number | null
  /** Fixed scheduled expiry, known once Remnant triggers, even if beyond endTime. */
  retreatTime: number | null
  endTime: number
  outcome: 'retreated' | 'limit'
  events: SurtrDurationCombatEvent[]
}

interface ScheduledEvent {
  time: number
  kind: 'startup' | 'drain' | 'damage' | 'heal'
  actionIndex: number
  drainIndex: number
}

const MAX_EVENTS = 100_000
const TIME_PRECISION = 1e9
const PRIORITY = { startup: 0, drain: 1, damage: 2, heal: 3 } as const

/**
 * Extends the existing discrete self-drain estimate with periodic external HP
 * events. Same-time order is retreat, startup full heal, self-drain, enemy
 * damage, ally healing. Remnant's expiry never moves after it first triggers.
 * This is an explicit timing convention, not a frame-accurate battle engine.
 */
export function calculateSurtrDurationCombat(
  model: SurtrDurationModel,
  actions: readonly SurtrDurationExternalAction[],
  timeLimit = 120,
): SurtrDurationCombatResult | null {
  if (!validModel(model) || !nonNegative(timeLimit) || timeLimit > 600
    || !Array.isArray(actions) || actions.some(action => !validAction(action))) return null
  const endLimit = cleanTime(timeLimit)
  const schedule = createSchedule(model, actions, endLimit)
  if (!schedule) return null

  const points: SurtrDurationPoint[] = [makePoint(0, model.baseMaxHp, model.baseMaxHp, 'activation')]
  const drainSchedule: SurtrDurationDrainTick[] = []
  const events: SurtrDurationCombatEvent[] = []
  let hp = model.baseMaxHp
  let maxHp = model.baseMaxHp
  let remnantStart: number | null = null
  let retreatTime: number | null = null
  let startupComplete = false

  const phase = (): SurtrDurationPoint['phase'] => remnantStart !== null ? 'remnant'
    : startupComplete ? 'drain' : 'activation'
  const appendBefore = (time: number) => {
    if (points.at(-1)!.time !== time) points.push(makePoint(time, hp, maxHp, phase()))
  }
  const appendAfter = (time: number) => {
    const last = points.at(-1)!
    if (last.hp !== hp || last.maxHp !== maxHp || last.phase !== phase()) {
      points.push(makePoint(time, hp, maxHp, phase()))
    }
  }
  const retreat = (time: number): SurtrDurationCombatResult => {
    appendBefore(time)
    events.push({ time, kind: 'retreat', requestedAmount: 0, appliedAmount: 0,
      hpBefore: hp, hpAfter: hp, maxHp })
    return finish(time, 'retreated')
  }
  const finish = (endTime: number, outcome: SurtrDurationCombatResult['outcome']): SurtrDurationCombatResult => {
    // Preserve the original no-external-effect sampling as well as its numbers.
    // The detailed event stream still includes self-drain during Remnant.
    const baseline = actions.length === 0 && outcome === 'retreated' ? calculateSurtrDuration(model) : null
    return {
      remnantStart,
      remnantDuration: model.remnantDuration,
      retreatTime,
      endTime,
      outcome,
      points: baseline?.points ?? points,
      drainSchedule: baseline?.drainSchedule ?? drainSchedule,
      events,
    }
  }

  for (const scheduled of schedule) {
    if (retreatTime !== null && retreatTime <= scheduled.time) return retreat(retreatTime)
    const { time, kind } = scheduled
    appendBefore(time)
    const hpBefore = hp
    let requestedAmount: number
    let sourceId: string | undefined
    if (kind === 'startup') {
      startupComplete = true
      maxHp = model.maxHp
      hp = maxHp
      requestedAmount = maxHp
    } else if (kind === 'drain') {
      const elapsed = scheduled.drainIndex * model.drainInterval
      const rate = model.maxDrainRate * Math.min(elapsed / model.rampDuration, 1)
      requestedAmount = model.maxHp * model.drainInterval * rate
      if (!Number.isFinite(requestedAmount)) return null
      hp = Math.max(remnantStart === null ? 0 : 1, hp - requestedAmount)
      drainSchedule.push({ time, rate, hpLoss: requestedAmount, hpAfter: Math.max(1, hp) })
    } else {
      const action = actions[scheduled.actionIndex]
      sourceId = action.id
      requestedAmount = action.amount * action.count
      hp = kind === 'heal' ? Math.min(maxHp, hp + requestedAmount)
        : Math.max(remnantStart === null ? 0 : 1, hp - requestedAmount)
    }
    const triggeredRemnant = hp <= 0 && remnantStart === null
    if (triggeredRemnant) {
      remnantStart = time
      retreatTime = cleanTime(time + model.remnantDuration)
      hp = 1
    }
    events.push({ time, kind, ...(sourceId ? { sourceId } : {}), requestedAmount,
      appliedAmount: Math.abs(hp - hpBefore), hpBefore, hpAfter: hp, maxHp })
    if (triggeredRemnant) events.push({ time, kind: 'remnant-start', requestedAmount: 0,
      appliedAmount: 0, hpBefore: hp, hpAfter: hp, maxHp })
    appendAfter(time)
  }
  if (retreatTime !== null && retreatTime <= endLimit) return retreat(retreatTime)
  appendBefore(endLimit)
  return finish(endLimit, 'limit')
}

function createSchedule(
  model: SurtrDurationModel,
  actions: readonly SurtrDurationExternalAction[],
  limit: number,
): ScheduledEvent[] | null {
  const schedule: ScheduledEvent[] = []
  const activation = cleanTime(model.activationDelay)
  if (activation <= limit) schedule.push({ time: activation, kind: 'startup', actionIndex: -1, drainIndex: 0 })
  const drainCount = Math.max(0, Math.floor((limit - model.activationDelay) / model.drainInterval + 1e-8))
  if (!Number.isSafeInteger(drainCount) || drainCount > MAX_EVENTS) return null
  for (let index = 1; index <= drainCount; index += 1) {
    const time = cleanTime(model.activationDelay + index * model.drainInterval)
    if (time <= limit) schedule.push({ time, kind: 'drain', actionIndex: -1, drainIndex: index })
  }
  for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
    const action = actions[actionIndex]
    const activeFrom = action.activeFrom ?? 0
    const activeUntil = action.activeUntil ?? Infinity
    if (action.firstTime > limit || activeFrom > limit || activeUntil <= action.firstTime) continue
    const firstIndex = Math.max(0, Math.ceil((activeFrom - action.firstTime) / action.interval - 1e-8))
    const lastIndex = Math.min(Math.floor((limit - action.firstTime) / action.interval + 1e-8),
      activeUntil === Infinity ? Infinity : Math.ceil((activeUntil - action.firstTime) / action.interval - 1e-8) - 1)
    if (!Number.isSafeInteger(firstIndex) || !Number.isSafeInteger(lastIndex)) return null
    const candidateCount = Math.max(0, lastIndex - firstIndex + 1)
    if (candidateCount > MAX_EVENTS || candidateCount + schedule.length > MAX_EVENTS) return null
    for (let index = firstIndex; index <= lastIndex; index += 1) {
      const time = cleanTime(action.firstTime + index * action.interval)
      if (time >= activeFrom && time < activeUntil && time <= limit) {
        schedule.push({ time, kind: action.kind, actionIndex, drainIndex: 0 })
      }
    }
  }
  if (schedule.length > MAX_EVENTS) return null
  return schedule.sort((a, b) => a.time - b.time || PRIORITY[a.kind] - PRIORITY[b.kind]
    || a.actionIndex - b.actionIndex)
}

function validAction(action: SurtrDurationExternalAction): boolean {
  return !!action && typeof action.id === 'string' && action.id.trim().length > 0
    && (action.kind === 'damage' || action.kind === 'heal')
    && nonNegative(action.amount) && positive(action.interval) && nonNegative(action.firstTime)
    && Number.isSafeInteger(action.count) && action.count > 0
    && Number.isFinite(action.amount * action.count)
    && (action.activeFrom === undefined || nonNegative(action.activeFrom))
    && (action.activeUntil === undefined || (nonNegative(action.activeUntil)
      && action.activeUntil > (action.activeFrom ?? 0)))
}

function validModel(model: SurtrDurationModel): boolean {
  return !!model && positive(model.baseMaxHp)
    && positive(model.maxHp) && model.maxHp > 1 && nonNegative(model.activationDelay)
    && positive(model.drainInterval) && positive(model.rampDuration)
    && positive(model.maxDrainRate) && positive(model.remnantDuration)
}

function makePoint(time: number, hp: number, maxHp: number, phase: SurtrDurationPoint['phase']): SurtrDurationPoint {
  return { time, hp, maxHp, hpPercent: hp / maxHp * 100, phase }
}

function nonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function positive(value: unknown): value is number {
  return nonNegative(value) && value > 0
}

function cleanTime(value: number): number {
  return value < Number.MAX_VALUE / TIME_PRECISION ? Math.round(value * TIME_PRECISION) / TIME_PRECISION : value
}
