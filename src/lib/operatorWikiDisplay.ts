import type { OperatorDatabaseRecord } from './operatorDatabase.ts'
import type { FilterState } from './operatorSearchFilters.ts'
import type { OperatorWikiRosterEntry } from './operatorWikiRoster.ts'
import { wikiPageTitle, WIKI_ROOT } from './operatorWikiViews.ts'

type GameOperator = Pick<OperatorDatabaseRecord, 'operatorId' | 'name' | 'profession' | 'rarity'>

export type OperatorWikiDisplayEntry = GameOperator & {
  wikiUrl: string | null
  sourceIds: readonly string[]
}

function normalizeName(name: string) {
  return name.normalize('NFKC').trim().toLocaleLowerCase('ja')
}

export function buildOperatorWikiDisplayRoster(
  operators: readonly GameOperator[],
  wikiRoster: readonly OperatorWikiRosterEntry[],
): OperatorWikiDisplayEntry[] {
  const result = operators.map(operator => ({
    operatorId: operator.operatorId,
    name: operator.name,
    profession: operator.profession,
    rarity: operator.rarity,
    wikiUrl: null as string | null,
    sourceIds: [operator.operatorId],
  }))
  const byId = new Map(result.map((entry, index) => [entry.operatorId, index]))
  const byName = new Map<string, number | undefined>()
  result.forEach((entry, index) => {
    const name = normalizeName(entry.name)
    byName.set(name, byName.has(name) ? undefined : index)
  })
  const byUrl = new Map<string, number>()

  for (const wiki of wikiRoster) {
    const title = wikiPageTitle(wiki.wikiUrl)
    const index = byUrl.get(wiki.wikiUrl) ?? byId.get(wiki.operatorId)
      ?? byName.get(normalizeName(wiki.name)) ?? (title ? byName.get(normalizeName(title)) : undefined)
    const existing = index === undefined ? undefined : result[index]
    const combined = {
      operatorId: wiki.operatorId,
      name: existing?.name ?? wiki.name,
      profession: existing?.profession ?? wiki.profession,
      rarity: existing?.rarity ?? wiki.rarity,
      wikiUrl: wiki.wikiUrl,
      sourceIds: [...new Set([wiki.operatorId, ...(existing?.sourceIds ?? [])])],
    }
    const targetIndex = index ?? result.length
    result[targetIndex] = combined
    combined.sourceIds.forEach(id => byId.set(id, targetIndex))
    byUrl.set(wiki.wikiUrl, targetIndex)
  }
  return result
}

export function filterOperatorWikiDisplayRoster(
  entries: readonly OperatorWikiDisplayEntry[],
  filters: Pick<FilterState, 'query' | 'profession' | 'rarity'>,
): OperatorWikiDisplayEntry[] {
  const query = normalizeName(filters.query)
  return entries.filter(entry =>
    (filters.profession === 'ALL' || entry.profession === filters.profession)
    && (filters.rarity === 'ALL' || entry.rarity === filters.rarity)
    && (!query || normalizeName(entry.name).includes(query)),
  )
}

function characterWikiUrl(url: string) {
  const title = wikiPageTitle(url)
  return title ? `${WIKI_ROOT}?${encodeURIComponent(title.replace(/^コメント\//, ''))}` : null
}

export function matchOperatorWikiDisplayEntries<Entry extends { operatorId: string; wikiUrl: string }>(
  operators: readonly OperatorWikiDisplayEntry[],
  entries: readonly Entry[],
): ReadonlyMap<string, Entry> {
  const byId = new Map(entries.map(entry => [entry.operatorId, entry]))
  const byUrl = new Map(entries.map(entry => [characterWikiUrl(entry.wikiUrl), entry]))
  const matched = new Map<string, Entry>()
  for (const operator of operators) {
    const entry = operator.sourceIds.map(id => byId.get(id)).find(candidate => candidate !== undefined
      && (!operator.wikiUrl || characterWikiUrl(candidate.wikiUrl) === operator.wikiUrl))
      ?? byUrl.get(operator.wikiUrl ?? `${WIKI_ROOT}?${encodeURIComponent(operator.name)}`)
    if (entry) matched.set(operator.operatorId, entry)
  }
  return matched
}
