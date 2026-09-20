import { splitPassiveDescriptionChanges } from './passiveDescriptionChanges.ts'

export type EffectChangeSource = 'module' | 'potential' | 'both'

export interface EffectChangeSegment {
  text: string
  source: EffectChangeSource | null
  values?: {
    base: string
    withoutModule: string
    withoutPotential: string
    current: string
  }
}

interface EffectDescriptions {
  base: string
  withoutModule: string
  withoutPotential: string
  current: string
}

const numberPattern = '[+\\-−＋－]?\\p{Nd}+(?:[.．]\\p{Nd}+)?[%％]?'
const signedNumberPattern = '[+\\-−＋－]\\p{Nd}+(?:[.．]\\p{Nd}+)?[%％]?'
const numericToken = new RegExp(`^${numberPattern}$`, 'u')

/** Attribute changes by independently removing each effect from the current build. */
export function splitOperatorEffectChanges(descriptions: EffectDescriptions): EffectChangeSegment[] {
  const { withoutModule, withoutPotential, current } = descriptions
  if (!current) return []

  const moduleChanges = changedCharacters(withoutModule, current)
  const potentialChanges = changedCharacters(withoutPotential, current)
  const numericValues = matchingNumericValues(descriptions)
  const result: EffectChangeSegment[] = []
  let numberIndex = 0
  for (const match of current.matchAll(new RegExp(`${numberPattern}|[\\s\\S]`, 'gu'))) {
    const text = match[0]
    const start = match.index
    const moduleChanged = moduleChanges.slice(start, start + text.length).some(Boolean)
    const potentialChanged = potentialChanges.slice(start, start + text.length).some(Boolean)
    const source = moduleChanged && potentialChanged ? 'both'
      : moduleChanged ? 'module' : potentialChanged ? 'potential' : null
    const values = numericToken.test(text) ? numericValues?.[numberIndex++] : undefined
    const segment: EffectChangeSegment = { text, source }
    if (source && values) segment.values = values
    const previous = result.at(-1)
    if (previous?.source === source && !previous.values && !segment.values) previous.text += text
    else result.push(segment)
  }
  return result
}

function changedCharacters(before: string, current: string): boolean[] {
  return splitPassiveDescriptionChanges(before, current)
    .flatMap((segment) => Array<boolean>(segment.text.length).fill(segment.changed))
}

/** Numeric-only substitutions have unambiguous corresponding slots. */
function matchingNumericValues(descriptions: EffectDescriptions): EffectChangeSegment['values'][] | null {
  const entries = (['base', 'withoutModule', 'withoutPotential', 'current'] as const).map((key) => {
    const description = descriptions[key]
    const numbers = Array.from(description.matchAll(new RegExp(numberPattern, 'gu')), (match) => match[0])
    const structure = description.replace(new RegExp(numberPattern, 'gu'), '\u0000')
    return { key, numbers, structure }
  })
  if (entries.some((entry) => entry.structure !== entries[0].structure)) return null
  return entries[0].numbers.map((_, index) => Object.fromEntries(
    entries.map((entry) => [entry.key, entry.numbers[index]]),
  ) as NonNullable<EffectChangeSegment['values']>)
}

interface DescriptionToken {
  text: string
  number?: string
  annotation?: string
  delta?: string
}

function descriptionTokens(description: string): DescriptionToken[] {
  const annotationPattern = `(?:\\(${signedNumberPattern}\\)|（${signedNumberPattern}）)`
  const parts = description.match(new RegExp(`${numberPattern}${annotationPattern}?|[\\s\\S]`, 'gu')) ?? []
  const numericPart = new RegExp(`^(${numberPattern})(${annotationPattern})?$`, 'u')
  return parts.map((text) => {
    const match = numericPart.exec(text)
    return match ? { text, number: match[1], annotation: match[2], delta: match[2]?.slice(1, -1) } : { text }
  })
}

/** Remove newly introduced, verifiable potential deltas, never gameplay parentheses. */
export function removePotentialBonusAnnotations(current: string, withoutPotential: string): string {
  const previous = descriptionTokens(withoutPotential)
  const next = descriptionTokens(current)
  if (!next.some((token) => token.annotation)) return current
  const matches = alignNumericSlots(previous, next)
  return next.map((token, index) => {
    if (!token.annotation || !token.number || !token.delta) return token.text
    const before = previous[matches.get(index) ?? -1]
    // An annotation already attached to this value is part of the original text.
    if (!before?.number || before.annotation) return token.text
    const oldValue = parseNumber(before.number)
    const newValue = parseNumber(token.number)
    const delta = parseNumber(token.delta)
    if (!oldValue || !newValue || !delta || oldValue.percent !== newValue.percent || delta.percent !== newValue.percent) return token.text
    const expected = oldValue.value + delta.value
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(expected), Math.abs(newValue.value)) * 8
    return Math.abs(expected - newValue.value) <= tolerance ? token.number : token.text
  }).join('')
}

function parseNumber(text: string): { value: number; percent: boolean } | null {
  const normalized = text.normalize('NFKC').replace(/−/g, '-')
  const value = Number(normalized.replace(/%$/, ''))
  return Number.isFinite(value) ? { value, percent: normalized.endsWith('%') } : null
}

/** Match numeric slots in their surrounding prose while allowing their values to change. */
function alignNumericSlots(previous: DescriptionToken[], current: DescriptionToken[]): Map<number, number> {
  const equal = (left: DescriptionToken, right: DescriptionToken) => left.number && right.number
    ? true : left.text === right.text
  const lengths = Array.from({ length: previous.length + 1 }, () => new Uint32Array(current.length + 1))
  for (let i = previous.length - 1; i >= 0; i -= 1) {
    for (let j = current.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = equal(previous[i], current[j])
        ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }
  const result = new Map<number, number>()
  let i = 0
  let j = 0
  while (i < previous.length && j < current.length) {
    if (equal(previous[i], current[j])) {
      if (current[j].number) result.set(j, i)
      i += 1
      j += 1
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) i += 1
    else j += 1
  }
  return result
}
