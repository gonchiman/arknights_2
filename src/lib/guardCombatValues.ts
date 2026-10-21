import type { GuardConditions, GuardInput, GuardStage, GuardValue } from './guardCombatTypes.ts'

export function guardConditionMatches(condition: NonNullable<GuardStage['when']>, values: GuardConditions): boolean {
  const actual = values[condition.input]
  if (actual === undefined) throw new RangeError(`条件「${condition.input}」が未指定です。`)
  const expected = condition.value
  if (condition.comparison === 'EQ') return actual === expected
  if (typeof actual !== 'number' || typeof expected !== 'number' || !Number.isFinite(actual)) {
    throw new RangeError(`条件「${condition.input}」には数値が必要です。`)
  }
  return condition.comparison === 'LT' ? actual < expected : condition.comparison === 'LTE' ? actual <= expected
    : condition.comparison === 'GT' ? actual > expected : actual >= expected
}

export function resolveGuardValue(value: GuardValue, board: ReadonlyMap<string, number>, conditions: GuardConditions): number {
  let result: number
  if (typeof value === 'number') result = value
  else if ('key' in value) {
    const stored = board.get(value.key.toLowerCase())
    if (stored === undefined) throw new RangeError(`参照値「${value.key}」を取得できません。`)
    result = stored
  } else if ('op' in value && value.op === 'if') {
    result = resolveGuardValue(guardConditionMatches(value, conditions) ? value.yes : value.no, board, conditions)
  } else if ('input' in value) {
    const selected = conditions[value.input]
    if (typeof selected !== 'number') throw new RangeError(`数値条件「${value.input}」が未指定です。`)
    result = selected
  } else {
    if (!value.args.length) throw new RangeError('空の計算式は使用できません。')
    const args = value.args.map(argument => resolveGuardValue(argument, board, conditions))
    result = value.op === 'add' ? args.reduce((a, b) => a + b, 0)
      : value.op === 'mul' ? args.reduce((a, b) => a * b, 1)
        : value.op === 'min' ? Math.min(...args) : Math.max(...args)
  }
  if (!Number.isFinite(result)) throw new RangeError('計算式から有限の値を取得できません。')
  return result
}

export function resolveGuardConditions(inputs: readonly GuardInput[], supplied: GuardConditions): {
  values: Record<string, number | string | boolean>; errors: string[]
} {
  const values: Record<string, number | string | boolean> = {}
  const errors: string[] = []
  for (const input of inputs) {
    const value = supplied[input.key] === undefined ? input.defaultValue : supplied[input.key]!
    values[input.key] = value
    if (input.kind === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)
        || (input.min !== undefined && value < input.min) || (input.max !== undefined && value > input.max)
        || (input.step === 1 && !Number.isSafeInteger(value))) errors.push(`「${input.label}」を指定範囲の${input.step === 1 ? '整数' : '数値'}で入力してください。`)
    } else if (input.kind === 'boolean') {
      if (typeof value !== 'boolean') errors.push(`「${input.label}」を選択してください。`)
    } else if (!input.options?.some(option => option.value === value)) errors.push(`「${input.label}」を選択してください。`)
  }
  return { values, errors }
}

export function mergeGuardInputs(...groups: readonly (readonly GuardInput[])[]): GuardInput[] {
  const inputs = new Map<string, GuardInput>()
  for (const group of groups) for (const input of group) {
    const existing = inputs.get(input.key)
    if (existing && (existing.kind !== input.kind || existing.min !== input.min || existing.max !== input.max)) {
      throw new RangeError(`条件「${input.key}」の定義が一致していません。`)
    }
    inputs.set(input.key, input)
  }
  return [...inputs.values()]
}
