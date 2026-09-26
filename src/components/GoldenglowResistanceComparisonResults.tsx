import { useId, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { ResistanceComparisonDisplaySeries } from '../lib/goldenglowResistanceComparison'
import { getHpComparisonSeriesStyles } from './GoldenglowTargetSwitchHpChart'
import './GoldenglowResistanceComparisonResults.css'

const formatNumber = (value: number) => value.toLocaleString('ja-JP')
const pointKey = (hp: number, resistance: number) => `${hp}:${resistance}`

export function GoldenglowResistanceComparisonResults({
  series, metric, baselineId, hideBaseline = false, enemyHps, enemyResistances,
  selectedHp, selectedResistance, onSelectPoint, formatDamage, condition, running, stale, toolbar, children,
}: {
  series: readonly ResistanceComparisonDisplaySeries[]
  metric: 'total' | 'difference' | 'percent'
  baselineId: string
  hideBaseline?: boolean
  enemyHps: readonly number[]
  enemyResistances: readonly number[]
  selectedHp: number | null
  selectedResistance: number | null
  onSelectPoint: (hp: number, resistance: number) => void
  formatDamage: (damage: number) => string
  condition: string
  running: boolean
  stale: boolean
  toolbar: ReactNode
  children: ReactNode
}) {
  const captionId = useId()
  const columns = useMemo(() => {
    const styles = getHpComparisonSeriesStyles(series)
    return series.map((item, index) => ({
      ...item, color: styles[index].color,
      values: new Map(item.points.map((point) => [pointKey(point.enemyHp, point.enemyResistance), point.value])),
    })).filter((item) => !hideBaseline || item.id !== baselineId)
  }, [series, hideBaseline, baselineId])
  const rows = useMemo(() => enemyHps.flatMap((enemyHp) => enemyResistances.map((enemyResistance) => ({
    enemyHp, enemyResistance, key: pointKey(enemyHp, enemyResistance),
  }))), [enemyHps, enemyResistances])
  const tableWidth = Math.max(330, 160 + 105 * columns.length)
  const metricLabel = metric === 'total' ? 'スキル総ダメージ期待値' : metric === 'difference' ? '基準との差' : '基準からの増加率'
  const baselineLabel = series.find((item) => item.id === baselineId)?.label

  return <div className="gg2-results-layout ggr-results" data-table-layout="single"
    style={{ '--gg2-table-width': `${tableWidth}px` } as CSSProperties}>
    <div className="gg2-chart-column">{children}</div>
    <section className="gg-performance-numeric-table gg2-table-view" aria-labelledby={captionId} aria-busy={running}>
      {toolbar}
      <div className={`gg2-table-scroll ggr-table-scroll${stale ? ' gg2-table-stale' : ''}`}>
        <table className="gg-probability-table gg-performance-table gg2-results-table ggr-results-table">
          <caption id={captionId} className="visually-hidden">
            数値表・{metricLabel}{metric !== 'total' && baselineLabel ? `・基準 ${baselineLabel}` : ''}・{condition}
          </caption>
          <thead><tr>
            <th scope="col">敵HP</th>
            <th scope="col" className="ggr-table-resistance">術耐性</th>
            {columns.map((item) => <th scope="col" key={item.id}>
              <div className="gg-performance-column-label">
                <strong className="ggr-table-series-name">
                  <span className="ggr-table-series-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
                  {item.label}
                </strong>
                {metric !== 'total' && item.id === baselineId && <span className="gg2-table-baseline">基準</span>}
              </div>
            </th>)}
          </tr></thead>
          <tbody>{rows.length && columns.length ? rows.map((point) => {
            const selected = selectedHp === point.enemyHp && selectedResistance === point.enemyResistance
            return <tr key={point.key} className={selected ? 'gg-performance-selected-resistance' : undefined}
              onClick={(event) => {
                if (event.target instanceof Element && event.target.closest('button')) return
                event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                onSelectPoint(point.enemyHp, point.enemyResistance)
              }}>
              <th scope="row"><button type="button" className="gg2-table-hp" data-enemy-hp={point.enemyHp}
                data-enemy-resistance={point.enemyResistance}
                aria-label={`敵HP ${formatNumber(point.enemyHp)}、術耐性 ${formatNumber(point.enemyResistance)}を選択`}
                aria-pressed={selected} onClick={() => onSelectPoint(point.enemyHp, point.enemyResistance)}>
                {formatNumber(point.enemyHp)}
              </button></th>
              <td>{formatNumber(point.enemyResistance)}</td>
              {columns.map((item) => {
                const value = item.values.get(point.key)
                return <td key={item.id}>{value == null || !Number.isFinite(value) ? '—' : formatDamage(value)}</td>
              })}
            </tr>
          }) : <tr><td colSpan={columns.length + 2} className="gg2-table-empty">{running ? '計算中…' : '計算結果なし'}</td></tr>}</tbody>
        </table>
      </div>
    </section>
  </div>
}
