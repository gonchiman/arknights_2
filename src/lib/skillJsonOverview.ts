import {
  analyzeDescriptionPlaceholders,
  createSkillJsonSelectionKey,
  diffBlackboards,
  getSkillLevelLabel,
  type BlackboardDiffKind,
} from './skillJsonAnalysis.ts'
import type { RawBlackboardEntry, RawSkillLevel, SkillRecord } from '../types/skill'

export const SKILL_JSON_OVERVIEW_SCOPES = ['ALL_LEVELS', 'FINAL_LEVEL'] as const

export type SkillJsonOverviewScope = typeof SKILL_JSON_OVERVIEW_SCOPES[number]
export type SkillJsonRawKeyStatus = 'PRESENT' | 'EMPTY' | 'BLANK' | 'MISSING'
export type SkillJsonValueShape = 'VALUE_ONLY' | 'VALUE_STR_ONLY' | 'BOTH' | 'NEITHER'
export type SkillJsonQualitySeverity = 'WARNING' | 'INFO'
export type SkillJsonQualityCode =
  | 'INVALID_BLACKBOARD_COLLECTION'
  | 'INVALID_BLACKBOARD_ENTRY'
  | 'INVALID_KEY_TYPE'
  | 'MISSING_KEY'
  | 'EMPTY_KEY'
  | 'BLANK_KEY'
  | 'DUPLICATE_KEY'
  | 'BOTH_VALUE_FIELDS'
  | 'NO_VALUE_FIELDS'
  | 'UNREFERENCED_ENTRY'
  | 'UNMATCHED_PLACEHOLDER'

export interface SkillJsonValueShapeCounts {
  VALUE_ONLY: number
  VALUE_STR_ONLY: number
  BOTH: number
  NEITHER: number
}

export interface SkillJsonDiffCounts {
  ADDED: number
  REMOVED: number
  CHANGED: number
  UNCHANGED: number
  valueChanged: number
  valueStrChanged: number
}

export interface SkillJsonOverviewExample {
  placementKey: string
  operatorId: string
  operatorName: string
  skillIndex: number
  skillId: string
  skillName: string
  levelIndex: number
  levelLabel: string
  blackboardIndex?: number
  relatedBlackboardIndexes?: number[]
  entry?: RawBlackboardEntry
  placeholder?: string
}

export interface SkillJsonKeyInventoryItem {
  id: string
  key: string | null
  keyStatus: SkillJsonRawKeyStatus
  semanticStatus: 'UNINTERPRETED'
  searchText: string
  placementCount: number
  distinctSkillIdCount: number
  operatorCount: number
  levelCount: number
  distinctSkillLevelCount: number
  entryCount: number
  referencedEntryCount: number
  unreferencedEntryCount: number
  placeholderReferenceCount: number
  duplicateLevelCount: number
  duplicateExtraEntryCount: number
  valueShapes: SkillJsonValueShapeCounts
  examples: SkillJsonOverviewExample[]
}

export interface SkillJsonUnmatchedPlaceholderItem {
  id: string
  placeholder: string
  rawKey: string
  lookupKey: string
  format: string | null
  negative: boolean
  occurrenceCount: number
  placementCount: number
  distinctSkillIdCount: number
  levelCount: number
  examples: SkillJsonOverviewExample[]
}

export interface SkillJsonQualityFinding {
  code: SkillJsonQualityCode
  severity: SkillJsonQualitySeverity
  message: string
  occurrenceCount: number
  placementCount: number
  distinctSkillIdCount: number
  levelCount: number
  examples: SkillJsonOverviewExample[]
}

export interface SkillJsonDiffExample extends SkillJsonOverviewExample {
  fromLevelIndex: number
  fromLevelLabel: string
  toLevelIndex: number
  toLevelLabel: string
  occurrence: number
  kind: BlackboardDiffKind
  before: RawBlackboardEntry | null
  after: RawBlackboardEntry | null
}

