import type {
  RawBlackboardEntry,
  RawSkillLevel,
  SkillRecord,
} from '../types/skill'

export type PlaceholderMatchStatus = 'MATCHED' | 'UNMATCHED'
export type BlackboardSemanticStatus = 'UNINTERPRETED'
export type BlackboardDiffKind = 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED'
export type BlackboardDiffField = 'value' | 'valueStr'

export interface DescriptionPlaceholderMatch {
  occurrence: number
  placeholder: string
  rawKey: string
  lookupKey: string
  format: string | null
  negative: boolean
  status: PlaceholderMatchStatus
  blackboardIndex: number | null
  expandedValue: string | null
}

export interface BlackboardInspectionRow {
  index: number
  entry: RawBlackboardEntry
  referencedBy: DescriptionPlaceholderMatch[]
  semanticStatus: BlackboardSemanticStatus
}

export interface DescriptionAnalysis {
  sourceDescription: string
  expandedDescription: string
  placeholders: DescriptionPlaceholderMatch[]
  blackboardRows: BlackboardInspectionRow[]
}

export interface SkillLevelInspection extends DescriptionAnalysis {
  level: RawSkillLevel
  levelIndex: number
  levelLabel: string
}

export interface BlackboardDiffRow {
  id: string
  key: string | null
  occurrence: number
  kind: BlackboardDiffKind
  changedFields: BlackboardDiffField[]
  before: RawBlackboardEntry | null
  after: RawBlackboardEntry | null
}

type SkillSelectionIdentity = Pick<SkillRecord, 'operatorId' | 'skillIndex' | 'skillId'>

const PLACEHOLDER_PATTERN = /\{(-?[^{}:]+)(?::([^{}]+))?\}/g

export function createSkillJsonSelectionKey(skill: SkillSelectionIdentity): string {
  return JSON.stringify([skill.operatorId, skill.skillIndex, skill.skillId])
}

export function getSkillLevelLabel(index: number, total: number): string {
  if (total >= 10 && index >= 7) return `特化${index - 6}`
  return `Lv.${index + 1}`
}

export function inspectSkillLevel(skill: SkillRecord, requestedIndex: number): SkillLevelInspection {
  const lastIndex = Math.max(0, skill.skillLevels.length - 1)
  const levelIndex = Number.isFinite(requestedIndex)
    ? clamp(Math.round(requestedIndex), 0, lastIndex)
    : lastIndex
  const level = skill.skillLevels[levelIndex] ?? skill.raw
  const analysis = analyzeDescriptionPlaceholders(
    level.description ?? '',
    level.blackboard ?? [],
  )

  return {
    ...analysis,
    level,
    levelIndex,
    levelLabel: getSkillLevelLabel(levelIndex, skill.skillLevels.length),
  }
}

export function analyzeDescriptionPlaceholders(
  description: string,
  blackboard: RawBlackboardEntry[],
): DescriptionAnalysis {
  const entries = Array.isArray(blackboard) ? blackboard : []
  const placeholders: DescriptionPlaceholderMatch[] = []
  let expandedDescription = ''
  let cursor = 0

  for (const match of description.matchAll(PLACEHOLDER_PATTERN)) {
    const matchIndex = match.index ?? 0
    const placeholder = match[0]
    const rawKey = match[1]
    const format = match[2] ?? null
    const negative = rawKey.startsWith('-')
    const lookupKey = negative ? rawKey.slice(1) : rawKey
    const blackboardIndex = findBlackboardEntryIndex(entries, rawKey, lookupKey)
    const entry = blackboardIndex === null ? null : entries[blackboardIndex]
    const expandedValue = entry
      ? formatPlaceholderEntry(entry, negative, format ?? undefined)
      : null

    expandedDescription += description.slice(cursor, matchIndex)
    expandedDescription += expandedValue ?? placeholder
    cursor = matchIndex + placeholder.length

    placeholders.push({
      occurrence: placeholders.length + 1,
      placeholder,
      rawKey,
      lookupKey,
      format,
      negative,
      status: entry ? 'MATCHED' : 'UNMATCHED',
      blackboardIndex,
      expandedValue,
    })
  }

  expandedDescription += description.slice(cursor)

  return {
    sourceDescription: description,
    expandedDescription,
    placeholders,
    blackboardRows: entries.map((entry, index) => ({
      index,
      entry,
      referencedBy: placeholders.filter((placeholder) => placeholder.blackboardIndex === index),
      // Blackboard keys are intentionally not assigned gameplay semantics here.
      // In particular, a bare `times` key must never become a hit count automatically.
      semanticStatus: 'UNINTERPRETED',
    })),
  }
}

