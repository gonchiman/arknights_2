import {
  GOLDENGLOW_TARGET_SWITCH_LIMITS,
  createGoldenglowTargetSwitchRandom,
  prepareGoldenglowTargetSwitchSimulation,
  type GoldenglowTargetSwitchInput,
  type GoldenglowTargetSwitchPreparedSimulation,
} from './goldenglowTargetSwitch.ts'

export const GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS = {
  maxHpColumns: 100,
  maxResistanceRows: 101,
  maxCells: 1_000,
  maxPatternBytes: 8 * 1024 * 1024,
  maxDroneOpportunities: 750_000_000,
} as const

export type GoldenglowTargetSwitchGridSetup = Omit<GoldenglowTargetSwitchInput, 'enemyHp' | 'enemyResistance'>

export interface GoldenglowTargetSwitchGridInput extends GoldenglowTargetSwitchGridSetup {
  enemyHps: readonly number[]
  enemyResistances: readonly number[]
}

export interface GoldenglowTargetSwitchGridRow {
  enemyResistance: number
  /** After mitigation, including damage in excess of the target's remaining HP. */
  expectedDamages: number[]
}

export interface GoldenglowTargetSwitchGridResult {
  rows: GoldenglowTargetSwitchGridRow[]
  trials: number
  seed: number
  duration: number
}

export type GoldenglowTargetSwitchGridMessage =
  | { type: 'row'; row: GoldenglowTargetSwitchGridRow; completedRows: number; totalRows: number }
  | { type: 'complete'; result: GoldenglowTargetSwitchGridResult }
  | { type: 'error'; error: string }

interface PreparedRow {
  enemyResistance: number
  simulation: GoldenglowTargetSwitchPreparedSimulation
  damageKey: string
}

/**
 * Shares each trial's PRD draws across the grid, but evaluates HP, normal-attack
 * ramps and kill delays separately in every cell. PRD only resets on explosion,
 * so the same indexed draws remain valid when a cell stops attacking earlier.
 *
 * Rows and columns retain the supplied order, including duplicates. Completed
 * rows are emitted synchronously; a UI can run this function in a Worker and
 * terminate that Worker when the conditions change.
 */
export function simulateGoldenglowTargetSwitchGrid(
  input: GoldenglowTargetSwitchGridInput,
  onRow?: (row: GoldenglowTargetSwitchGridRow, completedRows: number, totalRows: number) => void,
): GoldenglowTargetSwitchGridResult {
  validateAxes(input)
  const enemyHps = [...input.enemyHps]
  const enemyResistances = [...input.enemyResistances]
  const setup = { ...input, model: input.model && { ...input.model } }
  const preparedRows = enemyResistances.map((enemyResistance): PreparedRow => {
    let simulation: GoldenglowTargetSwitchPreparedSimulation
    try {
      simulation = prepareGoldenglowTargetSwitchSimulation({
        ...setup, enemyHp: enemyHps[0], enemyResistance,
      })
    } catch (cause) {
      if (cause instanceof RangeError) throw new RangeError(localizeInputError(cause.message))
      throw cause
    }
    // Match the actual lookup values, including the minimum damage rule, rather
    // than assuming a particular fixed resistance ignore or module.
    const damageKey = JSON.stringify([
      ...simulation.normalDamageByStack, simulation.explosionDamage, simulation.bodyDamage,
    ])
    return { enemyResistance, simulation, damageKey }
  })
  const first = preparedRows[0].simulation
  const maxVolleys = getMaximumVolleyCount(first)
  const uniqueHps = [...new Set(enemyHps)]
  const uniqueRows = new Set(preparedRows.map((row) => row.damageKey)).size
  validateWorkload(first.input, maxVolleys, uniqueHps.length * uniqueRows)

  const patterns = createExplosionPatterns(first, maxVolleys)
  const rowCache = new Map<string, Map<number, number>>()
  const rows: GoldenglowTargetSwitchGridRow[] = []
  for (const { enemyResistance, simulation, damageKey } of preparedRows) {
    let damages = rowCache.get(damageKey)
    if (!damages) {
      damages = new Map(uniqueHps.map((hp) => [hp, calculateMeanDamage(simulation, hp, patterns, maxVolleys)]))
      rowCache.set(damageKey, damages)
    }
    // A callback/consumer cannot alter the cached values for a later equal row.
    const row = { enemyResistance, expectedDamages: enemyHps.map((hp) => damages.get(hp)!) }
    rows.push(row)
    onRow?.(row, rows.length, preparedRows.length)
  }
  return { rows, trials: first.input.trials, seed: first.input.seed, duration: first.input.duration }
}