export interface SkillJsonKeyDiffItem {
  id: string
  key: string | null
  keyStatus: SkillJsonRawKeyStatus
  semanticStatus: 'UNINTERPRETED'
  placementCount: number
  distinctSkillIdCount: number
  transitionCount: number
  counts: SkillJsonDiffCounts
  examples: SkillJsonDiffExample[]
}

export interface SkillJsonAdjacentLevelDiffs {
  transitionCount: number
  comparedKeyOccurrenceCount: number
  counts: SkillJsonDiffCounts
  byKey: SkillJsonKeyDiffItem[]
}

export interface SkillJsonOverviewSummary {
  scope: SkillJsonOverviewScope
  operatorCount: number
  placementCount: number
  distinctSkillIdCount: number
  levelCount: number
  distinctSkillLevelCount: number
  blackboardEntryCount: number
  rawKeyCount: number
  nonEmptyRawKeyCount: number
  placeholderOccurrenceCount: number
  unmatchedPlaceholderOccurrenceCount: number
  unmatchedPlaceholderCount: number
  unreferencedEntryCount: number
  qualityFindingOccurrenceCount: number
  qualityFindingCategoryCount: number
  valueShapes: SkillJsonValueShapeCounts
  adjacentLevelTransitionCount: number
}

export interface SkillJsonOverview {
  scope: SkillJsonOverviewScope
  summary: SkillJsonOverviewSummary
  keyInventory: SkillJsonKeyInventoryItem[]
  unmatchedPlaceholders: SkillJsonUnmatchedPlaceholderItem[]
  dataQualityFindings: SkillJsonQualityFinding[]
  adjacentLevelDiffs: SkillJsonAdjacentLevelDiffs
}

interface LevelContext {
  skill: SkillRecord
  placementKey: string
  level: RawSkillLevel
  levelIndex: number
  levelLabel: string
}

interface RawKeyDescriptor {
  id: string
  key: string | null
  status: SkillJsonRawKeyStatus
}

interface MutableKeyInventoryItem {
  descriptor: RawKeyDescriptor
  searchTerms: Set<string>
  placementIds: Set<string>
  skillIds: Set<string>
  operatorIds: Set<string>
  levelIds: Set<string>
  distinctSkillLevelIds: Set<string>
  entryCount: number
  referencedEntryCount: number
  unreferencedEntryCount: number
  placeholderReferenceCount: number
  duplicateLevelIds: Set<string>
  duplicateExtraEntryCount: number
  valueShapes: SkillJsonValueShapeCounts
  examples: SkillJsonOverviewExample[]
}

interface MutableUnmatchedPlaceholderItem {
  id: string
  placeholder: string
  rawKey: string
  lookupKey: string
  format: string | null
  negative: boolean
  occurrenceCount: number
  placementIds: Set<string>
  skillIds: Set<string>
  levelIds: Set<string>
  examples: SkillJsonOverviewExample[]
}

interface MutableQualityFinding {
  code: SkillJsonQualityCode
  severity: SkillJsonQualitySeverity
  message: string
  occurrenceCount: number
  placementIds: Set<string>
  skillIds: Set<string>
  levelIds: Set<string>
  examples: SkillJsonOverviewExample[]
}

interface MutableKeyDiffItem {
  descriptor: RawKeyDescriptor
  placementIds: Set<string>
  skillIds: Set<string>
  transitionIds: Set<string>
  counts: SkillJsonDiffCounts
  examples: SkillJsonDiffExample[]
}

type BlackboardReadIssueCode = Extract<
  SkillJsonQualityCode,
  'INVALID_BLACKBOARD_COLLECTION' | 'INVALID_BLACKBOARD_ENTRY' | 'INVALID_KEY_TYPE'
>

interface BlackboardReadResult {
  entries: RawBlackboardEntry[]
  sourceIndexes: number[]
  rawEntryCount: number
  issues: Array<{
    code: BlackboardReadIssueCode
    blackboardIndex?: number
  }>
}

const MAX_EXAMPLES = 3

