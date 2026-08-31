import type { EnemyLevelType, EnemyRatings, EnemyRecord, EnemyStats } from '../types/enemy'

const BASE = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/jp/gamedata'

export const ENEMY_DATA_URLS = {
  handbook: `${BASE}/excel/enemy_handbook_table.json`,
  database: `${BASE}/levels/enemydata/enemy_database.json`,
}

export interface EnemyFilters {
  query: string
  levelType: EnemyLevelType | 'ALL'
}

type UnknownRecord = Record<string, unknown>

const EMPTY_STATS: EnemyStats = {
  maxHp: null,
  attack: null,
  defense: null,
  magicResistance: null,
  moveSpeed: null,
  attackSpeed: null,
  baseAttackTime: null,
  massLevel: null,
}

const IMMUNITY_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['stunImmune', 'スタン'],
  ['silenceImmune', '沈黙'],
  ['sleepImmune', '睡眠'],
  ['frozenImmune', '凍結'],
  ['levitateImmune', '浮遊'],
  ['disarmedCombatImmune', '武装解除'],
  ['fearedImmune', '恐怖'],
  ['palsyImmune', '麻痺'],
  ['attractImmune', '誘導'],
]

let enemyRecordsRequest: Promise<EnemyRecord[]> | null = null

export function loadEnemyRecords(): Promise<EnemyRecord[]> {
  if (enemyRecordsRequest) return enemyRecordsRequest

  const request = Promise.all([
    fetch(ENEMY_DATA_URLS.handbook),
    fetch(ENEMY_DATA_URLS.database),
  ]).then(async ([handbookResponse, databaseResponse]) => {
    if (!handbookResponse.ok || !databaseResponse.ok) {
      throw new Error('敵データの取得に失敗しました。')
    }

    const [handbook, database] = await Promise.all([
      handbookResponse.json() as Promise<unknown>,
      databaseResponse.json() as Promise<unknown>,
    ])
    return buildEnemyRecords(handbook, database)
  })

  enemyRecordsRequest = request.catch((cause) => {
    enemyRecordsRequest = null
    throw cause
  })
  return enemyRecordsRequest
}

export function buildEnemyRecords(handbookSource: unknown, databaseSource: unknown): EnemyRecord[] {
  const handbookRoot = asRecord(handbookSource)
  const handbookEntries = getEntries(handbookRoot?.enemyData)
  const database = buildDatabaseMap(databaseSource)
  const rows: EnemyRecord[] = []

  for (const [fallbackId, rawEntry] of handbookEntries) {
    const handbook = asRecord(rawEntry)
    if (!handbook || readBoolean(handbook.hideInHandbook) === true || readBoolean(handbook.isInvalidKilled) === true) continue

    const id = readString(handbook.enemyId) ?? fallbackId
    if (!id) continue

    const levels = database.get(id) ?? []
    const baseLevel = pickBaseLevel(levels)
    const enemyData = asRecord(baseLevel?.enemyData)
    const attributes = asRecord(enemyData?.attributes)
    const name = readString(handbook.name) ?? readString(enemyData?.name)
    if (!name) continue

    const description = cleanGameText(readString(handbook.description) ?? readString(enemyData?.description) ?? '')
    const abilities = readAbilities(handbook)
    const damageTypes = readStringArray(handbook.damageType)
    const levelType = parseEnemyLevelType(readString(handbook.enemyLevel) ?? readString(enemyData?.levelType))
    const stats = attributes ? readEnemyStats(attributes) : { ...EMPTY_STATS }

    rows.push({
      id,
      index: readString(handbook.enemyIndex) ?? '',
      sortId: readNumber(handbook.sortId) ?? Number.MAX_SAFE_INTEGER,
      name,
      levelType,
      description,
      abilities,
      damageTypes,
      attackWay: readString(handbook.attackType) ?? readString(enemyData?.applyWay),
      lifePointReduce: readNumber(enemyData?.lifePointReduce),
      databaseLevel: readNumber(baseLevel?.level),
      databaseLevelCount: levels.length,
      statusImmunities: readStatusImmunities(attributes),
      ratings: buildEnemyRatings(stats),
      stats,
    })
  }

  return rows.sort((a, b) => (
    a.sortId - b.sortId
    || a.index.localeCompare(b.index, 'ja', { numeric: true })
    || a.name.localeCompare(b.name, 'ja')
  ))
}

export function matchesEnemyFilters(enemy: EnemyRecord, filters: EnemyFilters): boolean {
  if (filters.levelType !== 'ALL' && enemy.levelType !== filters.levelType) return false

  const query = normalizeSearchText(filters.query)
  if (!query) return true

  return normalizeSearchText([
    enemy.name,
    enemy.index,
    enemy.id,
    enemy.description,
    ...enemy.abilities,
    ...enemy.statusImmunities,
  ].join(' ')).includes(query)
}

export function cleanGameText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildDatabaseMap(source: unknown): Map<string, UnknownRecord[]> {
  const result = new Map<string, UnknownRecord[]>()
  const root = asRecord(source)
  const container = root && 'enemies' in root ? root.enemies : source

  if (Array.isArray(container)) {
    for (const rawEntry of container) {
      const entry = asRecord(rawEntry)
      if (!entry) continue
      const id = readString(entry.Key) ?? readString(entry.key)
      const levels = normalizeLevels(entry.Value ?? entry.value)
      if (id && levels.length > 0) result.set(id, levels)
    }
    return result
  }

  for (const [id, rawLevels] of getEntries(container)) {
    const levels = normalizeLevels(rawLevels)
    if (levels.length > 0) result.set(id, levels)
  }
  return result
}

