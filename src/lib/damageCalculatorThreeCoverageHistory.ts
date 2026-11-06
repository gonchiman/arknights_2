import type { SkillRecord } from '../types/skill.ts'
import type { DamageCalculatorThreeCoverageRow, DamageCalculatorThreeCoverageStatus } from './damageCalculatorThreeCoverage.ts'
import { getExpandedDefinition } from './expandedCombatRegistry.ts'

export type CoverageSkill = Pick<SkillRecord, 'id' | 'operatorId' | 'operatorName' | 'skillId' | 'skillIndex'
  | 'skillName' | 'profession' | 'professionLabel' | 'rarity' | 'subProfessionName'>
export interface CoverageRecord extends Omit<DamageCalculatorThreeCoverageRow, 'skill'> {
  readonly skill: CoverageSkill
  readonly conditionsLabel?: string
}
export interface CoverageSource {
  codeRevision: string
  codeDirty: boolean
  codeFingerprint: string
  gameDataRevision: string
  gameDataFingerprint: string
  reconstructed: boolean
}
export interface CoverageSnapshot {
  schemaVersion: 1
  id: string
  label: string
  capturedAt: string
  source: CoverageSource
  rows: CoverageRecord[]
}
export interface CoverageVersionInfo extends Omit<CoverageSnapshot, 'rows'> {
  file: string
  sha256: string
  skillCount: number
  counts: Record<Exclude<DamageCalculatorThreeCoverageStatus, 'NOT_APPLICABLE'>, number> & { NOT_APPLICABLE?: number }
}
export interface CoverageIndex { schemaVersion: 1; versions: CoverageVersionInfo[] }
export interface CoverageChange {
  key: string
  kind: 'ADDED' | 'CHANGED' | 'REMOVED'
  before?: CoverageRecord
  after?: CoverageRecord
  fields: string[]
}

const LEGACY_STATUSES = ['SUPPORTED', 'CONDITIONAL', 'PENDING', 'UNSUPPORTED'] as const
const STATUSES = [...LEGACY_STATUSES, 'NOT_APPLICABLE'] as const
const SKILL_TEXT_FIELDS = ['id', 'operatorId', 'operatorName', 'skillId', 'skillName', 'profession', 'professionLabel', 'subProfessionName'] as const
const LIST_FIELDS = ['calculationScope', 'supportedConditions', 'deferredReasons', 'scopeNotes'] as const

/** A slot is stable across level changes and renamed/replaced skill IDs. Never join on skillId alone. */
export const coverageRecordKey = (row: Pick<CoverageRecord, 'skill'>): string =>
  JSON.stringify([row.skill.operatorId, row.skill.skillIndex])

/** Frozen display records deliberately exclude mutable live profiles and the calculation engine. */
export function toCoverageRecords(rows: readonly DamageCalculatorThreeCoverageRow[],
  phaseIndexForOperator: (operatorId: string) => number | undefined = id => getExpandedDefinition(id)?.phaseIndex,
): CoverageRecord[] {
  return rows.map(row => {
    const skill = Object.fromEntries(([...SKILL_TEXT_FIELDS, 'skillIndex', 'rarity'] as const)
      .map(key => [key, row.skill[key]])) as CoverageSkill
    const phase = phaseIndexForOperator(skill.operatorId) ?? 2
    const level = row.selection?.levelIndex
    const conditionsLabel = level === undefined ? undefined : `昇進${phase}・Lv${row.skill.operatorProfile.phases[phase]?.maxLevel ?? '—'}・信頼100・${
      level >= 7 ? `特化${level - 6}` : `スキルLv${level + 1}`}・潜在1・MODなし`
    return structuredClone({ ...row, skill, ...(conditionsLabel ? { conditionsLabel } : {}) })
  }).sort((a, b) => coverageRecordKey(a).localeCompare(coverageRecordKey(b)))
}