function getMaximumVolleyCount({ input, timeTolerance }: GoldenglowTargetSwitchPreparedSimulation): number {
  let count = Math.floor(input.duration / input.attackInterval)
  // Use the same multiply-and-compare boundary as the single-condition engine.
  if ((count + 1) * input.attackInterval <= input.duration + timeTolerance) count += 1
  if (count * input.attackInterval > input.duration + timeTolerance) count -= 1
  return Math.max(0, count)
}

function createExplosionPatterns(
  { input, explosionChances }: GoldenglowTargetSwitchPreparedSimulation,
  maxVolleys: number,
): Uint16Array {
  const patterns = new Uint16Array(input.trials * maxVolleys)
  const misses = new Uint16Array(input.model.activeDroneCount)
  for (let trialIndex = 0; trialIndex < input.trials; trialIndex += 1) {
    misses.fill(0)
    const trialSeed = (input.seed + Math.imul(trialIndex, 0x9e3779b9)) >>> 0
    const random = createGoldenglowTargetSwitchRandom(trialSeed)
    const offset = trialIndex * maxVolleys
    for (let volley = 0; volley < maxVolleys; volley += 1) {
      let mask = 0
      for (let droneIndex = 0; droneIndex < misses.length; droneIndex += 1) {
        if (random() < explosionChances[misses[droneIndex]]) {
          mask |= 1 << droneIndex
          misses[droneIndex] = 0
        } else {
          misses[droneIndex] = Math.min(misses[droneIndex] + 1, input.model.prdMaxStack)
        }
      }
      patterns[offset + volley] = mask
    }
  }
  return patterns
}

function calculateMeanDamage(
  prepared: GoldenglowTargetSwitchPreparedSimulation,
  enemyHp: number,
  patterns: Uint16Array,
  maxVolleys: number,
): number {
  if (maxVolleys === 0) return 0
  if (prepared.input.retargetRemainingDrones) {
    return calculateMeanRetargetingDamage(prepared, enemyHp, patterns, maxVolleys)
  }
  const { input, normalDamageByStack, explosionDamage, bodyDamage, timeTolerance } = prepared
  const normalStacks = new Uint16Array(input.model.activeDroneCount)
  let total = 0
  for (let trialIndex = 0; trialIndex < input.trials; trialIndex += 1) {
    normalStacks.fill(0)
    let hp = enemyHp
    let kills = 0
    let trialDamage = 0
    const offset = trialIndex * maxVolleys
    for (let volley = 0; volley < maxVolleys; volley += 1) {
      const nextTime = (volley + 1) * input.attackInterval + kills * input.switchDelay
      if (nextTime > input.duration + timeTolerance) break
      const mask = patterns[offset + volley]
      let normalDamage = 0
      let volleyExplosionDamage = 0
      for (let droneIndex = 0; droneIndex < normalStacks.length; droneIndex += 1) {
        if (mask & (1 << droneIndex)) {
          volleyExplosionDamage += explosionDamage
        } else {
          normalDamage += normalDamageByStack[normalStacks[droneIndex]]
          normalStacks[droneIndex] = Math.min(normalStacks[droneIndex] + 1, input.model.droneMaxStack)
        }
      }
      // Keep component addition, HP subtraction and the relative kill tolerance
      // in precisely the same order as runTrial in goldenglowTargetSwitch.ts.
      const rawDamage = normalDamage + volleyExplosionDamage + bodyDamage
      const effectiveDamage = Math.min(hp, rawDamage)
      const hpRemainder = Math.max(0, hp - effectiveDamage)
      const killTolerance = Number.EPSILON * Math.max(hp, rawDamage) * 4
      const killed = rawDamage > 0 && hpRemainder <= killTolerance
      trialDamage += rawDamage
      if (killed) {
        kills += 1
        hp = enemyHp
        normalStacks.fill(0)
      } else {
        hp = hpRemainder
      }
    }
    total += trialDamage
  }
  return total / input.trials
}