function normalizeLevels(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return []
  return value
    .map(asRecord)
    .filter((entry): entry is UnknownRecord => entry !== null)
    .sort((a, b) => (readNumber(a.level) ?? Number.MAX_SAFE_INTEGER) - (readNumber(b.level) ?? Number.MAX_SAFE_INTEGER))
}

function pickBaseLevel(levels: UnknownRecord[]): UnknownRecord | null {
  return levels.find((entry) => readNumber(entry.level) === 0) ?? levels[0] ?? null
}

function readEnemyStats(attributes: UnknownRecord): EnemyStats {
  return {
    maxHp: readNumber(attributes.maxHp),
    attack: readNumber(attributes.atk),
    defense: readNumber(attributes.def),
    magicResistance: readNumber(attributes.magicResistance),
    moveSpeed: readNumber(attributes.moveSpeed),
    attackSpeed: readNumber(attributes.attackSpeed),
    baseAttackTime: readNumber(attributes.baseAttackTime),
    massLevel: readNumber(attributes.massLevel),
  }
}

function buildEnemyRatings(stats: EnemyStats): EnemyRatings {
  return {
    endurance: getEnemyStatRating('maxHp', stats.maxHp),
    attack: getEnemyStatRating('attack', stats.attack),
    defense: getEnemyStatRating('defense', stats.defense),
    resistance: getEnemyStatRating('magicResistance', stats.magicResistance),
  }
}

export function getEnemyStatRating(
  stat: 'maxHp' | 'attack' | 'defense' | 'magicResistance',
  value: number | null,
): string | null {
  if (value === null || !Number.isFinite(value)) return null

  if (stat === 'maxHp') {
    if (value > 500000) return 'SS'
    if (value >= 250000) return 'S+'
    if (value >= 100000) return 'S'
    if (value >= 25000) return 'A+'
    if (value >= 12000) return 'A'
    if (value >= 8000) return 'B+'
    if (value >= 5000) return 'B'
    if (value >= 3500) return 'C'
    if (value >= 1000) return 'D'
    return 'E'
  }

  if (stat === 'attack') {
    if (value > 5000) return 'SS'
    if (value >= 3000) return 'S+'
    if (value >= 2000) return 'S'
    if (value >= 1500) return 'A+'
    if (value >= 1000) return 'A'
    if (value >= 700) return 'B+'
    if (value >= 500) return 'B'
    if (value >= 300) return 'C'
    if (value >= 200) return 'D'
    return 'E'
  }

  if (stat === 'defense') {
    if (value > 5000) return 'SS'
    if (value >= 3000) return 'S+'
    if (value >= 2000) return 'S'
    if (value >= 1200) return 'A+'
    if (value >= 1000) return 'A'
    if (value >= 800) return 'B+'
    if (value >= 500) return 'B'
    if (value >= 200) return 'C'
    if (value >= 100) return 'D'
    return 'E'
  }

  if (value > 90) return 'SS'
  if (value >= 80) return 'S+'
  if (value >= 70) return 'S'
  if (value >= 60) return 'A+'
  if (value >= 50) return 'A'
  if (value >= 30) return 'B+'
  if (value >= 20) return 'B'
  if (value >= 10) return 'C'
  if (value > 0) return 'D'
  return 'E'
}

function readStatusImmunities(attributes: UnknownRecord | null): string[] {
  if (!attributes) return []
  return IMMUNITY_FIELDS
    .filter(([key]) => readBoolean(attributes[key]) === true)
    .map(([, label]) => label)
}

function readAbilities(handbook: UnknownRecord): string[] {
  const result: string[] = []
  const abilityList = handbook.abilityList
  const candidates = Array.isArray(abilityList)
    ? abilityList
    : asRecord(abilityList)
      ? Object.values(abilityList as UnknownRecord)
      : []

  for (const candidate of candidates) {
    const text = typeof candidate === 'string' ? candidate : readString(asRecord(candidate)?.text)
    const cleaned = text ? cleanGameText(text) : ''
    if (cleaned) result.push(cleaned)
  }

  const legacyAbility = cleanGameText(readString(handbook.ability) ?? '')
  if (legacyAbility && !result.includes(legacyAbility)) result.push(legacyAbility)
  return result
}

function parseEnemyLevelType(value: string | null): EnemyLevelType {
  if (value === 'NORMAL' || value === 'ELITE' || value === 'BOSS') return value
  return 'UNKNOWN'
}

function readStringArray(value: unknown): string[] {
  const unwrapped = unwrapValue(value)
  if (!Array.isArray(unwrapped)) return []
  return unwrapped.filter((item): item is string => typeof item === 'string')
}

function readString(value: unknown): string | null {
  const unwrapped = unwrapValue(value)
  return typeof unwrapped === 'string' && unwrapped.trim() ? unwrapped : null
}

function readNumber(value: unknown): number | null {
  const unwrapped = unwrapValue(value)
  return typeof unwrapped === 'number' && Number.isFinite(unwrapped) ? unwrapped : null
}

function readBoolean(value: unknown): boolean | null {
  const unwrapped = unwrapValue(value)
  return typeof unwrapped === 'boolean' ? unwrapped : null
}

function unwrapValue(value: unknown): unknown {
  const wrapped = asRecord(value)
  if (!wrapped || !('m_value' in wrapped)) return value
  if ('m_defined' in wrapped && wrapped.m_defined !== true) return null
  return wrapped.m_value
}

function getEntries(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const record = asRecord(entry)
      return [readString(record?.enemyId) ?? String(index), entry]
    })
  }
  const record = asRecord(value)
  return record ? Object.entries(record) : []
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja')
}
