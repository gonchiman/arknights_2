import type { MapDetail, MapDetailShard, MapSummary } from '../types/map.ts'
import type { RoguelikeIndex, RoguelikeStage, RoguelikeStageGroup, RoguelikeTheme } from '../types/roguelike.ts'
import { getMapDetail, parseMapDetailShard, parseMapIndex } from './mapDatabase.ts'

const APP_BASE = import.meta.env?.BASE_URL ?? '/'
const DATA_BASE = `${APP_BASE.endsWith('/') ? APP_BASE : `${APP_BASE}/`}data/roguelike/`
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const identifier = (value: unknown): value is string => text(value) && /^[a-zA-Z0-9_-]+$/.test(value)
const relativePath = (value: unknown): value is string => text(value)
  && /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.json)?$/.test(value)
const nullableText = (value: unknown): value is string | null => value === null || text(value)
const detailFilename = (value: unknown): value is string => typeof value === 'string' && /^details-[0-9a-f]\.json$/.test(value)

export function parseRoguelikeIndex(value: unknown): RoguelikeIndex {
  const root = record(value)
  const source = record(root?.source)
  if (!root || !Array.isArray(root.themes) || !Array.isArray(root.stages) || !source
    || !text(source.repository) || !/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(source.repository)
    || !text(source.commit) || !/^[0-9a-f]{40}$/.test(source.commit)
    || source.region !== 'jp' || !relativePath(source.topicTable) || !source.topicTable.endsWith('.json')) {
    throw new Error('統合戦略の一覧形式または取得元を確認できませんでした。')
  }
  const index = parseMapIndex(value)
  const themeIds = new Set<string>()
  const themes = root.themes.map((raw): RoguelikeTheme => {
    const theme = record(raw)
    if (!theme || !identifier(theme.id) || themeIds.has(theme.id) || !text(theme.name)
      || typeof theme.sortId !== 'number' || !Number.isSafeInteger(theme.sortId) || theme.sortId < 0) {
      throw new Error('統合戦略のテーマ情報に不正な値があります。')
    }
    themeIds.add(theme.id)
    return { id: theme.id, name: theme.name, sortId: theme.sortId }
  })
  const maps = new Map(index.maps.map((map) => [map.levelId, map]))
  if (index.maps.some((map) => !relativePath(map.levelId) || map.levelId !== map.levelId.toLowerCase())) {
    throw new Error('統合戦略のマップ識別子に不正な値があります。')
  }
  const stageIds = new Set<string>()
  const stages = root.stages.map((raw): RoguelikeStage => {
    const stage = record(raw)
    if (!stage || !identifier(stage.id) || stageIds.has(stage.id)
      || !identifier(stage.themeId) || !themeIds.has(stage.themeId)
      || !relativePath(stage.levelId) || !maps.has(stage.levelId) || !text(stage.name)
      || !(stage.replacementLevelIds === undefined || (Array.isArray(stage.replacementLevelIds)
        && stage.replacementLevelIds.every((id) => relativePath(id) && maps.has(id))
        && new Set(stage.replacementLevelIds).size === stage.replacementLevelIds.length))
      || typeof stage.isEmergency !== 'boolean' || typeof stage.isBoss !== 'boolean'
      || !(stage.linkedStageId === null || identifier(stage.linkedStageId))
      || !nullableText(stage.eliteDescription) || !nullableText(stage.difficulty)) {
      throw new Error('統合戦略のステージ情報に不正な値があります。')
    }
    stageIds.add(stage.id)
    return { id: stage.id, themeId: stage.themeId, levelId: stage.levelId,
      replacementLevelIds: stage.replacementLevelIds ? [...stage.replacementLevelIds as string[]] : [], name: stage.name,
      isEmergency: stage.isEmergency, isBoss: stage.isBoss, linkedStageId: stage.linkedStageId,
      eliteDescription: stage.eliteDescription, difficulty: stage.difficulty }
  })
  const stageById = new Map(stages.map((stage) => [stage.id, stage]))
  for (const stage of stages) {
    const visited = new Set([stage.id])
    let linkedId = stage.linkedStageId
    while (linkedId !== null) {
      const linked = stageById.get(linkedId)
      if (!linked || linked.themeId !== stage.themeId || visited.has(linkedId)) {
        throw new Error('統合戦略のステージ間の対応を確認できませんでした。')
      }
      visited.add(linkedId)
      linkedId = linked.linkedStageId
    }
  }
  if (index.maps.some((map) => !stages.some((stage) => stage.levelId === map.levelId || stage.replacementLevelIds.includes(map.levelId)))) {
    throw new Error('統合戦略の一覧に対応するステージがありません。')
  }
  return { ...index, themes, stages, source: { repository: source.repository, commit: source.commit,
    region: 'jp', topicTable: source.topicTable } }
}

