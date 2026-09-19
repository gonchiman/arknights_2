import type {
  GoldenglowTargetSwitchAttackTrace,
  GoldenglowTargetSwitchDelayTrace,
  GoldenglowTargetSwitchDroneTrace,
  GoldenglowTargetSwitchTrial,
} from './goldenglowTargetSwitch.ts'

export interface GoldenglowTargetSwitchHistoryAttack {
  /** Zero-based indices into the original trace row and its attacks. */
  traceIndex: number
  attackIndex: number
  time: number
  /** One-based ordinal for this body or numbered drone. */
  actorAttackNumber: number
  previousAttackTime: number | null
  nextAttackTime: number | null
  attack: GoldenglowTargetSwitchAttackTrace
  drone: GoldenglowTargetSwitchDroneTrace | null
}

export interface GoldenglowTargetSwitchHistoryDelay {
  kind: 'delay'
  traceIndex: number
  delayIndex: number
  /** When the schedule changed, not the resulting scheduled attack time. */
  time: number
  delay: GoldenglowTargetSwitchDelayTrace
}

export type GoldenglowTargetSwitchHistoryEvent =
  | { kind: 'attack'; entry: GoldenglowTargetSwitchHistoryAttack }
  | GoldenglowTargetSwitchHistoryDelay

export interface GoldenglowTargetSwitchHistoryRow {
  traceIndex: number
  time: number
  events: GoldenglowTargetSwitchHistoryEvent[]
}

export interface GoldenglowTargetSwitchHistoryTarget {
  traceIndex: number
  time: number
  targetNumber: number
  hpBefore: number
  hpAfter: number
  killed: boolean
  attacks: GoldenglowTargetSwitchHistoryAttack[]
}

/** Summarizes only actual hits, retaining target and attack encounter order. */
export function groupGoldenglowTargetSwitchHistoryTargets(
  row: GoldenglowTargetSwitchHistoryRow,
): GoldenglowTargetSwitchHistoryTarget[] {
  const targets = new Map<number, GoldenglowTargetSwitchHistoryTarget>()
  for (const event of row.events) {
    if (event.kind !== 'attack') continue
    const { entry } = event
    const { attack } = entry
    const target = targets.get(attack.targetNumber)
    if (target) {
      target.hpAfter = attack.hpAfter
      target.killed = attack.killed
      target.attacks.push(entry)
    } else {
      targets.set(attack.targetNumber, {
        traceIndex: row.traceIndex,
        time: row.time,
        targetNumber: attack.targetNumber,
        hpBefore: attack.hpBefore,
        hpAfter: attack.hpAfter,
        killed: attack.killed,
        attacks: [entry],
      })
    }
  }
  return [...targets.values()]
}

/**
 * Flattens recorded actual attacks in trace order without inferring absent
 * legacy hits. Actor links span the full trial, before any UI pagination.
 * Attack and drone records are borrowed without modifying the input.
 */
export function buildGoldenglowTargetSwitchHistory(
  trial: GoldenglowTargetSwitchTrial,
): GoldenglowTargetSwitchHistoryAttack[] {
  const history: GoldenglowTargetSwitchHistoryAttack[] = []
  const previousByActor = new Map<string, GoldenglowTargetSwitchHistoryAttack>()
  for (const [traceIndex, row] of trial.trace.entries()) {
    if (!row.attacks?.length) continue
    const dronesByNumber = new Map(row.drones.map((drone) => [drone.droneNumber, drone]))
    for (const [attackIndex, attack] of row.attacks.entries()) {
      const actorKey = attack.actor === 'body' ? 'body' : `drone:${attack.droneNumber}`
      const previous = previousByActor.get(actorKey)
      const entry: GoldenglowTargetSwitchHistoryAttack = {
        traceIndex,
        attackIndex,
        time: row.time,
        actorAttackNumber: (previous?.actorAttackNumber ?? 0) + 1,
        previousAttackTime: previous?.time ?? null,
        nextAttackTime: null,
        attack,
        drone: attack.actor === 'drone' && attack.droneNumber !== undefined
          ? dronesByNumber.get(attack.droneNumber) ?? null : null,
      }
      if (previous) previous.nextAttackTime = row.time
      previousByActor.set(actorKey, entry)
      history.push(entry)
    }
  }
  return history
}

/**
 * Groups recorded attacks and readiness changes by their source timestamp.
 * Every attack is followed by the delays it caused, preserving each cause's
 * recorded order. Events remain an array because an actor can both attack and
 * be postponed at the same time; scheduled future attacks are never invented.
 * Actual previous/next attack links are resolved across the whole trial first.
 */
export function buildGoldenglowTargetSwitchHistoryRows(
  trial: GoldenglowTargetSwitchTrial,
): GoldenglowTargetSwitchHistoryRow[] {
  const attacksByTrace = new Map<number, GoldenglowTargetSwitchHistoryAttack[]>()
  for (const entry of buildGoldenglowTargetSwitchHistory(trial)) {
    const entries = attacksByTrace.get(entry.traceIndex)
    if (entries) entries.push(entry)
    else attacksByTrace.set(entry.traceIndex, [entry])
  }

  const rows: GoldenglowTargetSwitchHistoryRow[] = []
  for (const [traceIndex, row] of trial.trace.entries()) {
    const delaysByCause = new Map<number, GoldenglowTargetSwitchHistoryDelay[]>()
    const delays = (row.delays ?? []).map((delay, delayIndex): GoldenglowTargetSwitchHistoryDelay => ({
      kind: 'delay', traceIndex, delayIndex, time: row.time, delay,
    }))
    for (const event of delays) {
      const caused = delaysByCause.get(event.delay.causeAttackIndex)
      if (caused) caused.push(event)
      else delaysByCause.set(event.delay.causeAttackIndex, [event])
    }

    const events: GoldenglowTargetSwitchHistoryEvent[] = []
    for (const entry of attacksByTrace.get(traceIndex) ?? []) {
      events.push({ kind: 'attack', entry }, ...(delaysByCause.get(entry.attackIndex) ?? []))
      delaysByCause.delete(entry.attackIndex)
    }
    // Preserve supplied delay records even if their cause is absent from a
    // partial trace, without fabricating an attack for the missing cause.
    for (const event of delays) {
      if (delaysByCause.has(event.delay.causeAttackIndex)) events.push(event)
    }
    if (events.length) rows.push({ traceIndex, time: row.time, events })
  }
  return rows
}
