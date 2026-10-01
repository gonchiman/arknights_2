const numericFields = [
  'base', 'trust', 'module', 'skill', 'res', 'ignore', 'modIgnore',
  'minimum', 'multiplier', 'interval', 'speed', 'speedAdd',
] as const

type NumericField = typeof numericFields[number]
export type ManualDamageField = NumericField | 'attackRound' | 'damageRound'
export type ManualDamageInputs = Record<ManualDamageField, string>
export type ManualDamageStep = {
  label: string
  expression: string | null
  status: 'ready' | 'pending' | 'invalid'
}
export type ManualDamageStage = {
  id: 'base' | 'attack' | 'resistance' | 'damage' | 'interval'
  title: string
  steps: ManualDamageStep[]
}
export type ManualDamageResult = {
  stages: ManualDamageStage[]
  errors: Partial<Record<ManualDamageField, string>>
  damage: string | null
  dps: string | null
}

export function createEmptyManualDamageInputs(): ManualDamageInputs {
  return {
    base: '', trust: '', module: '', skill: '', attackRound: '',
    res: '', ignore: '', modIgnore: '', minimum: '', multiplier: '',
    damageRound: '', interval: '', speed: '', speedAdd: '',
  }
}

type Rational = { numerator: bigint; denominator: bigint }
type Value =
  | { status: 'ready'; value: Rational }
  | { status: 'pending' }
  | { status: 'invalid' }

function rational(numerator: bigint, denominator = 1n): Rational {
  let a = numerator < 0n ? -numerator : numerator
  let b = denominator
  while (b !== 0n) [a, b] = [b, a % b]
  return { numerator: numerator / a, denominator: denominator / a }
}

const zero = rational(0n)
const one = rational(1n)
const hundred = rational(100n)
const ready = (value: Rational): Value => ({ status: 'ready', value })
const add = (a: Rational, b: Rational) => rational(
  a.numerator * b.denominator + b.numerator * a.denominator,
  a.denominator * b.denominator,
)
const subtract = (a: Rational, b: Rational) => rational(
  a.numerator * b.denominator - b.numerator * a.denominator,
  a.denominator * b.denominator,
)
const multiply = (a: Rational, b: Rational) => rational(
  a.numerator * b.numerator, a.denominator * b.denominator,
)
const divide = (a: Rational, b: Rational) => rational(
  a.numerator * b.denominator, a.denominator * b.numerator,
)
const greater = (a: Rational, b: Rational) => (
  a.numerator * b.denominator > b.numerator * a.denominator
)
const maximum = (a: Rational, b: Rational) => greater(a, b) ? a : b

// Keep decimal inputs exact through both rounding operations and the DPS division.
function parseDecimal(text: string): Rational | null {
  const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(text)
  if (!match) return null
  const exponent = Number(match[3] ?? 0)
  if (text.length > 1000 || !Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) return null
  const [integer, fraction = ''] = match[2].split('.')
  const digits = BigInt((integer || '0') + fraction) * (match[1] === '-' ? -1n : 1n)
  const scale = fraction.length - exponent
  return scale >= 0
    ? rational(digits, 10n ** BigInt(scale))
    : rational(digits * 10n ** BigInt(-scale))
}

// A repeating decimal is an exact fraction, never a rounded value after an equals sign.
function format(value: Rational): string {
  if (value.denominator === 1n) return String(value.numerator)
  let remainder = value.denominator
  let twos = 0
  let fives = 0
  while (remainder % 2n === 0n) { remainder /= 2n; twos += 1 }
  while (remainder % 5n === 0n) { remainder /= 5n; fives += 1 }
  if (remainder !== 1n) return `${value.numerator} / ${value.denominator}`
  const precision = Math.max(twos, fives)
  const absolute = value.numerator < 0n ? -value.numerator : value.numerator
  const scaled = absolute * (10n ** BigInt(precision)) / value.denominator
  const digits = String(scaled).padStart(precision + 1, '0')
  const integer = digits.slice(0, -precision)
  const fraction = digits.slice(-precision).replace(/0+$/, '')
  return `${value.numerator < 0n ? '-' : ''}${integer}.${fraction}`
}

function derive(values: Value[], calculate: (...values: Rational[]) => Rational): Value {
  if (values.some(value => value.status === 'invalid')) return { status: 'invalid' }
  if (values.some(value => value.status === 'pending')) return { status: 'pending' }
  return ready(calculate(...values.map(value => (value as { value: Rational }).value)))
}

const roundLabels = {
  none: '丸めない',
  floor: '小数点以下を切り捨て',
  round: '整数に四捨五入',
} as const
type RoundRule = keyof typeof roundLabels

function isRoundRule(text: string): text is RoundRule {
  return Object.hasOwn(roundLabels, text)
}