const QUALITY_DEFINITIONS: Record<SkillJsonQualityCode, {
  severity: SkillJsonQualitySeverity
  message: string
}> = {
  INVALID_BLACKBOARD_COLLECTION: {
    severity: 'WARNING',
    message: 'blackboard が配列ではないため、このレベルのentryを集計できません。',
  },
  INVALID_BLACKBOARD_ENTRY: {
    severity: 'WARNING',
    message: 'blackboard にobjectではないentryがあります。このentryは集計から除外します。',
  },
  INVALID_KEY_TYPE: {
    severity: 'WARNING',
    message: 'blackboard entry の key が文字列ではありません。このentryは集計から除外します。',
  },
  MISSING_KEY: {
    severity: 'WARNING',
    message: 'blackboard entry に key フィールドがありません。',
  },
  EMPTY_KEY: {
    severity: 'WARNING',
    message: 'blackboard entry の key が空文字です。',
  },
  BLANK_KEY: {
    severity: 'WARNING',
    message: 'blackboard entry の key が空白文字だけです。raw key は変更せず保持します。',
  },
  DUPLICATE_KEY: {
    severity: 'WARNING',
    message: '同じレベルの blackboard に完全一致する key が複数あります。',
  },
  BOTH_VALUE_FIELDS: {
    severity: 'INFO',
    message: '同じentryに数値のvalueと非空のvalueStrの両方があります。',
  },
  NO_VALUE_FIELDS: {
    severity: 'WARNING',
    message: 'blackboard entry に value と valueStr のどちらもありません。',
  },
  UNREFERENCED_ENTRY: {
    severity: 'INFO',
    message: 'blackboard entry は同じレベルの description から参照されていません。未使用とは断定しません。',
  },
  UNMATCHED_PLACEHOLDER: {
    severity: 'WARNING',
    message: 'description placeholder に対応する blackboard entry がありません。',
  },
}

const QUALITY_ORDER: SkillJsonQualityCode[] = [
  'INVALID_BLACKBOARD_COLLECTION',
  'INVALID_BLACKBOARD_ENTRY',
  'INVALID_KEY_TYPE',
  'MISSING_KEY',
  'EMPTY_KEY',
  'BLANK_KEY',
  'DUPLICATE_KEY',
  'NO_VALUE_FIELDS',
  'BOTH_VALUE_FIELDS',
  'UNMATCHED_PLACEHOLDER',
  'UNREFERENCED_ENTRY',
]

