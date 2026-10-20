import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import { ENEMY_LEVEL_TYPES, type EnemyRecord } from '../types/enemy'
import './EnemyAnalysis.css'
import './EnemyStatisticsSummary.css'
import './EnemyRegressionDiagnostics.css'

export interface EnemyRegressionDiagnosticObservation {
  enemy: EnemyRecord
  actual: number
  fitted: number
  residual: number
}

interface Props {
  observations: readonly EnemyRegressionDiagnosticObservation[]
  outcomeLabel: string
  outcomeUnit?: string
  onEnemySelect: (enemy: EnemyRecord, opener: HTMLButtonElement) => void
}

const LEVEL_LABELS = { NORMAL: '通常', ELITE: 'エリート', BOSS: 'ボス', UNKNOWN: '未分類' } as const
const numberFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const compactFormatter = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 })

function formatNumber(value: number): string {
  return value !== 0 && Math.abs(value) < 0.001 ? value.toExponential(2) : numberFormatter.format(Object.is(value, -0) ? 0 : value)
}

function formatTick(value: number): string {
  return Math.abs(value) >= 10_000 ? compactFormatter.format(value) : formatNumber(value)
}

function sparseTicks(ticks: readonly number[], narrow: boolean): number[] {
  if (!narrow || ticks.length <= 4) return [...ticks]
  return ticks.filter((tick, index) => index % 2 === 0 || index === ticks.length - 1 || tick === 0)
}

