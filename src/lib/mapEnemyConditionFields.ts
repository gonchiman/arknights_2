import {
  ENEMY_NUMERIC_FILTER_FIELDS, ENEMY_NUMERIC_FILTER_OPERATORS,
  type EnemyNumericFilterField, type EnemyNumericFilterOperator,
} from './enemyNumericFilters.ts'

export const MAP_ENEMY_IMMUNITY_FIELDS = [
  { key: 'stunImmune', label: 'スタン耐性' },
  { key: 'silenceImmune', label: '沈黙耐性' },
  { key: 'sleepImmune', label: '睡眠耐性' },
  { key: 'frozenImmune', label: '凍結耐性' },
  { key: 'levitateImmune', label: '浮遊耐性' },
  { key: 'disarmedCombatImmune', label: '武装解除耐性' },
  { key: 'fearedImmune', label: '恐怖耐性' },
  { key: 'palsyImmune', label: '麻痺耐性' },
  { key: 'attractImmune', label: '誘導耐性' },
] as const

export type MapEnemyImmunityProperty = typeof MAP_ENEMY_IMMUNITY_FIELDS[number]['key']
export type MapEnemyNumericConditionProperty =
  | 'wait' | 'hp' | 'attack' | 'defense' | 'resistance' | 'moveSpeed' | 'attackInterval' | 'weight'
  | 'waitCount' | 'waitTotal' | 'spawnCount' | 'routeSpawnCount' | 'spawnInterval' | 'entranceCount'
export type MapEnemyConditionProperty = MapEnemyNumericConditionProperty | MapEnemyImmunityProperty
  | 'levelType' | 'motion' | 'attackWay' | 'damageType' | 'waitPresence' | 'spawnKind' | 'entrance'
  | 'enemyName' | 'enemyId'
export type MapEnemyConditionOperator = EnemyNumericFilterOperator | 'contains'

export interface MapEnemyConditionField {
  key: MapEnemyConditionProperty
  label: string
  group: string
  kind: 'number' | 'select' | 'text'
  unit?: string
  options?: readonly { value: string; label: string }[]
  /** Numeric fields use the shared numeric operator list. */
  operator?: 'eq' | 'contains'
}

export const MAP_ENEMY_NUMERIC_CONDITION_OPERATORS = ENEMY_NUMERIC_FILTER_OPERATORS

const yesNo = [{ value: 'yes', label: 'あり' }, { value: 'no', label: 'なし' }]
const baseStat = (key: MapEnemyNumericConditionProperty, source: EnemyNumericFilterField): MapEnemyConditionField => {
  const field = ENEMY_NUMERIC_FILTER_FIELDS.find(field => field.key === source)!
  return { key, label: `基礎${field.label}`, group: '基礎能力値', kind: 'number', unit: field.unit }
}

export const MAP_ENEMY_CONDITION_FIELDS: readonly MapEnemyConditionField[] = [
  { key: 'enemyName', label: '敵名・ID', group: '名前・分類', kind: 'text', operator: 'contains' },
  { key: 'enemyId', label: '敵ID', group: '名前・分類', kind: 'text', operator: 'eq' },
  { key: 'levelType', label: '敵の区分', group: '名前・分類', kind: 'select', operator: 'eq', options: [
    { value: 'NORMAL', label: '通常' }, { value: 'ELITE', label: 'エリート' },
    { value: 'BOSS', label: 'ボス' }, { value: 'UNKNOWN', label: '未分類' },
  ] },
  { key: 'motion', label: '移動方式', group: '名前・分類', kind: 'select', operator: 'eq', options: [
    { value: 'WALK', label: '地上' }, { value: 'FLY', label: '飛行' },
  ] },
  { key: 'attackWay', label: '攻撃方式', group: '名前・分類', kind: 'select', operator: 'eq', options: [
    { value: 'MELEE', label: '近距離' }, { value: 'RANGED', label: '遠距離' },
    { value: 'ALL', label: '近・遠距離' }, { value: 'NONE', label: '通常攻撃なし' },
  ] },
  { key: 'damageType', label: 'ダメージ種別', group: '名前・分類', kind: 'select', operator: 'eq', options: [
    { value: 'PHYSIC', label: '物理' }, { value: 'MAGIC', label: '術' },
    { value: 'NO_DAMAGE', label: '非攻撃' }, { value: 'HEAL', label: '回復' },
  ] },
  baseStat('hp', 'maxHp'), baseStat('attack', 'attack'), baseStat('defense', 'defense'),
  baseStat('resistance', 'magicResistance'), baseStat('moveSpeed', 'moveSpeed'),
  baseStat('attackInterval', 'baseAttackTime'), baseStat('weight', 'massLevel'),
  { key: 'wait', label: '1回の待機時間', group: '待機', kind: 'number', unit: '秒' },
  { key: 'waitCount', label: '待機回数', group: '待機', kind: 'number', unit: '回' },
  { key: 'waitTotal', label: '待機時間の合計', group: '待機', kind: 'number', unit: '秒' },
  { key: 'waitPresence', label: '固定待機', group: '待機', kind: 'select', operator: 'eq', options: yesNo },
  { key: 'spawnCount', label: '敵の設定体数', group: '出現', kind: 'number', unit: '体' },
  { key: 'routeSpawnCount', label: '経路の設定体数', group: '出現', kind: 'number', unit: '体' },
  { key: 'spawnInterval', label: '出現間隔', group: '出現', kind: 'number', unit: '秒' },
  { key: 'spawnKind', label: '出現条件', group: '出現', kind: 'select', operator: 'eq', options: [
    { value: 'fixed', label: '通常' }, { value: 'conditional', label: '条件付き' }, { value: 'unknown', label: '未確定' },
  ] },
  { key: 'entrance', label: '出現口', group: '出現', kind: 'select', operator: 'eq' },
  { key: 'entranceCount', label: '出現口数', group: '出現', kind: 'number', unit: '種類' },
  ...MAP_ENEMY_IMMUNITY_FIELDS.map(({ key, label }): MapEnemyConditionField =>
    ({ key, label, group: '状態異常耐性', kind: 'select', operator: 'eq', options: yesNo })),
]

const fieldsByKey = new Map(MAP_ENEMY_CONDITION_FIELDS.map(field => [field.key as string, field]))

export function getMapEnemyConditionField(property: string): MapEnemyConditionField | undefined {
  return fieldsByKey.get(property)
}