export function buildSkillJsonOverview(
  rows: readonly SkillRecord[],
  scope: SkillJsonOverviewScope = 'ALL_LEVELS',
): SkillJsonOverview {
  const normalizedScope = SKILL_JSON_OVERVIEW_SCOPES.includes(scope) ? scope : 'ALL_LEVELS'
  const placements = getUniquePlacements(rows)
  const inventory = new Map<string, MutableKeyInventoryItem>()
  const unmatched = new Map<string, MutableUnmatchedPlaceholderItem>()
  const findings = new Map<SkillJsonQualityCode, MutableQualityFinding>()
  const keyDiffs = new Map<string, MutableKeyDiffItem>()
  const operatorIds = new Set<string>()
  const distinctSkillIds = new Set<string>()
  const scopedLevelIds = new Set<string>()
  const distinctSkillLevelIds = new Set<string>()
  const overallValueShapes = emptyValueShapeCounts()
  const overallDiffCounts = emptyDiffCounts()
  let blackboardEntryCount = 0
  let placeholderOccurrenceCount = 0
  let unmatchedPlaceholderOccurrenceCount = 0
  let unreferencedEntryCount = 0
  let adjacentLevelTransitionCount = 0
  let comparedKeyOccurrenceCount = 0

  for (const skill of placements) {
    const placementKey = createSkillJsonSelectionKey(skill)
    const levels = getRetainedLevels(skill)
    operatorIds.add(skill.operatorId)
    distinctSkillIds.add(skill.skillId)

    for (const levelIndex of getScopedLevelIndexes(levels.length, normalizedScope)) {
      const level = levels[levelIndex]
      if (!level) continue
      const context = createLevelContext(skill, placementKey, level, levelIndex, levels.length)
      const levelId = createPlacementLevelId(placementKey, levelIndex)
      const distinctSkillLevelId = createDistinctSkillLevelId(skill.skillId, levelIndex)
      const blackboardRead = readBlackboardEntries(level)
      const blackboard = blackboardRead.entries
      const analysis = analyzeDescriptionPlaceholders(
        typeof level.description === 'string' ? level.description : '',
        blackboard,
      )

      scopedLevelIds.add(levelId)
      distinctSkillLevelIds.add(distinctSkillLevelId)
      blackboardEntryCount += blackboardRead.rawEntryCount
      placeholderOccurrenceCount += analysis.placeholders.length

      blackboardRead.issues.forEach((issue) => {
        addQualityFinding(
          findings,
          issue.code,
          context,
          createExample(context, issue.blackboardIndex === undefined
            ? {}
            : { blackboardIndex: issue.blackboardIndex }),
        )
      })

      const duplicateIndexes = new Map<string, number[]>()

      analysis.blackboardRows.forEach((row) => {
        const sourceIndex = blackboardRead.sourceIndexes[row.index] ?? row.index
        const descriptor = describeRawKey(row.entry)
        const item = getOrCreateInventoryItem(inventory, descriptor)
        const shape = getValueShape(row.entry)
        const example = createExample(context, {
          blackboardIndex: sourceIndex,
          entry: { ...row.entry },
        })

        item.placementIds.add(placementKey)
        item.skillIds.add(skill.skillId)
        item.operatorIds.add(skill.operatorId)
        item.searchTerms.add(skill.operatorName)
        item.searchTerms.add(skill.operatorId)
        item.searchTerms.add(skill.skillName)
        item.searchTerms.add(skill.skillId)
        item.levelIds.add(levelId)
        item.distinctSkillLevelIds.add(distinctSkillLevelId)
        item.entryCount += 1
        item.valueShapes[shape] += 1
        overallValueShapes[shape] += 1
        addExample(item.examples, example)

        if (row.referencedBy.length > 0) {
          item.referencedEntryCount += 1
          item.placeholderReferenceCount += row.referencedBy.length
        } else {
          item.unreferencedEntryCount += 1
          unreferencedEntryCount += 1
          addQualityFinding(findings, 'UNREFERENCED_ENTRY', context, example)
        }

        if (descriptor.status === 'MISSING') {
          addQualityFinding(findings, 'MISSING_KEY', context, example)
        } else if (descriptor.status === 'EMPTY') {
          addQualityFinding(findings, 'EMPTY_KEY', context, example)
        } else if (descriptor.status === 'BLANK') {
          addQualityFinding(findings, 'BLANK_KEY', context, example)
        }

        if (
          typeof row.entry.value === 'number'
          && typeof row.entry.valueStr === 'string'
          && row.entry.valueStr.length > 0
        ) {
          addQualityFinding(findings, 'BOTH_VALUE_FIELDS', context, example)
        } else if (shape === 'NEITHER') {
          addQualityFinding(findings, 'NO_VALUE_FIELDS', context, example)
        }

        const indexes = duplicateIndexes.get(descriptor.id) ?? []
        indexes.push(row.index)
        duplicateIndexes.set(descriptor.id, indexes)
      })

      duplicateIndexes.forEach((indexes, descriptorId) => {
        if (indexes.length < 2) return
        const item = inventory.get(descriptorId)
        if (!item) return
        item.duplicateLevelIds.add(levelId)
        item.duplicateExtraEntryCount += indexes.length - 1
        addQualityFinding(
          findings,
          'DUPLICATE_KEY',
          context,
          createExample(context, {
            blackboardIndex: blackboardRead.sourceIndexes[indexes[0]] ?? indexes[0],
            relatedBlackboardIndexes: indexes.map(
              (index) => blackboardRead.sourceIndexes[index] ?? index,
            ),
            entry: { ...blackboard[indexes[0]] },
          }),
        )
      })

      analysis.placeholders.forEach((placeholder) => {
        if (placeholder.status !== 'UNMATCHED') return
        unmatchedPlaceholderOccurrenceCount += 1
        const example = createExample(context, { placeholder: placeholder.placeholder })
        const placeholderId = JSON.stringify([
          placeholder.placeholder,
          placeholder.rawKey,
          placeholder.lookupKey,
          placeholder.format,
          placeholder.negative,
        ])
        let item = unmatched.get(placeholderId)
        if (!item) {
          item = {
            id: placeholderId,
            placeholder: placeholder.placeholder,
            rawKey: placeholder.rawKey,
            lookupKey: placeholder.lookupKey,
            format: placeholder.format,
            negative: placeholder.negative,
            occurrenceCount: 0,
            placementIds: new Set<string>(),
            skillIds: new Set<string>(),
            levelIds: new Set<string>(),
            examples: [],
          }
          unmatched.set(placeholderId, item)
        }
        item.occurrenceCount += 1
        item.placementIds.add(placementKey)
        item.skillIds.add(skill.skillId)
        item.levelIds.add(levelId)
        addExample(item.examples, example)
        addQualityFinding(findings, 'UNMATCHED_PLACEHOLDER', context, example)
      })
    }

    for (const [fromLevelIndex, toLevelIndex] of getAdjacentLevelPairs(levels.length, normalizedScope)) {
      const beforeLevel = levels[fromLevelIndex]
      const afterLevel = levels[toLevelIndex]
      if (!beforeLevel || !afterLevel) continue
      const transitionId = JSON.stringify([placementKey, fromLevelIndex, toLevelIndex])
      const afterContext = createLevelContext(
        skill,
        placementKey,
        afterLevel,
        toLevelIndex,
        levels.length,
      )
      const diff = diffBlackboards(
        readBlackboardEntries(beforeLevel).entries,
        readBlackboardEntries(afterLevel).entries,
      )

      adjacentLevelTransitionCount += 1
      comparedKeyOccurrenceCount += diff.length

      diff.forEach((row) => {
        const descriptor = describeDiffKey(row.key)
        const item = getOrCreateKeyDiffItem(keyDiffs, descriptor)
        const example: SkillJsonDiffExample = {
          ...createExample(afterContext),
          fromLevelIndex,
          fromLevelLabel: getSkillLevelLabel(fromLevelIndex, levels.length),
          toLevelIndex,
          toLevelLabel: getSkillLevelLabel(toLevelIndex, levels.length),
          occurrence: row.occurrence,
          kind: row.kind,
          before: row.before ? { ...row.before } : null,
          after: row.after ? { ...row.after } : null,
        }

        item.placementIds.add(placementKey)
        item.skillIds.add(skill.skillId)
        item.transitionIds.add(transitionId)
        item.counts[row.kind] += 1
        overallDiffCounts[row.kind] += 1
        if (row.changedFields.includes('value')) {
          item.counts.valueChanged += 1
          overallDiffCounts.valueChanged += 1
        }
        if (row.changedFields.includes('valueStr')) {
          item.counts.valueStrChanged += 1
          overallDiffCounts.valueStrChanged += 1
        }
        if (row.kind !== 'UNCHANGED') addExample(item.examples, example)
      })
    }
  }

  const keyInventory = [...inventory.values()]
    .map(finalizeInventoryItem)
    .sort(compareRawKeyItems)
  const unmatchedPlaceholders = [...unmatched.values()]
    .map((item): SkillJsonUnmatchedPlaceholderItem => ({
      id: item.id,
      placeholder: item.placeholder,
      rawKey: item.rawKey,
      lookupKey: item.lookupKey,
      format: item.format,
      negative: item.negative,
      occurrenceCount: item.occurrenceCount,
      placementCount: item.placementIds.size,
      distinctSkillIdCount: item.skillIds.size,
      levelCount: item.levelIds.size,
      examples: item.examples,
    }))
    .sort((a, b) => a.placeholder.localeCompare(b.placeholder, 'ja'))
  const dataQualityFindings = QUALITY_ORDER
    .map((code) => findings.get(code))
    .filter((item): item is MutableQualityFinding => item !== undefined)
    .map((item): SkillJsonQualityFinding => ({
      code: item.code,
      severity: item.severity,
      message: item.message,
      occurrenceCount: item.occurrenceCount,
      placementCount: item.placementIds.size,
      distinctSkillIdCount: item.skillIds.size,
      levelCount: item.levelIds.size,
      examples: item.examples,
    }))
  const byKey = [...keyDiffs.values()]
    .map((item): SkillJsonKeyDiffItem => ({
      id: item.descriptor.id,
      key: item.descriptor.key,
      keyStatus: item.descriptor.status,
      semanticStatus: 'UNINTERPRETED',
      placementCount: item.placementIds.size,
      distinctSkillIdCount: item.skillIds.size,
      transitionCount: item.transitionIds.size,
      counts: { ...item.counts },
      examples: item.examples,
    }))
    .sort(compareRawKeyItems)
  const qualityFindingOccurrenceCount = dataQualityFindings.reduce(
    (total, finding) => total + finding.occurrenceCount,
    0,
  )

  return {
    scope: normalizedScope,
    summary: {
      scope: normalizedScope,
      operatorCount: operatorIds.size,
      placementCount: placements.length,
      distinctSkillIdCount: distinctSkillIds.size,
      levelCount: scopedLevelIds.size,
      distinctSkillLevelCount: distinctSkillLevelIds.size,
      blackboardEntryCount,
      rawKeyCount: keyInventory.length,
      nonEmptyRawKeyCount: keyInventory.filter((item) => item.keyStatus === 'PRESENT').length,
      placeholderOccurrenceCount,
      unmatchedPlaceholderOccurrenceCount,
      unmatchedPlaceholderCount: unmatchedPlaceholders.length,
      unreferencedEntryCount,
      qualityFindingOccurrenceCount,
      qualityFindingCategoryCount: dataQualityFindings.length,
      valueShapes: { ...overallValueShapes },
      adjacentLevelTransitionCount,
    },
    keyInventory,
    unmatchedPlaceholders,
    dataQualityFindings,
    adjacentLevelDiffs: {
      transitionCount: adjacentLevelTransitionCount,
      comparedKeyOccurrenceCount,
      counts: { ...overallDiffCounts },
      byKey,
    },
  }
}

