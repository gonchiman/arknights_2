export const ARKNIGHTS_GAMEDATA_REPOSITORY = {
  name: 'ArknightsAssets/ArknightsGamedata',
  url: 'https://github.com/ArknightsAssets/ArknightsGamedata',
  region: '日本版（JP）',
  branch: 'master',
} as const

const RAW_GAME_DATA_BASE = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/jp/gamedata'
const EXCEL_BASE = `${RAW_GAME_DATA_BASE}/excel`
const LEVEL_BASE = `${RAW_GAME_DATA_BASE}/levels`

export const DATA_SOURCE_URLS = {
  character: `${EXCEL_BASE}/character_table.json`,
  skill: `${EXCEL_BASE}/skill_table.json`,
  uniequip: `${EXCEL_BASE}/uniequip_table.json`,
  battleEquip: `${EXCEL_BASE}/battle_equip_table.json`,
  enemyHandbook: `${EXCEL_BASE}/enemy_handbook_table.json`,
  enemyDatabase: `${LEVEL_BASE}/enemydata/enemy_database.json`,
  stageTable: `${EXCEL_BASE}/stage_table.json`,
  levelDirectory: `${ARKNIGHTS_GAMEDATA_REPOSITORY.url}/tree/master/jp/gamedata/levels`,
  levelRawBase: LEVEL_BASE,
} as const

export type DataSourceAccess = 'runtime' | 'generation'

export type DataSourceRecord = {
  id: string
  file: string
  url: string
  description: string
  usage: readonly string[]
  access: readonly DataSourceAccess[]
  linkLabel: string
}

export type DataSourceGroup = {
  id: string
  kicker: string
  title: string
  description: string
  sources: readonly DataSourceRecord[]
}

export const DATA_SOURCE_GROUPS = [
  {
    id: 'operator-skill',
    kicker: 'OPERATOR & SKILL',
    title: 'オペレーター・スキル',
    description: '基本情報、育成時のステータス、素質、スキル、職分、モジュールを構成するデータです。',
    sources: [
      {
        id: 'character-table',
        file: 'character_table.json',
        url: DATA_SOURCE_URLS.character,
        description: 'オペレーター名、職業、レアリティ、昇進・レベル別ステータス、信頼度、特性、素質、潜在能力、スキル参照を取得します。',
        usage: ['Operator Database', 'All Skills', 'Skill Effects', 'Skill JSON', 'Damage Calculator', 'Operator Comparison'],
        access: ['runtime'],
        linkLabel: 'character_table.json を開く',
      },
      {
        id: 'skill-table',
        file: 'skill_table.json',
        url: DATA_SOURCE_URLS.skill,
        description: 'スキル名、説明、SP、継続時間、各レベルの数値パラメータを取得します。',
        usage: ['Operator Database', 'All Skills', 'Skill Effects', 'Skill JSON', 'Damage Calculator', 'Operator Comparison'],
        access: ['runtime'],
        linkLabel: 'skill_table.json を開く',
      },
      {
        id: 'uniequip-table',
        file: 'uniequip_table.json',
        url: DATA_SOURCE_URLS.uniequip,
        description: '職分名・職分特性と、オペレーターに紐づくモジュールの基本情報を取得します。',
        usage: ['Operator Database', 'All Skills', 'Skill Effects', 'Skill JSON', 'Damage Calculator', 'Operator Comparison'],
        access: ['runtime'],
        linkLabel: 'uniequip_table.json を開く',
      },
      {
        id: 'battle-equip-table',
        file: 'battle_equip_table.json',
        url: DATA_SOURCE_URLS.battleEquip,
        description: 'モジュールの段階別効果と数値パラメータを取得します。取得できない場合はモジュール詳細のみ省略します。',
        usage: ['Operator Database'],
        access: ['runtime'],
        linkLabel: 'battle_equip_table.json を開く',
      },
    ],
  },
  {
    id: 'enemy',
    kicker: 'ENEMY',
    title: '敵',
    description: '敵図鑑の表示情報と、戦闘で使用される数値データを敵IDで結合しています。',
    sources: [
      {
        id: 'enemy-handbook-table',
        file: 'enemy_handbook_table.json',
        url: DATA_SOURCE_URLS.enemyHandbook,
        description: '敵名、図鑑番号、説明、能力、区分、攻撃種別などの図鑑情報を取得します。登場ステージ数の集計対象を決める際にも使用します。',
        usage: ['Enemy Analysis', '登場ステージ数の事前集計'],
        access: ['runtime', 'generation'],
        linkLabel: 'enemy_handbook_table.json を開く',
      },
      {
        id: 'enemy-database',
        file: 'enemy_database.json',
        url: DATA_SOURCE_URLS.enemyDatabase,
        description: 'HP、攻撃力、防御力、術耐性、移動速度、攻撃間隔、重量、状態異常耐性などを取得します。',
        usage: ['Enemy Analysis'],
        access: ['runtime'],
        linkLabel: 'enemy_database.json を開く',
      },
      {
        id: 'stage-table',
        file: 'stage_table.json',
        url: DATA_SOURCE_URLS.stageTable,
        description: '戦闘ステージとLevelファイルの対応を取得し、同じLevelを共有するステージを重複除去します。',
        usage: ['登場ステージ数の事前集計'],
        access: ['generation'],
        linkLabel: 'stage_table.json を開く',
      },
      {
        id: 'level-files',
        file: 'levels/**/*.json',
        url: DATA_SOURCE_URLS.levelDirectory,
        description: '各Levelの enemyDbRefs から出現する敵IDを取得し、敵ごとの登場ステージ数を集計します。',
        usage: ['登場ステージ数の事前集計'],
        access: ['generation'],
        linkLabel: 'Levelデータのディレクトリを開く',
      },
    ],
  },
] as const satisfies readonly DataSourceGroup[]

export const ALL_DATA_SOURCES: readonly DataSourceRecord[] = DATA_SOURCE_GROUPS.reduce<DataSourceRecord[]>(
  (sources, group) => [...sources, ...group.sources],
  [],
)

export type StageSnapshotSummary = {
  status: 'complete' | 'partial'
  generatedAt: string
  stageRecordCount: number
  uniqueLevelCount: number
  processedLevelCount: number
  failedLevelCount: number
}

export function readStageSnapshotSummary(value: unknown): StageSnapshotSummary | null {
  const root = asRecord(value)
  const summary = asRecord(root?.summary)
  const status = root?.status
  const generatedAt = root?.generatedAt
  const stageRecordCount = readNonNegativeInteger(summary?.stageRecordCount)
  const uniqueLevelCount = readNonNegativeInteger(summary?.uniqueLevelCount)
  const processedLevelCount = readNonNegativeInteger(summary?.processedLevelCount)
  const failedLevelCount = readNonNegativeInteger(summary?.failedLevelCount)

  if (
    root?.schemaVersion !== 1
    || root.scope !== 'stage_table'
    || (status !== 'complete' && status !== 'partial')
    || typeof generatedAt !== 'string'
    || Number.isNaN(new Date(generatedAt).getTime())
    || stageRecordCount === null
    || uniqueLevelCount === null
    || processedLevelCount === null
    || failedLevelCount === null
    || stageRecordCount < uniqueLevelCount
    || processedLevelCount + failedLevelCount !== uniqueLevelCount
    || (status === 'complete' && failedLevelCount !== 0)
    || (status === 'partial' && failedLevelCount === 0)
  ) return null

  return {
    status,
    generatedAt,
    stageRecordCount,
    uniqueLevelCount,
    processedLevelCount,
    failedLevelCount,
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}
