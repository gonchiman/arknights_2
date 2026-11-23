export interface TimedHit {
  damage: number
  attribute: 'PHYSICAL' | 'ARTS' | 'OTHER'
}

export interface TimedAttack {
  interval: number
  hit: TimedHit
}

interface ActiveCombat {
  attack: TimedAttack | null
  counter?: TimedHit
  counterCooldown?: number
}

export interface CombatSkillProfile {
  normal: TimedAttack
  recovery: 'AUTO' | 'ATTACK' | 'DEFENSE'
  initialSp: number
  cost: number
  maxCharges?: number
  skill:
    | { kind: 'NEXT_ATTACK'; hit: TimedHit }
    | (ActiveCombat & {
      kind: 'DURATION'
      duration: number
      onDeployOnly?: boolean
      /** Hits in nondecreasing seconds since activation. Use final for a hit exactly at expiry. */
      scheduledHits?: readonly { offset: number; hit: TimedHit }[]
      final?: TimedHit
    })
    | (ActiveCombat & { kind: 'PASSIVE' })
}

export interface CombatWindowDamage {
  total: number
  baseline: number
  gain: number
  attribute: TimedHit['attribute']
}

// Coalesce floating-point representations of simultaneous hits (e.g. 30 × 1/3 s).
const EPSILON = 1e-8

function validInterval(seconds: number): boolean {
  return Number.isFinite(seconds) && seconds > EPSILON
}

function damageOf(hit: TimedHit): number {
  if (!(Number.isFinite(hit.damage) && hit.damage >= 0)) throw new RangeError('期間火力のダメージ値が不正です。')
  return hit.damage
}

/** Single stationary target, from deployment through [0, seconds). The first attack
 * lands after one attack interval. An attack-speed change preserves progress toward
 * the next hit; a phase that stops ordinary attacks starts a fresh interval on exit.
 * At equal times: expiry, automatic activation, outgoing attack, then incoming hit.
 * Attack/defense recovery grants SP after the corresponding event. */