/** Canonical objects for immutable file signatures; array ordering is preserved here. */
export function canonicalCoverageJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalCoverageJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalCoverageJson(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

const unordered = (value: readonly unknown[]): string => canonicalCoverageJson(value.map(canonicalCoverageJson).sort())

/** Compare reported coverage, not capture timestamps or the order of explanatory lists. */
export function diffCoverageRecords(before: readonly CoverageRecord[], after: readonly CoverageRecord[]): CoverageChange[] {
  const previous = uniqueRecordMap(before)
  const current = uniqueRecordMap(after)
  const result: CoverageChange[] = []
  for (const key of [...new Set([...previous.keys(), ...current.keys()])].sort()) {
    const old = previous.get(key), next = current.get(key)
    if (!old || !next) {
      result.push({ key, kind: old ? 'REMOVED' : 'ADDED', ...(old ? { before: old } : {}),
        ...(next ? { after: next } : {}), fields: ['カタログ'] })
      continue
    }
    const fields: string[] = []
    const { id: _oldId, ...oldSkill } = old.skill
    const { id: _newId, ...newSkill } = next.skill
    if (canonicalCoverageJson(oldSkill) !== canonicalCoverageJson(newSkill)) fields.push('スキル情報')
    if (old.status !== next.status) fields.push('総合')
    for (const [section, label] of [['skill', 'スキル'], ['talent', '素質'], ['trait', '特性']] as const) {
      const entries = (row: CoverageRecord) => row.details.filter(detail => section === 'talent'
        ? detail.id.startsWith('talent-') : detail.id === section)
      if (old.sections[section] !== next.sections[section] || unordered(entries(old)) !== unordered(entries(next))) fields.push(label)
    }
    if (canonicalCoverageJson(old.selection) !== canonicalCoverageJson(next.selection)
      || old.conditionsLabel !== next.conditionsLabel) fields.push('計算条件')
    for (const [field, label] of [['calculationScope', '計算範囲'], ['supportedConditions', '対応条件'],
      ['deferredReasons', '保留理由'], ['scopeNotes', '対象範囲']] as const) {
      if (unordered(old[field]) !== unordered(next[field])) fields.push(label)
    }
    const issues = (row: CoverageRecord) => row.issues.map(issue => {
      const prefix = issue.stages?.length ? `${issue.stages.join('・')}：` : ''
      return { ...issue, reason: prefix && issue.reason.startsWith(prefix) ? issue.reason.slice(prefix.length) : issue.reason,
        relatedSections: [...issue.relatedSections].sort(), ...(issue.stages ? { stages: [...issue.stages].sort() } : {}) }
    })
    if (unordered(issues(old)) !== unordered(issues(next))) fields.push('保留事項')
    if (fields.length) result.push({ key, kind: 'CHANGED', before: old, after: next, fields })
  }
  return result
}

function uniqueRecordMap(rows: readonly CoverageRecord[]): Map<string, CoverageRecord> {
  const map = new Map<string, CoverageRecord>()
  for (const row of rows) {
    const key = coverageRecordKey(row)
    if (map.has(key)) throw new Error('実装範囲のスキルが重複しています。')
    map.set(key, row)
  }
  return map
}

export function countCoverageRecords(rows: readonly CoverageRecord[]): CoverageVersionInfo['counts'] {
  const counts: CoverageVersionInfo['counts'] = { SUPPORTED: 0, CONDITIONAL: 0, PENDING: 0, UNSUPPORTED: 0 }
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1
  return counts
}

function valid(test: unknown): asserts test { if (!test) throw new Error('実装範囲の保存データが不正です。') }
function object(value: unknown): Record<string, unknown> {
  valid(value !== null && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}
function string(value: unknown, allowEmpty = false): asserts value is string {
  valid(typeof value === 'string' && (allowEmpty || value.trim().length > 0))
}
function strings(value: unknown): asserts value is string[] {
  valid(Array.isArray(value) && value.every(item => typeof item === 'string'))
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  valid(Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max)
}
function status(value: unknown): void {
  valid(STATUSES.includes(value as never))
}
function metadata(value: Record<string, unknown>): void {
  valid(value.schemaVersion === 1 && typeof value.id === 'string' && /^v[1-9]\d*$/.test(value.id))
  string(value.label); string(value.capturedAt)
  valid(Number.isFinite(Date.parse(value.capturedAt)))
  const source = object(value.source)
  for (const key of ['codeRevision', 'gameDataRevision']) string(source[key])
  for (const key of ['codeFingerprint', 'gameDataFingerprint']) valid(typeof source[key] === 'string' && /^[a-f0-9]{64}$/.test(source[key]))
  valid(typeof source.codeDirty === 'boolean' && typeof source.reconstructed === 'boolean')
}
function parseRecord(value: unknown): CoverageRecord {
  const row = object(value), skill = object(row.skill)
  for (const key of SKILL_TEXT_FIELDS) string(skill[key], key === 'subProfessionName')
  integer(skill.skillIndex, 1, 99); integer(skill.rarity, 1, 6)
  status(row.status)
  const sections = object(row.sections)
  for (const key of ['skill', 'talent', 'trait']) status(sections[key])
  for (const key of LIST_FIELDS) strings(row[key])
  if (row.conditionsLabel !== undefined) string(row.conditionsLabel)
  if (row.selection !== undefined) {
    const selection = object(row.selection)
    valid(selection.operatorId === skill.operatorId && selection.skillId === skill.skillId && selection.skillIndex === skill.skillIndex)
    integer(selection.levelIndex, 0, 9)
  }
  valid(Array.isArray(row.details) && row.details.length > 0)
  const detailIds = new Set<string>()
  for (const value of row.details) {
    const detail = object(value)
    string(detail.id); string(detail.label); string(detail.name); status(detail.status)
    valid(/^(skill|trait|talent-none|talent-[1-9]\d*)$/.test(detail.id))
    valid(!detailIds.has(detail.id)); detailIds.add(detail.id)
  }
  valid(detailIds.has('skill') && detailIds.has('trait'))
  valid(Array.isArray(row.issues))
  for (const value of row.issues) {
    const issue = object(value)
    string(issue.id); string(issue.reason); strings(issue.relatedSections)
    valid(issue.impact === 'BLOCKING' || issue.impact === 'OUTSIDE_SCOPE')
    for (const key of ['supportedCondition', 'currentTreatment']) if (issue[key] !== undefined) string(issue[key])
    if (issue.stages !== undefined) strings(issue.stages)
  }
  return structuredClone(row) as unknown as CoverageRecord
}

export function parseCoverageSnapshot(value: unknown): CoverageSnapshot {
  const snapshot = object(value)
  metadata(snapshot)
  valid(Array.isArray(snapshot.rows) && snapshot.rows.length > 0)
  const rows = snapshot.rows.map(parseRecord)
  uniqueRecordMap(rows)
  return { ...structuredClone(snapshot), rows } as unknown as CoverageSnapshot
}

export function parseCoverageIndex(value: unknown): CoverageIndex {
  const index = object(value)
  valid(index.schemaVersion === 1 && Array.isArray(index.versions))
  const ids = new Set<string>()
  for (const value of index.versions) {
    const version = object(value)
    metadata(version)
    const id = version.id as string
    valid(!ids.has(id)); ids.add(id)
    valid(version.file === `${id}.json`)
    valid(typeof version.sha256 === 'string' && /^[a-f0-9]{64}$/.test(version.sha256))
    integer(version.skillCount, 1)
    const counts = object(version.counts)
    for (const key of LEGACY_STATUSES) integer(counts[key], 0)
    if (counts.NOT_APPLICABLE !== undefined) integer(counts.NOT_APPLICABLE, 0)
    valid(STATUSES.reduce((sum, key) => sum + (counts[key] as number | undefined ?? 0), 0) === version.skillCount)
  }
  return structuredClone(index) as unknown as CoverageIndex
}

export function createCoverageHistoryClient({ base = '/', fetch: fetchOverride }: {
  base?: string; fetch?: typeof globalThis.fetch
} = {}) {
  const fetchData = fetchOverride ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args))
  const prefix = `${base.replace(/\/?$/, '/')}data/dc3-coverage/`
  async function loadIndex(signal?: AbortSignal): Promise<CoverageIndex> {
    const response = await fetchData(`${prefix}index.json`, { signal, cache: 'no-store' })
    if (!response.ok) throw new Error('実装範囲のバージョン一覧を取得できませんでした。')
    return parseCoverageIndex(await response.json())
  }
  async function loadSnapshot(version: CoverageVersionInfo, signal?: AbortSignal): Promise<CoverageSnapshot> {
    parseCoverageIndex({ schemaVersion: 1, versions: [version] })
    const response = await fetchData(`${prefix}${version.file}`, { signal })
    if (!response.ok) throw new Error(`${version.label}を取得できませんでした。`)
    const bytes = await response.arrayBuffer()
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      byte => byte.toString(16).padStart(2, '0')).join('')
    if (hash !== version.sha256) throw new Error('実装範囲の保存内容とバージョン情報が一致しません。')
    const snapshot = parseCoverageSnapshot(JSON.parse(new TextDecoder().decode(bytes)))
    const { file: _file, sha256: _sha, skillCount, counts, ...meta } = version
    const { rows, ...actualMeta } = snapshot
    if (canonicalCoverageJson(meta) !== canonicalCoverageJson(actualMeta) || skillCount !== rows.length
      || canonicalCoverageJson(counts) !== canonicalCoverageJson(countCoverageRecords(rows))) {
      throw new Error('実装範囲の保存内容とバージョン情報が一致しません。')
    }
    return snapshot
  }
  return { loadIndex, loadSnapshot }
}

const client = createCoverageHistoryClient({ base: import.meta.env?.BASE_URL ?? '/' })
export const loadCoverageIndex = (signal?: AbortSignal) => client.loadIndex(signal)
export const loadCoverageSnapshot = (version: CoverageVersionInfo, signal?: AbortSignal) => client.loadSnapshot(version, signal)