function getUniquePlacements(rows: readonly SkillRecord[]): SkillRecord[] {
  const placements = new Map<string, SkillRecord>()
  rows.forEach((row) => {
    const key = createSkillJsonSelectionKey(row)
    if (!placements.has(key)) placements.set(key, row)
  })
  return [...placements.values()]
}

function getRetainedLevels(skill: SkillRecord): RawSkillLevel[] {
  if (Array.isArray(skill.skillLevels) && skill.skillLevels.length > 0) return skill.skillLevels
  return skill.raw ? [skill.raw] : []
}

function getScopedLevelIndexes(total: number, scope: SkillJsonOverviewScope): number[] {
  if (total <= 0) return []
  if (scope === 'FINAL_LEVEL') return [total - 1]
  return Array.from({ length: total }, (_, index) => index)
}

function getAdjacentLevelPairs(total: number, scope: SkillJsonOverviewScope): Array<[number, number]> {
  if (total < 2) return []
  if (scope === 'FINAL_LEVEL') return [[total - 2, total - 1]]
  return Array.from({ length: total - 1 }, (_, index) => [index, index + 1])
}

function readBlackboardEntries(level: RawSkillLevel): BlackboardReadResult {
  const rawBlackboard = (level as { blackboard?: unknown }).blackboard
  if (rawBlackboard === undefined) {
    return { entries: [], sourceIndexes: [], rawEntryCount: 0, issues: [] }
  }
  if (!Array.isArray(rawBlackboard)) {
    return {
      entries: [],
      sourceIndexes: [],
      rawEntryCount: 0,
      issues: [{ code: 'INVALID_BLACKBOARD_COLLECTION' }],
    }
  }

  const entries: RawBlackboardEntry[] = []
  const sourceIndexes: number[] = []
  const issues: BlackboardReadResult['issues'] = []

  rawBlackboard.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      issues.push({ code: 'INVALID_BLACKBOARD_ENTRY', blackboardIndex: index })
      return
    }
    const rawKey = (entry as Record<string, unknown>).key
    if (
      Object.hasOwn(entry, 'key')
      && rawKey !== undefined
      && rawKey !== null
      && typeof rawKey !== 'string'
    ) {
      issues.push({ code: 'INVALID_KEY_TYPE', blackboardIndex: index })
      return
    }
    entries.push(entry as RawBlackboardEntry)
    sourceIndexes.push(index)
  })

  return {
    entries,
    sourceIndexes,
    rawEntryCount: rawBlackboard.length,
    issues,
  }
}

