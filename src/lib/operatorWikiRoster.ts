import { isRecord, isTimestamp, wikiPageTitle } from './operatorWikiViews.ts'

export const OPERATOR_WIKI_PROFESSIONS = [
  'PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL',
] as const

export type OperatorWikiProfession = typeof OPERATOR_WIKI_PROFESSIONS[number]

export type OperatorWikiRosterEntry = {
  operatorId: string
  name: string
  wikiUrl: string
  profession: OperatorWikiProfession
  rarity: number
}

export type OperatorWikiRosterSnapshot = {
  observedAt: string
  entries: readonly OperatorWikiRosterEntry[]
}

export function parseOperatorWikiRosterSnapshot(value: unknown): OperatorWikiRosterSnapshot {
  const invalid = 'Wiki オペレーター一覧のデータ形式が正しくありません。'
  if (!isRecord(value) || !isTimestamp(value.observedAt) || !Array.isArray(value.entries)) {
    throw new Error(invalid)
  }
  const ids = new Set<string>()
  const urls = new Set<string>()
  const professions = new Set<string>(OPERATOR_WIKI_PROFESSIONS)
  const entries = value.entries.map((entry: unknown): OperatorWikiRosterEntry => {
    if (!isRecord(entry)) throw new Error(invalid)
    const { operatorId, name, wikiUrl, profession, rarity } = entry
    const title = wikiPageTitle(wikiUrl)
    if (typeof operatorId !== 'string' || !operatorId.trim() || ids.has(operatorId)
        || typeof name !== 'string' || !name.trim() || name !== name.trim()
        || typeof wikiUrl !== 'string' || !title || urls.has(wikiUrl)
        || title.startsWith('コメント/') || title.includes('=')
        || typeof profession !== 'string' || !professions.has(profession)
        || typeof rarity !== 'number' || !Number.isInteger(rarity) || rarity < 1 || rarity > 6) {
      throw new Error(invalid)
    }
    ids.add(operatorId)
    urls.add(wikiUrl)
    return { operatorId, name, wikiUrl, profession: profession as OperatorWikiProfession, rarity }
  })
  return { observedAt: value.observedAt, entries }
}

export async function loadOperatorWikiRoster(signal?: AbortSignal): Promise<OperatorWikiRosterSnapshot> {
  const base = import.meta.env?.BASE_URL ?? '/'
  const response = await fetch(base.replace(/\/?$/, '/') + 'data/operator-wiki-roster.json', { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Wiki オペレーター一覧を読み込めませんでした。')
  return parseOperatorWikiRosterSnapshot(await response.json())
}
