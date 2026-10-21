/** Local development snapshots share these paths with their browser consumers. */
export const LOCAL_GAME_DATA_RUNTIME_FILES = {
  character: 'runtime/character_table.json',
  skill: 'runtime/skill_table.json',
  uniequip: 'runtime/uniequip_table.json',
  battleEquip: 'runtime/battle_equip_table.json',
  handbookTeam: 'runtime/handbook_team_table.json',
  enemyHandbook: 'runtime/enemy_handbook_table.json',
  enemyDatabase: 'runtime/enemy_database.json',
} as const

export const LOCAL_GAME_DATA_GENERATED_FILES = [
  'enemy-stage-appearances.json', 'enemy-histogram-counts.json',
  'maps/index.json', 'maps/main-enemy-trends.json',
  ...Array.from({ length: 16 }, (_, index) => `maps/details-${index.toString(16)}.json`),
] as const

export const LOCAL_GAME_DATA_FILES = [
  ...LOCAL_GAME_DATA_GENERATED_FILES,
  ...Object.values(LOCAL_GAME_DATA_RUNTIME_FILES),
]

export const LOCAL_GAME_DATA_MANIFEST_FILE = 'runtime/manifest.json'

export type LocalGameDataTable = keyof typeof LOCAL_GAME_DATA_RUNTIME_FILES