export function expandSkillDescription(
  description: string,
  blackboard: RawBlackboardEntry[],
): string {
  return analyzeDescriptionPlaceholders(description, blackboard).expandedDescription
}

export function diffBlackboards(
  beforeEntries: RawBlackboardEntry[],
  afterEntries: RawBlackboardEntry[],
): BlackboardDiffRow[] {
  const before = indexBlackboardEntries(Array.isArray(beforeEntries) ? beforeEntries : [])
  const after = indexBlackboardEntries(Array.isArray(afterEntries) ? afterEntries : [])
  const ids = [
    ...before.order,
    ...after.order.filter((id) => !before.byId.has(id)),
  ]

  return ids.map((id) => {
    const beforeEntry = before.byId.get(id) ?? null
    const afterEntry = after.byId.get(id) ?? null
    const indexedEntry = beforeEntry ?? afterEntry
    const changedFields: BlackboardDiffField[] = []

    if (beforeEntry && afterEntry) {
      if (!Object.is(beforeEntry.entry.value, afterEntry.entry.value)) changedFields.push('value')
      if (!Object.is(beforeEntry.entry.valueStr, afterEntry.entry.valueStr)) changedFields.push('valueStr')
    }

    const kind: BlackboardDiffKind = !beforeEntry
      ? 'ADDED'
      : !afterEntry
        ? 'REMOVED'
        : changedFields.length > 0
          ? 'CHANGED'
          : 'UNCHANGED'

    return {
      id,
      key: indexedEntry?.key ?? null,
      occurrence: indexedEntry?.occurrence ?? 1,
      kind,
      changedFields,
      before: beforeEntry?.entry ?? null,
      after: afterEntry?.entry ?? null,
    }
  })
}

function formatPlaceholderEntry(
  entry: RawBlackboardEntry,
  negative: boolean,
  format?: string,
): string | null {
  if (typeof entry.value !== 'number') return entry.valueStr || null

  const value = negative ? -entry.value : entry.value
  return formatBlackboardValue(value, format)
}

function formatBlackboardValue(value: number, format?: string): string {
  const percent = format?.includes('%') ?? false
  const decimalMatch = format?.match(/0\.(0+)/)
  const decimals = decimalMatch?.[1].length ?? (format?.includes('0') ? 0 : undefined)
  const normalized = percent ? value * 100 : value
  const formatted = decimals === undefined
    ? formatNumber(normalized)
    : normalized.toFixed(decimals)
  const signed = format?.includes('+') && normalized > 0 ? `+${formatted}` : formatted
  return percent ? `${signed}%` : signed
}

function findBlackboardEntryIndex(
  blackboard: RawBlackboardEntry[],
  rawKey: string,
  lookupKey: string,
): number | null {
  const exactIndex = findLastIndex(blackboard, (entry) => entry.key === rawKey)
  if (exactIndex !== -1) return exactIndex

  const normalizedIndex = findLastIndex(blackboard, (entry) => entry.key === lookupKey)
  return normalizedIndex === -1 ? null : normalizedIndex
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index
  }
  return -1
}

function indexBlackboardEntries(entries: RawBlackboardEntry[]) {
  const counts = new Map<string | null, number>()
  const byId = new Map<string, {
    entry: RawBlackboardEntry
    key: string | null
    occurrence: number
  }>()
  const order: string[] = []

  entries.forEach((entry) => {
    const key = entry.key ?? null
    const occurrence = (counts.get(key) ?? 0) + 1
    const id = JSON.stringify([key, occurrence])
    counts.set(key, occurrence)
    byId.set(id, { entry, key, occurrence })
    order.push(id)
  })

  return { byId, order }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