/** Stage links take priority over shared terrain; separate explicit groups never merge. */
export function getRoguelikeStageGroups(index: RoguelikeIndex, themeId: string, query = ''): RoguelikeStageGroup[] {
  const stages = index.stages.filter((stage) => stage.themeId === themeId)
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  const rootId = (stage: RoguelikeStage): string => {
    let current = stage
    const visited = new Set<string>()
    while (current.linkedStageId !== null && !visited.has(current.id)) {
      visited.add(current.id)
      const linked = byId.get(current.linkedStageId)
      if (!linked) break
      current = linked
    }
    return current.id
  }
  const explicitRoots = new Set(stages.filter((stage) => stage.linkedStageId !== null).map(rootId))
  const groups = new Map<string, RoguelikeStage[]>()
  for (const stage of stages) {
    const id = rootId(stage)
    if (explicitRoots.has(id)) groups.set(id, [...(groups.get(id) ?? []), stage])
  }
  const unlinkedByLevel = new Map<string, RoguelikeStage[]>()
  for (const stage of stages) {
    if (explicitRoots.has(rootId(stage))) continue
    const candidates = [...groups].filter(([id, entries]) => explicitRoots.has(id)
      && entries.some((entry) => entry.levelId === stage.levelId))
    if (candidates.length === 1) candidates[0][1].push(stage)
    else unlinkedByLevel.set(stage.levelId, [...(unlinkedByLevel.get(stage.levelId) ?? []), stage])
  }
  for (const entries of unlinkedByLevel.values()) {
    const first = entries.find((stage) => !stage.isEmergency) ?? entries[0]
    groups.set(first.id, entries)
  }
  const maps = new Map(index.maps.map((map) => [map.levelId, map]))
  const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('ja')
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  // Source normal-stage IDs precede event-only stages; this does not infer floor membership.
  const stageKindOrder = (stage: RoguelikeStage) => stage.isBoss ? 2 : /_n_/.test(stage.id) ? 0 : 1
  return [...groups].map(([id, entries]): RoguelikeStageGroup => {
    const sorted = [...entries].sort((a, b) => Number(a.isEmergency) - Number(b.isEmergency))
    return { id, name: sorted[0].name, stages: sorted }
  }).filter((group) => {
    const searchable = normalize(group.stages.flatMap((stage) => {
      const levelIds = [stage.levelId, ...stage.replacementLevelIds]
      return [stage.id, stage.name, ...levelIds, ...levelIds.flatMap((levelId) =>
        maps.get(levelId)?.enemyIds.flatMap((id) => [id, index.enemies[id]?.name ?? '']) ?? [])]
    }).join(' '))
    return terms.every((term) => searchable.includes(term))
  }).sort((a, b) => stageKindOrder(a.stages[0]) - stageKindOrder(b.stages[0])
    || a.stages[0].id.localeCompare(b.stages[0].id, 'en', { numeric: true }))
}

let indexRequest: Promise<RoguelikeIndex> | null = null
const shardRequests = new Map<string, Promise<MapDetailShard>>()

export function loadRoguelikeDatabase(): Promise<RoguelikeIndex> {
  if (!indexRequest) {
    indexRequest = fetch(`${DATA_BASE}index.json`).then(async (response) => {
      if (!response.ok) throw new Error('統合戦略の一覧を読み込めませんでした。')
      return parseRoguelikeIndex(await response.json())
    }).catch((cause) => {
      indexRequest = null
      throw cause
    })
  }
  return indexRequest
}

export async function loadRoguelikeMapDetail(summary: MapSummary): Promise<MapDetail> {
  if (summary.status === 'missing' || !detailFilename(summary.detailFile)) {
    throw new Error('このステージの詳細データは未取得です。')
  }
  const index = await loadRoguelikeDatabase()
  const canonical = index.maps.find((map) => map.levelId === summary.levelId)
  if (!canonical || canonical.detailFile !== summary.detailFile || canonical.status === 'missing') {
    throw new Error('統合戦略の一覧と選択したステージが一致しませんでした。')
  }
  const cacheKey = `${canonical.detailFile}?v=${encodeURIComponent(index.generatedAt)}`
  let request = shardRequests.get(cacheKey)
  if (!request) {
    request = fetch(`${DATA_BASE}${cacheKey}`).then(async (response) => {
      if (!response.ok) throw new Error('統合戦略のステージ詳細を読み込めませんでした。')
      const shard = parseMapDetailShard(await response.json())
      if (shard.generatedAt !== index.generatedAt) {
        throw new Error('統合戦略データの更新日時が一致しません。ページを再読み込みしてください。')
      }
      return shard
    }).catch((cause) => {
      shardRequests.delete(cacheKey)
      throw cause
    })
    shardRequests.set(cacheKey, request)
  }
  try {
    return getMapDetail(await request, canonical)
  } catch (cause) {
    if (shardRequests.get(cacheKey) === request) shardRequests.delete(cacheKey)
    throw cause
  }
}
