import { DATA_SOURCE_URLS } from './dataSources.ts'
import { LOCAL_GAME_DATA_MANIFEST_FILE, LOCAL_GAME_DATA_RUNTIME_FILES, type LocalGameDataTable } from './localGameDataContract.ts'

interface GameDataClientOptions {
  fetch?: typeof globalThis.fetch
  base?: string
  dev?: boolean
}

export type GameDataSource = {
  mode: 'local'
  version: string
  revision: string
} | {
  mode: 'upstream'
}

/** Select one source for the page so operator, enemy and aggregate data cannot mix revisions. */
export function createGameDataClient({ fetch: fetchOverride, base = '/', dev = false }: GameDataClientOptions = {}) {
  const fetchData: typeof globalThis.fetch = fetchOverride ?? ((...args) => globalThis.fetch(...args))
  const dataBase = `${base.endsWith('/') ? base : `${base}/`}data/`
  let sourceRequest: Promise<GameDataSource> | null = null

  async function selectSource(): Promise<GameDataSource> {
    if (!dev) return { mode: 'upstream' }
    try {
      const response = await fetchData(`${dataBase}${LOCAL_GAME_DATA_MANIFEST_FILE}`, { cache: 'no-store' })
      if (!response.ok) return { mode: 'upstream' }
      const value: unknown = await response.json()
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const manifest = value as Record<string, unknown>
        if (manifest.schemaVersion === 1 && manifest.available === true
          && typeof manifest.revision === 'string' && /^[0-9a-f]{40}$/i.test(manifest.revision)
          && typeof manifest.version === 'string' && Number.isFinite(Date.parse(manifest.version))) {
          return { mode: 'local', version: manifest.version, revision: manifest.revision }
        }
      }
    } catch {
      // Older development servers and a first run without a snapshot retain upstream loading.
    }
    return { mode: 'upstream' }
  }

  function getSource(): Promise<GameDataSource> {
    sourceRequest ??= selectSource()
    return sourceRequest
  }

  function localUrl(path: string, source: GameDataSource): string {
    return `${dataBase}${path}${source.mode === 'local' ? `?v=${encodeURIComponent(source.version)}` : ''}`
  }

  async function readJson<T>(url: string, source: GameDataSource, optional: boolean, allowArray = false): Promise<T | null> {
    try {
      const response = await fetchData(url)
      if (!response.ok) throw new Error('ゲームデータの取得に失敗しました。')
      const value: unknown = await response.json()
      if (!value || typeof value !== 'object' || (!allowArray && Array.isArray(value))) {
        throw new Error('ゲームデータの形式が正しくありません。')
      }
      return value as T
    } catch (error) {
      if (optional && source.mode === 'upstream') return null
      throw error
    }
  }

  function readTable<T = unknown>(table: LocalGameDataTable, options?: { optional?: false }): Promise<T>
  function readTable<T = unknown>(table: LocalGameDataTable, options: { optional: true }): Promise<T | null>
  async function readTable<T = unknown>(table: LocalGameDataTable, { optional = false }: { optional?: boolean } = {}): Promise<T | null> {
    const source = await getSource()
    const url = source.mode === 'local' ? localUrl(LOCAL_GAME_DATA_RUNTIME_FILES[table], source) : DATA_SOURCE_URLS[table]
    return readJson<T>(url, source, optional, table === 'enemyDatabase')
  }

  function readStageAppearances<T = unknown>(options?: { optional?: false }): Promise<T>
  function readStageAppearances<T = unknown>(options: { optional: true }): Promise<T | null>
  async function readStageAppearances<T = unknown>({ optional = false }: { optional?: boolean } = {}): Promise<T | null> {
    const source = await getSource()
    return readJson<T>(localUrl('enemy-stage-appearances.json', source), source, optional)
  }

  return { getSource, readTable, readStageAppearances }
}

export type GameDataClient = ReturnType<typeof createGameDataClient>

export const gameDataClient = createGameDataClient({
  base: import.meta.env?.BASE_URL ?? '/',
  dev: import.meta.env?.DEV === true && import.meta.env?.SSR !== true,
})