export function simulateDamageThreeCombat(
  profile: CombatSkillProfile, seconds: number, incomingInterval: number | null,
): CombatWindowDamage {
  const { normal, skill, cost, recovery } = profile
  const form = skill.kind === 'PASSIVE' || skill.kind === 'DURATION' ? skill : null
  const scheduledHits = skill.kind === 'DURATION' ? skill.scheduledHits ?? [] : []
  const onDeployOnly = skill.kind === 'DURATION' && skill.onDeployOnly
  const usesSp = skill.kind !== 'PASSIVE' && !onDeployOnly
  const maxCharges = profile.maxCharges ?? 1
  const maxSp = cost * maxCharges
  if (!Number.isFinite(seconds) || seconds < 0 || !validInterval(normal.interval)
    || (incomingInterval !== null && !validInterval(incomingInterval))
    || (form?.attack && !validInterval(form.attack.interval))
    || (form?.counterCooldown !== undefined && !(Number.isFinite(form.counterCooldown) && form.counterCooldown >= 0))
    || (skill.kind === 'DURATION' && !validInterval(skill.duration) && skill.duration !== Infinity)
    || (usesSp && (!validInterval(cost) || !Number.isFinite(profile.initialSp) || profile.initialSp < 0
      || !Number.isSafeInteger(maxCharges) || maxCharges < 1 || !Number.isFinite(maxSp)))) {
    throw new RangeError('期間火力の攻撃間隔・SP・時間の条件が不正です。')
  }
  if (skill.kind === 'DURATION' && scheduledHits.some(({ offset }, index) =>
    !Number.isFinite(offset) || offset < 0 || offset >= skill.duration
    || (index > 0 && offset < scheduledHits[index - 1].offset))) {
    throw new RangeError('スキルの攻撃時刻は発動から終了前までの昇順で指定してください。')
  }

  let total = 0
  let attribute: TimedHit['attribute'] | undefined
  function record(hit: TimedHit) {
    const damage = damageOf(hit)
    if (damage === 0) return
    total += damage
    attribute = attribute === undefined || attribute === hit.attribute ? hit.attribute : 'OTHER'
  }

  let time = 0
  let sp = usesSp ? Math.min(profile.initialSp, maxSp) : 0
  let active = skill.kind === 'PASSIVE'
  let activeStart = 0
  let activeEnd = Infinity
  let scheduledIndex = 0
  let nextScheduled = Infinity
  let attack = active && form ? form.attack : normal
  let nextAttack = attack?.interval ?? Infinity
  let nextIncoming = incomingInterval ?? Infinity
  let counterReady = 0

  function changeAttack(next: TimedAttack | null) {
    const remaining = attack ? Math.max(0, nextAttack - time) / attack.interval : 1
    attack = next
    nextAttack = next ? time + remaining * next.interval : Infinity
  }

  function recordScheduledHits() {
    while (scheduledIndex < scheduledHits.length && activeStart + scheduledHits[scheduledIndex].offset <= time + EPSILON) {
      record(scheduledHits[scheduledIndex++].hit)
    }
    const next = scheduledHits[scheduledIndex]
    nextScheduled = next ? activeStart + next.offset : Infinity
  }

  function activateIfReady() {
    // NEXT_ATTACK spends its SP when the boosted hit actually lands.
    if (skill.kind !== 'DURATION' || active || (onDeployOnly ? time !== 0 : sp < cost - EPSILON)) return
    sp = usesSp ? Math.max(0, sp - cost) : 0
    active = true
    activeStart = time
    activeEnd = time + skill.duration
    changeAttack(skill.attack)
    scheduledIndex = 0
    recordScheduledHits()
  }

  if (seconds > 0) activateIfReady()
  while (true) {
    const readyAt = usesSp && !active && recovery === 'AUTO' && sp < cost - EPSILON
      ? time + cost - sp : Infinity
    const nextTime = Math.min(nextAttack, nextIncoming, nextScheduled, activeEnd, readyAt)
    if (nextTime >= seconds - EPSILON) break
    if (usesSp && !active && recovery === 'AUTO') sp = Math.min(maxSp, sp + nextTime - time)
    time = nextTime

    if (nextScheduled <= time + EPSILON) recordScheduledHits()
    if (activeEnd <= time + EPSILON && skill.kind === 'DURATION') {
      if (skill.final) record(skill.final)
      active = false
      activeEnd = Infinity
      changeAttack(normal)
    }
    activateIfReady()
    if (attack && nextAttack <= time + EPSILON) {
      nextAttack = time + attack.interval
      if (skill.kind === 'NEXT_ATTACK' && sp >= cost - EPSILON) {
        sp = Math.max(0, sp - cost)
        record(skill.hit)
      } else {
        record(attack.hit)
        if (usesSp && !active && recovery === 'ATTACK') {
          sp = Math.min(maxSp, sp + 1)
          activateIfReady()
        }
      }
    }
    if (incomingInterval !== null && nextIncoming <= time + EPSILON) {
      nextIncoming = time + incomingInterval
      if (active && form?.counter && counterReady <= time + EPSILON) {
        record(form.counter)
        counterReady = time + (form.counterCooldown ?? 0)
      }
      if (usesSp && !active && recovery === 'DEFENSE') {
        sp = Math.min(maxSp, sp + 1)
        activateIfReady()
      }
    }
  }

  let baseline = 0
  const normalDamage = damageOf(normal.hit)
  for (let hit = 1; hit * normal.interval < seconds - EPSILON; hit++) {
    baseline += normalDamage
  }
  if (!Number.isFinite(total) || !Number.isFinite(baseline)) throw new RangeError('期間火力の合計が不正です。')
  return { total, baseline, gain: total - baseline, attribute: attribute ?? 'OTHER' }
}