function createLevelContext(
  skill: SkillRecord,
  placementKey: string,
  level: RawSkillLevel,
  levelIndex: number,
  totalLevels: number,
): LevelContext {
  return {
    skill,
    placementKey,
    level,
    levelIndex,
    levelLabel: getSkillLevelLabel(levelIndex, totalLevels),
  }
}

function createExample(
  context: LevelContext,
  details: Partial<Pick<
    SkillJsonOverviewExample,
    'blackboardIndex' | 'relatedBlackboardIndexes' | 'entry' | 'placeholder'
  >> = {},
): SkillJsonOverviewExample {
  return {
    placementKey: context.placementKey,
    operatorId: context.skill.operatorId,
    operatorName: context.skill.operatorName,
    skillIndex: context.skill.skillIndex,
    skillId: context.skill.skillId,
    skillName: context.skill.skillName,
    levelIndex: context.levelIndex,
    levelLabel: context.levelLabel,
    ...details,
  }
}

function describeRawKey(entry: RawBlackboardEntry): RawKeyDescriptor {
  if (!Object.hasOwn(entry, 'key') || entry.key === undefined || entry.key === null) {
    return { id: JSON.stringify(['MISSING']), key: null, status: 'MISSING' }
  }
  if (entry.key === '') {
    return { id: JSON.stringify(['KEY', '']), key: '', status: 'EMPTY' }
  }
  if (entry.key.trim() === '') {
    return { id: JSON.stringify(['KEY', entry.key]), key: entry.key, status: 'BLANK' }
  }
  return { id: JSON.stringify(['KEY', entry.key]), key: entry.key, status: 'PRESENT' }
}

