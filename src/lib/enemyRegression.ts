import { ENEMY_LEVEL_TYPES, type EnemyLevelType, type EnemyRecord } from '../types/enemy.ts'
import { ENEMY_LEVEL_LABELS } from './enemyLevelSelection.ts'
import { ENEMY_NUMERIC_FILTER_FIELDS } from './enemyNumericFilters.ts'
import { fitMultipleLinearRegression } from './multipleLinearRegression.ts'

export const ENEMY_REGRESSION_METRICS = [
  regressionMetric('maxHp', 1_000),
  regressionMetric('attack', 100),
  regressionMetric('defense', 100),
  regressionMetric('magicResistance', 10),
  regressionMetric('moveSpeed', 0.1),
  regressionMetric('baseAttackTime', 1),
] as const

export type EnemyRegressionMetric = typeof ENEMY_REGRESSION_METRICS[number]['key']
export type EnemyRegressionPredictor = EnemyRegressionMetric | 'levelType'

export interface EnemyRegressionConfig {
  outcome: EnemyRegressionMetric
  predictors: readonly EnemyRegressionPredictor[]
  /** Omitted in the UI: normally prefer NORMAL, then the shared level ordering. */
  referenceLevelType?: EnemyLevelType
}

export const DEFAULT_ENEMY_REGRESSION_CONFIG: EnemyRegressionConfig = {
  outcome: 'attack',
  predictors: ['maxHp', 'defense', 'magicResistance', 'levelType'],
}

export interface EnemyRegressionColumn {
  key: string
  label: string
  predictor: EnemyRegressionPredictor
  changeStep: number
  unit: string
  isCategory: boolean
  levelType?: EnemyLevelType
}

export interface EnemyRegressionObservation {
  enemy: EnemyRecord
  actual: number
  fitted: number
  residual: number
}

export interface EnemyRegressionResult {
  observations: EnemyRegressionObservation[]
  columns: EnemyRegressionColumn[]
  fit: ReturnType<typeof fitMultipleLinearRegression>
  targetCount: number
  excludedCount: number
  referenceLevelType: EnemyLevelType | null
  notes: readonly string[]
}

export function runEnemyRegression(
  rows: readonly EnemyRecord[],
  config: EnemyRegressionConfig,
): EnemyRegressionResult {
  const metricKeys = new Set<string>(ENEMY_REGRESSION_METRICS.map(({ key }) => key))
  if (!metricKeys.has(config.outcome)) throw new Error('目的変数を選んでください。')
  if (config.predictors.length === 0) throw new Error('説明変数を1つ以上選んでください。')
  if (config.predictors.some((key) => key !== 'levelType' && !metricKeys.has(key))) {
    throw new Error('説明変数を確認してください。')
  }
  if (new Set(config.predictors).size !== config.predictors.length) {
    throw new Error('同じ説明変数を重複して指定できません。')
  }
  if (config.predictors.includes(config.outcome)) {
    throw new Error('目的変数と同じ項目は説明変数に指定できません。')
  }

  const notes: string[] = []
  const seenIds = new Set<string>()
  const targets = rows.filter(({ id }) => {
    if (seenIds.has(id)) return false
    seenIds.add(id)
    return true
  })
  if (targets.length !== rows.length) notes.push('重複する敵IDは1件として扱いました。')
  const useLevelType = config.predictors.includes('levelType')
  const numericPredictors = config.predictors.filter((key): key is EnemyRegressionMetric => key !== 'levelType')
  const completeRows = targets.filter((enemy) => isFiniteNumber(enemy.stats[config.outcome])
    && numericPredictors.every((key) => isFiniteNumber(enemy.stats[key]))
    && (!useLevelType || (ENEMY_LEVEL_TYPES as readonly unknown[]).includes(enemy.levelType)))
  if (completeRows.length === 0) {
    throw new Error('目的変数と選んだ説明変数がすべて揃う敵がいません。分析対象や項目を変更してください。')
  }

  const presentLevels = useLevelType
    ? ENEMY_LEVEL_TYPES.filter((level) => completeRows.some((enemy) => enemy.levelType === level))
    : []
  if (useLevelType && config.referenceLevelType !== undefined && !presentLevels.includes(config.referenceLevelType)) {
    throw new Error('基準の敵区分に、有効なデータがありません。')
  }
  const referenceLevelType = presentLevels.length > 0
    ? config.referenceLevelType ?? presentLevels[0]
    : null
  if (useLevelType && presentLevels.length === 1) {
    notes.push(`有効な敵区分が「${ENEMY_LEVEL_LABELS[presentLevels[0]]}」のみのため、敵区分の比較項は省略しています。`)
  }

  const columns = config.predictors.flatMap<EnemyRegressionColumn>((predictor) => {
    if (predictor === 'levelType') {
      return presentLevels.filter((level) => level !== referenceLevelType).map((level) => ({
        key: `levelType:${level}`,
        label: `${ENEMY_LEVEL_LABELS[level]}（${ENEMY_LEVEL_LABELS[referenceLevelType!]}基準）`,
        predictor,
        changeStep: 1,
        unit: '',
        isCategory: true,
        levelType: level,
      }))
    }
    const metric = ENEMY_REGRESSION_METRICS.find(({ key }) => key === predictor)!
    return [{ key: metric.key, label: metric.label, predictor, changeStep: metric.step, unit: metric.unit, isCategory: false }]
  })
  if (columns.length === 0) {
    throw new Error('敵区分が1種類のため比較できません。数値の説明変数を追加するか対象を広げてください。')
  }
  const predictors = completeRows.map((enemy) => columns.map((column) => column.isCategory
    ? Number(enemy.levelType === column.levelType)
    : enemy.stats[column.predictor as EnemyRegressionMetric]!))
  const responses = completeRows.map((enemy) => enemy.stats[config.outcome]!)
  const fit = fitMultipleLinearRegression(predictors, responses, columns.map(({ label }) => label))
  const observations = completeRows.map((enemy, index) => ({
    enemy,
    actual: responses[index],
    fitted: fit.fittedValues[index],
    residual: fit.residuals[index],
  }))

  return { observations, columns, fit, targetCount: targets.length,
    excludedCount: targets.length - completeRows.length, referenceLevelType, notes }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function regressionMetric<K extends typeof ENEMY_NUMERIC_FILTER_FIELDS[number]['key']>(key: K, step: number) {
  const field = ENEMY_NUMERIC_FILTER_FIELDS.find((item) => item.key === key)!
  return { key, label: field.label, step, unit: field.unit }
}