export function EnemyRegressionDiagnostics({ observations, outcomeLabel, outcomeUnit = '', onEnemySelect }: Props) {
  const headingId = useId()
  const validObservations = useMemo(() => observations.filter(({ actual, fitted, residual }) => (
    Number.isFinite(actual) && Number.isFinite(fitted) && Number.isFinite(residual)
  )), [observations])
  const topResiduals = useMemo(() => [...validObservations]
    .sort((left, right) => Math.abs(right.residual) - Math.abs(left.residual)
      || left.enemy.name.localeCompare(right.enemy.name, 'ja'))
    .slice(0, 3), [validObservations])
  const unit = outcomeUnit ? `（${outcomeUnit}）` : ''
  const presentLevels = ENEMY_LEVEL_TYPES.filter(level => validObservations.some(({ enemy }) => enemy.levelType === level))

  return <section className="enemy-regression-diagnostics" aria-labelledby={headingId}>
    <div className="enemy-regression-diagnostics-heading">
      <h3 id={headingId}>当てはまりの確認</h3>
      <div className="enemy-level-legend" aria-label="点の色（敵の区分）">
        {presentLevels.map(level => <span className={level.toLowerCase()} key={level}><i aria-hidden="true" />{LEVEL_LABELS[level]}</span>)}
      </div>
    </div>
    {validObservations.length === 0 ? <p className="enemy-regression-empty" role="status">診断に使える数値がありません。</p> : <>
      <div className="enemy-regression-diagnostic-charts">
        <DiagnosticScatter observations={validObservations} outcomeLabel={outcomeLabel} outcomeUnit={outcomeUnit}
          kind="actual" onEnemySelect={onEnemySelect} />
        <DiagnosticScatter observations={validObservations} outcomeLabel={outcomeLabel} outcomeUnit={outcomeUnit}
          kind="residual" onEnemySelect={onEnemySelect} />
      </div>
      <div className="enemy-regression-outliers">
        <h4>残差の絶対値 上位{topResiduals.length}件</h4>
        <div className="enemy-stat-summary-scroll" tabIndex={0} role="region" aria-label="残差上位の敵の表（横にスクロールできます）">
          <table className="enemy-stat-summary-table enemy-regression-outlier-table">
            <thead><tr><th scope="col">敵</th>
              <th scope="col">実測<span className="enemy-stat-summary-unit">{outcomeLabel}{unit}</span></th>
              <th scope="col">当てはめ<span className="enemy-stat-summary-unit">{outcomeLabel}{unit}</span></th>
              <th scope="col">残差{outcomeUnit && <span className="enemy-stat-summary-unit">{outcomeUnit}</span>}</th>
            </tr></thead>
            <tbody>{topResiduals.map((observation, index) => <tr key={`${observation.enemy.id}:${index}`}>
              <th scope="row"><button type="button" className="enemy-regression-enemy-button"
                aria-label={`${observation.enemy.name}の詳細を表示`}
                onClick={event => onEnemySelect(observation.enemy, event.currentTarget)}>
                {observation.enemy.name}
              </button><span className="enemy-regression-enemy-meta">{LEVEL_LABELS[observation.enemy.levelType]}{observation.enemy.index && `・${observation.enemy.index}`}</span></th>
              <td>{formatNumber(observation.actual)}</td><td>{formatNumber(observation.fitted)}</td>
              <td>{observation.residual > 0 ? '+' : ''}{formatNumber(observation.residual)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </>}
  </section>
}

function DiagnosticScatter({ observations, outcomeLabel, outcomeUnit, kind, onEnemySelect }: Required<Omit<Props, 'observations'>> & {
  observations: readonly EnemyRegressionDiagnosticObservation[]
  kind: 'actual' | 'residual'
}) {
  const titleId = useId()
  const descriptionId = useId()
  const selectionId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  const [selection, setSelection] = useState<{ source: typeof observations; index: number } | null>(null)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const measuredWidth = container.clientWidth
      if (measuredWidth > 0) setWidth(Math.max(220, Math.floor(measuredWidth)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  const isActual = kind === 'actual'
  const title = isActual ? '実測と当てはめ' : '当てはめと残差'
  const referenceLabel = isActual ? '破線：実測＝当てはめ' : '破線：残差0'
  const unit = outcomeUnit ? `（${outcomeUnit}）` : ''
  const xLabel = `当てはめ ${outcomeLabel}${unit}`
  const yLabel = isActual ? `実測 ${outcomeLabel}${unit}` : `残差${unit}`
  const actualAxis = useMemo(() => getHpChartValueAxis(observations.flatMap(({ actual, fitted }) => [actual, fitted]), { mode: 'auto' }), [observations])
  const fittedAxis = useMemo(() => getHpChartValueAxis(observations.map(({ fitted }) => fitted), { mode: 'auto' }), [observations])
  const residualAxis = useMemo(() => getHpChartValueAxis([0, ...observations.map(({ residual }) => residual)], { mode: 'auto' }), [observations])
  const xAxis = isActual ? actualAxis : fittedAxis
  const yAxis = isActual ? actualAxis : residualAxis
  const left = width < 300 ? 59 : 66
  const right = width - 18
  const top = 18
  const plotSize = Math.max(1, right - left)
  const bottom = top + plotSize
  const height = bottom + 67
  const x = (value: number) => left + (value - xAxis.lowerLimit) / (xAxis.upperLimit - xAxis.lowerLimit) * plotSize
  const y = (value: number) => bottom - (value - yAxis.lowerLimit) / (yAxis.upperLimit - yAxis.lowerLimit) * plotSize
  const xTicks = sparseTicks(xAxis.yTicks, width < 430)
  const yTicks = sparseTicks(yAxis.yTicks, width < 430)
  const pointRadius = observations.length > 600 ? 1.8 : observations.length > 250 ? 2.2 : observations.length > 100 ? 2.7 : 3.4
  const activeIndex = selection?.source === observations ? selection.index : -1
  const active = observations[activeIndex]
  const select = (index: number) => setSelection({ source: observations, index })
  const describe = (point: EnemyRegressionDiagnosticObservation) => `${point.enemy.name}［${point.enemy.id}］：実測 ${formatNumber(point.actual)}${outcomeUnit}、当てはめ ${formatNumber(point.fitted)}${outcomeUnit}、残差 ${point.residual > 0 ? '+' : ''}${formatNumber(point.residual)}${outcomeUnit}`
  const navigate = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'Escape') { setSelection(null); return }
    let next = activeIndex
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (Math.max(-1, activeIndex) + 1) % observations.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (activeIndex <= 0 ? observations.length : activeIndex) - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = observations.length - 1
    else return
    event.preventDefault()
    select(next)
  }

  return <figure className="enemy-analysis-figure enemy-regression-diagnostic-figure">
    <figcaption><div><strong id={titleId}>{title}</strong></div></figcaption>
    <div ref={containerRef} className="enemy-regression-diagnostic-plot">
      <svg className="enemy-stat-chart enemy-regression-scatter" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        tabIndex={0} role="group" aria-labelledby={titleId} aria-describedby={`${descriptionId} ${selectionId}`}
        onFocus={() => { if (!active) select(0) }} onKeyDown={navigate}>
        <title>{title}：{outcomeLabel}{unit}</title>
        <desc id={descriptionId}>横軸は{xLabel}、縦軸は{yLabel}。{referenceLabel}。点を選ぶと数値を表示します。矢印キーで敵を切り替え、Escapeで選択を解除できます。</desc>
        {yTicks.map(tick => <g key={`y:${tick}`}>
          <line className="enemy-chart-gridline" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
          <text className="enemy-chart-tick" x={left - 7} y={y(tick) + 4} textAnchor="end">{formatTick(tick)}</text>
        </g>)}
        {xTicks.map(tick => <g key={`x:${tick}`}>
          <line className="enemy-chart-gridline vertical" x1={x(tick)} x2={x(tick)} y1={top} y2={bottom} />
          <text className="enemy-chart-tick" x={x(tick)} y={bottom + 20} textAnchor="middle">{formatTick(tick)}</text>
        </g>)}
        <rect className="enemy-chart-frame" x={left} y={top} width={plotSize} height={plotSize} />
        <line className="enemy-regression-reference" x1={left} x2={right}
          y1={isActual ? bottom : y(0)} y2={isActual ? top : y(0)} />
        {observations.map((point, index) => <g key={`${point.enemy.id}:${index}`}
          onPointerEnter={() => select(index)} onPointerDown={() => select(index)}>
          <title>{describe(point)}</title>
          <circle className="enemy-regression-point-hit" cx={x(point.fitted)} cy={y(isActual ? point.actual : point.residual)} r={9} />
          <circle className={`enemy-scatter-point ${point.enemy.levelType.toLowerCase()}${activeIndex === index ? ' enemy-regression-point-active' : ''}`}
            cx={x(point.fitted)} cy={y(isActual ? point.actual : point.residual)} r={pointRadius} />
        </g>)}
        {active && <circle className="enemy-regression-selection-ring" cx={x(active.fitted)} cy={y(isActual ? active.actual : active.residual)} r={pointRadius + 3} />}
        <text className="enemy-chart-axis-title" x={(left + right) / 2} y={height - 13} textAnchor="middle">{xLabel}</text>
        <text className="enemy-chart-axis-title" x={15} y={(top + bottom) / 2}
          transform={`rotate(-90 15 ${(top + bottom) / 2})`} textAnchor="middle">{yLabel}</text>
      </svg>
    </div>
    <div className="enemy-regression-point-info" hidden={!active}>
      <p id={selectionId} aria-live="polite" aria-atomic="true">{active ? describe(active) : ''}</p>
      {active && <button type="button" className="button secondary" aria-label={`${active.enemy.name}の詳細を表示`}
        onClick={event => onEnemySelect(active.enemy, event.currentTarget)}>敵詳細</button>}
    </div>
  </figure>
}