function describeDiffKey(key: string | null): RawKeyDescriptor {
  return key === null ? describeRawKey({}) : describeRawKey({ key })
}

function getValueShape(entry: RawBlackboardEntry): SkillJsonValueShape {
  const hasValue = Object.hasOwn(entry, 'value')
  const hasValueStr = Object.hasOwn(entry, 'valueStr')
  if (hasValue && hasValueStr) return 'BOTH'
  if (hasValue) return 'VALUE_ONLY'
  if (hasValueStr) return 'VALUE_STR_ONLY'
  return 'NEITHER'
}

function getOrCreateInventoryItem(
  inventory: Map<string, MutableKeyInventoryItem>,
  descriptor: RawKeyDescriptor,
): MutableKeyInventoryItem {
  const existing = inventory.get(descriptor.id)
  if (existing) return existing
  const item: MutableKeyInventoryItem = {
    descriptor,
    searchTerms: new Set<string>(),
    placementIds: new Set<string>(),
    skillIds: new Set<string>(),
    operatorIds: new Set<string>(),
    levelIds: new Set<string>(),
    distinctSkillLevelIds: new Set<string>(),
    entryCount: 0,
    referencedEntryCount: 0,
    unreferencedEntryCount: 0,
    placeholderReferenceCount: 0,
    duplicateLevelIds: new Set<string>(),
    duplicateExtraEntryCount: 0,
    valueShapes: emptyValueShapeCounts(),
    examples: [],
  }
  inventory.set(descriptor.id, item)
  return item
}