/** Replays the same PRD pattern, resolving body then drones exactly as runTrial. */
function calculateMeanRetargetingDamage(
  { input, normalDamageByStack, explosionDamage, bodyDamage, timeTolerance }: GoldenglowTargetSwitchPreparedSimulation,
  enemyHp: number,
  patterns: Uint16Array,
  maxVolleys: number,
): number {
  const normalStacks = new Uint16Array(input.model.activeDroneCount)
  const firstActor = input.skillIndex === 3 ? 0 : -1
  let total = 0
  for (let trialIndex = 0; trialIndex < input.trials; trialIndex += 1) {
    normalStacks.fill(0)
    let hp = enemyHp
    let killingVolleys = 0
    let trialDamage = 0
    const offset = trialIndex * maxVolleys
    for (let volley = 0; volley < maxVolleys; volley += 1) {
      const nextTime = (volley + 1) * input.attackInterval + killingVolleys * input.switchDelay
      if (nextTime > input.duration + timeTolerance) break
      const mask = patterns[offset + volley]
      let normalDamage = 0
      let volleyExplosionDamage = 0
      let killedInVolley = false
      for (let actor = firstActor; actor < normalStacks.length; actor += 1) {
        let damage: number
        if (actor === -1) {
          damage = bodyDamage
        } else if (mask & (1 << actor)) {
          damage = explosionDamage
          volleyExplosionDamage += damage
        } else {
          damage = normalDamageByStack[normalStacks[actor]]
          normalDamage += damage
          normalStacks[actor] = Math.min(normalStacks[actor] + 1, input.model.droneMaxStack)
        }
        const effectiveDamage = Math.min(hp, damage)
        const hpRemainder = Math.max(0, hp - effectiveDamage)
        const killTolerance = Number.EPSILON * Math.max(hp, damage) * 4
        if (damage > 0 && hpRemainder <= killTolerance) {
          killedInVolley = true
          hp = enemyHp
          normalStacks.fill(0)
        } else {
          hp = hpRemainder
        }
      }
      // The main engine sums components in this order even for sequential hits.
      trialDamage += normalDamage + volleyExplosionDamage + bodyDamage
      if (killedInVolley) killingVolleys += 1
    }
    total += trialDamage
  }
  return total / input.trials
}

function validateAxes(input: GoldenglowTargetSwitchGridInput): void {
  const limits = GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS
  if (!input || !Array.isArray(input.enemyHps) || !Array.isArray(input.enemyResistances)) {
    throw new RangeError('HPと術耐性の値を配列で指定してください。')
  }
  if (input.enemyHps.length === 0 || input.enemyHps.length > limits.maxHpColumns) {
    throw new RangeError(`HPは1〜${limits.maxHpColumns}点で指定してください。`)
  }
  if (input.enemyResistances.length === 0 || input.enemyResistances.length > limits.maxResistanceRows) {
    throw new RangeError(`術耐性は1〜${limits.maxResistanceRows}点で指定してください。`)
  }
  if (input.enemyHps.length * input.enemyResistances.length > limits.maxCells) {
    throw new RangeError(`表は${limits.maxCells}マス以内にしてください。HPまたは術耐性の点数を減らしてください。`)
  }
  for (const hp of input.enemyHps) {
    if (!Number.isFinite(hp) || hp <= 0 || hp > GOLDENGLOW_TARGET_SWITCH_LIMITS.maxEnemyHp) {
      throw new RangeError('敵HPは0より大きく1,000,000,000以下の数値で指定してください。')
    }
  }
  for (const resistance of input.enemyResistances) {
    if (!Number.isFinite(resistance) || resistance < 0 || resistance > GOLDENGLOW_TARGET_SWITCH_LIMITS.maxEnemyResistance) {
      throw new RangeError('敵の術耐性は0〜100の数値で指定してください。')
    }
  }
}

function validateWorkload(input: GoldenglowTargetSwitchInput, maxVolleys: number, uniqueCells: number): void {
  const limits = GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS
  const patternCount = maxVolleys * input.trials
  if (patternCount * Uint16Array.BYTES_PER_ELEMENT > limits.maxPatternBytes) {
    throw new RangeError('表の抽選データが大きすぎます。計測時間・試行回数を減らすか、攻撃間隔を長くしてください。')
  }
  // Include the shared draw generation as well as each distinct cell's replay.
  if (patternCount * input.model.activeDroneCount * (uniqueCells + 1) > limits.maxDroneOpportunities) {
    throw new RangeError('表全体の計算量が上限を超えています。HP・術耐性の点数、計測時間・試行回数を減らすか、攻撃間隔を長くしてください。')
  }
}

function localizeInputError(message: string): string {
  const labels: Record<string, string> = {
    'model.activeDroneCount': '浮遊ユニット数',
    'model.resistanceIgnoreFixed': '術耐性の固定無視',
    'model.prdStep': '爆発確率の増加量',
    'model.prdMaxStack': '爆発の最大連続不発回数',
    'model.droneInitialAttackScale': '浮遊ユニットの初回倍率',
    'model.droneAttackScaleStep': '浮遊ユニットの倍率増加量',
    'model.droneMaxAttackScale': '浮遊ユニットの倍率上限',
    'model.droneMaxStack': '浮遊ユニットの最大倍率段階',
    'model.attackScale': '爆発の攻撃倍率',
    'model.damageType': 'ダメージ種別',
    skillIndex: 'スキル番号', effectiveAttack: '攻撃力', attackInterval: '攻撃間隔',
    duration: '計測時間', enemyHp: '敵HP', enemyDefense: '敵の防御力', enemyResistance: '敵の術耐性',
    switchDelay: '切り替えの追加時間', retargetRemainingDrones: '残りの浮遊ユニットの攻撃先変更',
    trials: '試行回数', seed: '抽選番号',
    ARTS: '術ダメージ',
  }
  for (const [key, label] of Object.entries(labels)) message = message.replaceAll(key, label)
  return message
}