export function calculateManualDamage(inputs: ManualDamageInputs): ManualDamageResult {
  const errors: ManualDamageResult['errors'] = {}
  const values = {} as Record<NumericField, Value>
  for (const field of numericFields) {
    const text = inputs[field].trim()
    if (text === '') {
      values[field] = { status: 'pending' }
      continue
    }
    const value = parseDecimal(text)
    if (value === null || value.numerator < 0n) {
      errors[field] = '0以上の数値を入力してください。'
    } else if ((field === 'res' || field === 'minimum') && greater(value, hundred)) {
      errors[field] = '0以上100以下で入力してください。'
    } else if (field === 'interval' && value.numerator === 0n) {
      errors[field] = '0より大きい数値を入力してください。'
    }
    values[field] = errors[field] ? { status: 'invalid' } : ready(value!)
  }

  const rounding = (field: 'attackRound' | 'damageRound', value: Value): Value => {
    const rule = inputs[field]
    if (rule !== '' && !isRoundRule(rule)) {
      errors[field] = '端数処理を選択してください。'
      return { status: 'invalid' }
    }
    if (value.status === 'invalid') return value
    if (rule === '' || value.status === 'pending') return { status: 'pending' }
    const number = value.value
    if (rule === 'none') return value
    if (rule === 'floor') return ready(rational(number.numerator / number.denominator))
    return ready(rational((2n * number.numerator + number.denominator) / (2n * number.denominator)))
  }

  const total = derive([values.base, values.trust, values.module], (a, b, c) => add(add(a, b), c))
  const skillRate = derive([values.skill], value => divide(value, hundred))
  const skillFactor = derive([skillRate], value => add(one, value))
  const rawAttack = derive([total, skillFactor], multiply)
  const attack = rounding('attackRound', rawAttack)
  const ignoreTotal = derive([values.ignore, values.modIgnore], add)
  const rawResistance = derive([values.res, ignoreTotal], subtract)
  const resistance = derive([rawResistance], value => maximum(zero, value))
  const resistanceRate = derive([resistance], value => divide(value, hundred))
  const damageFactor = derive([resistanceRate], value => subtract(one, value))
  const reducedDamage = derive([attack, damageFactor], multiply)
  const minimumRate = derive([values.minimum], value => divide(value, hundred))
  const minimumDamage = derive([attack, minimumRate], multiply)
  const guaranteedDamage = derive([reducedDamage, minimumDamage], maximum)
  const rawDamage = derive([guaranteedDamage, values.multiplier], multiply)
  const damage = rounding('damageRound', rawDamage)
  let speedTotal = derive([values.speed, values.speedAdd], add)
  if (speedTotal.status === 'ready' && speedTotal.value.numerator === 0n) {
    errors.speed = '基礎攻撃速度と加算の合計を0より大きくしてください。'
    errors.speedAdd = errors.speed
    speedTotal = { status: 'invalid' }
  }
  const speedFactor = derive([speedTotal], value => divide(value, hundred))
  const interval = derive([values.interval, speedFactor], divide)
  const dps = derive([damage, interval], divide)

  const shown = (value: Value) => value.status === 'ready' ? format(value.value) : ''
  const step = (label: string, result: Value, expression: () => string): ManualDamageStep => ({
    label,
    expression: result.status === 'ready' ? `${expression()} ＝ ${shown(result)}` : null,
    status: result.status,
  })
  const roundLabel = (field: 'attackRound' | 'damageRound') => {
    const rule = inputs[field]
    return isRoundRule(rule) ? roundLabels[rule] : '端数処理を選択'
  }

  return {
    stages: [
      {
        id: 'base', title: '攻撃力の合計', steps: [
          step('基礎 ＋ 信頼 ＋ MOD', total, () => `${shown(values.base)} ＋ ${shown(values.trust)} ＋ ${shown(values.module)}`),
        ],
      },
      {
        id: 'attack', title: 'スキルによる増加', steps: [
          step('％を小数にする', skillRate, () => `${shown(values.skill)} ÷ 100`),
          step('元の1倍に加える', skillFactor, () => `1 ＋ ${shown(skillRate)}`),
          step('合計攻撃力に掛ける', rawAttack, () => `${shown(total)} × ${shown(skillFactor)}`),
          step(roundLabel('attackRound'), attack, () => `${roundLabel('attackRound')}(${shown(rawAttack)})`),
        ],
      },
      {
        id: 'resistance', title: '術耐性の計算', steps: [
          step('無視する固定値を合計', ignoreTotal, () => `${shown(values.ignore)} ＋ ${shown(values.modIgnore)}`),
          step('敵の術耐性から引く', rawResistance, () => `${shown(values.res)} − ${shown(ignoreTotal)}`),
          step('0未満なら0にする', resistance, () => `0 と ${shown(rawResistance)} の大きい方`),
          step('軽減される割合', resistanceRate, () => `${shown(resistance)} ÷ 100`),
          step('ダメージに掛ける割合', damageFactor, () => `1 − ${shown(resistanceRate)}`),
        ],
      },
      {
        id: 'damage', title: '一撃のダメージ', steps: [
          step('術耐性による軽減後', reducedDamage, () => `${shown(attack)} × ${shown(damageFactor)}`),
          step('最低保証の％を小数にする', minimumRate, () => `${shown(values.minimum)} ÷ 100`),
          step('最低保証のダメージ', minimumDamage, () => `${shown(attack)} × ${shown(minimumRate)}`),
          step('軽減後と最低保証の大きい方', guaranteedDamage, () => `${shown(reducedDamage)} と ${shown(minimumDamage)} の大きい方`),
          step('追加ダメージ倍率', rawDamage, () => `${shown(guaranteedDamage)} × ${shown(values.multiplier)}`),
          step(roundLabel('damageRound'), damage, () => `${roundLabel('damageRound')}(${shown(rawDamage)})`),
        ],
      },
      {
        id: 'interval', title: '攻撃間隔とDPS', steps: [
          step('基礎攻撃速度 ＋ 加算', speedTotal, () => `${shown(values.speed)} ＋ ${shown(values.speedAdd)}`),
          step('基準100に対する速度倍率', speedFactor, () => `${shown(speedTotal)} ÷ 100`),
          step('補正後の攻撃間隔（秒）', interval, () => `${shown(values.interval)} ÷ ${shown(speedFactor)}`),
          step('一撃のダメージ ÷ 攻撃間隔', dps, () => `${shown(damage)} ÷ (${shown(values.interval)} ÷ ${shown(speedFactor)})`),
        ],
      },
    ],
    errors,
    damage: damage.status === 'ready' ? shown(damage) : null,
    dps: dps.status === 'ready' ? shown(dps) : null,
  }
}