function finalizeInventoryItem(item: MutableKeyInventoryItem): SkillJsonKeyInventoryItem {
  return {
    id: item.descriptor.id,
    key: item.descriptor.key,
    keyStatus: item.descriptor.status,
    semanticStatus: 'UNINTERPRETED',
    searchText: [...item.searchTerms].join(' '),
    placementCount: item.placementIds.size,
    distinctSkillIdCount: item.skillIds.size,
    operatorCount: item.operatorIds.size,
    levelCount: item.levelIds.size,
    distinctSkillLevelCount: item.distinctSkillLevelIds.size,
    entryCount: item.entryCount,
    referencedEntryCount: item.referencedEntryCount,
    unreferencedEntryCount: item.unreferencedEntryCount,
    placeholderReferenceCount: item.placeholderReferenceCount,
    duplicateLevelCount: item.duplicateLevelIds.size,
    duplicateExtraEntryCount: item.duplicateExtraEntryCount,
    valueShapes: { ...item.valueShapes },
    examples: item.examples,
  }
}

function addQualityFinding(
  findings: Map<SkillJsonQualityCode, MutableQualityFinding>,
  code: SkillJsonQualityCode,
  context: LevelContext,
  example: SkillJsonOverviewExample,
): void {
  const definition = QUALITY_DEFINITIONS[code]
  let finding = findings.get(code)
  if (!finding) {
    finding = {
      code,
      severity: definition.severity,
      message: definition.message,
      occurrenceCount: 0,
      placementIds: new Set<string>(),
      skillIds: new Set<string>(),
      levelIds: new Set<string>(),
      examples: [],
    }
    findings.set(code, finding)
  }
  finding.occurrenceCount += 1
  finding.placementIds.add(context.placementKey)
  finding.skillIds.add(context.skill.skillId)
  finding.levelIds.add(createPlacementLevelId(context.placementKey, context.levelIndex))
  addExample(finding.examples, example)
}

function getOrCreateKeyDiffItem(
  items: Map<string, MutableKeyDiffItem>,
  descriptor: RawKeyDescriptor,
): MutableKeyDiffItem {
  const existing = items.get(descriptor.id)
  if (existing) return existing
  const item: MutableKeyDiffItem = {
    descriptor,
    placementIds: new Set<string>(),
    skillIds: new Set<string>(),
    transitionIds: new Set<string>(),
    counts: emptyDiffCounts(),
    examples: [],
  }
  items.set(descriptor.id, item)
  return item
}

function emptyValueShapeCounts(): SkillJsonValueShapeCounts {
  return { VALUE_ONLY: 0, VALUE_STR_ONLY: 0, BOTH: 0, NEITHER: 0 }
}

function emptyDiffCounts(): SkillJsonDiffCounts {
  return {
    ADDED: 0,
    REMOVED: 0,
    CHANGED: 0,
    UNCHANGED: 0,
    valueChanged: 0,
    valueStrChanged: 0,
  }
}

function createPlacementLevelId(placementKey: string, levelIndex: number): string {
  return JSON.stringify([placementKey, levelIndex])
}

function createDistinctSkillLevelId(skillId: string, levelIndex: number): string {
  return JSON.stringify([skillId, levelIndex])
}

function addExample<T>(examples: T[], example: T): void {
  if (examples.length < MAX_EXAMPLES) examples.push(example)
}

function compareRawKeyItems(
  a: Pick<SkillJsonKeyInventoryItem, 'key' | 'keyStatus'>,
  b: Pick<SkillJsonKeyInventoryItem, 'key' | 'keyStatus'>,
): number {
  const statusOrder: Record<SkillJsonRawKeyStatus, number> = {
    PRESENT: 0,
    EMPTY: 1,
    BLANK: 2,
    MISSING: 3,
  }
  return statusOrder[a.keyStatus] - statusOrder[b.keyStatus]
    || (a.key ?? '').localeCompare(b.key ?? '', 'ja')
}
