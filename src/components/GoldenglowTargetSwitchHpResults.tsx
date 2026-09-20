import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { HpComparisonDisplaySeries } from '../lib/goldenglowTargetSwitchHpComparison'

type TableLayout = 'single' | 'split'
const formatHp = (hp: number) => hp.toLocaleString('ja-JP')

export function GoldenglowTargetSwitchHpResults({
  series, metric, baselineId, enemyHps, selectedHp, onSelectHp, formatDamage, condition, running, stale, toolbar, children,
}: {
  series: readonly HpComparisonDisplaySeries[]
  metric: 'total' | 'difference' | 'percent'
  baselineId: string
  enemyHps: readonly number[]
  selectedHp: number | null
  onSelectHp: (hp: number) => void
  formatDamage: (damage: number) => string
  condition: string
  running: boolean
  stale: boolean
  toolbar: ReactNode
  children: ReactNode
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const focusedHpRef = useRef<string | null>(null)
  const layoutRef = useRef<TableLayout>('single')
  const [layout, setLayout] = useState<TableLayout>('single')
  const split = layout === 'split' && enemyHps.length > 1
  const tableWidth = Math.max(280, 90 + 105 * series.length)
  const splitTableWidth = tableWidth * 2
  const metricLabel = metric === 'total' ? 'スキル総ダメージ期待値' : metric === 'difference' ? '基準との差' : '基準からの増加率'
  const baselineLabel = series.find((item) => item.id === baselineId)?.label

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => {
      const width = frame.getBoundingClientRect().width
      if (!width) return
      // Preserve the extra-wide table split while keeping the table below the chart.
      const hasDesktopSidebar = window.matchMedia('(min-width: 1141px)').matches
      const next: TableLayout = hasDesktopSidebar && width >= splitTableWidth + 440 + 24 ? 'split' : 'single'
      if (next !== layoutRef.current) {
        const active = document.activeElement
        focusedHpRef.current = active instanceof HTMLElement && frame.contains(active) ? active.dataset.enemyHp ?? null : null
        layoutRef.current = next
        setLayout(next)
      }
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(frame)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [splitTableWidth])

  useLayoutEffect(() => {
    const hp = focusedHpRef.current
    focusedHpRef.current = null
    if (!hp) return
    const button = frameRef.current?.querySelector<HTMLButtonElement>(`button[data-enemy-hp="${hp}"]`)
    button?.focus({ preventScroll: true })
  }, [split])

  const groups = useMemo(() => {
    const midpoint = Math.ceil(enemyHps.length / 2)
    const ranges = split ? [enemyHps.slice(0, midpoint), enemyHps.slice(midpoint)] : [enemyHps]
    const bySeries = series.map((item) => new Map(item.points.map((point) => [point.enemyHp, point.value])))
    return ranges.map((range) => ({
      range,
      rows: range.filter((hp) => bySeries.some((points) => points.has(hp))).map((hp) => ({
        enemyHp: hp,
        values: bySeries.map((points) => points.get(hp) ?? null),
      })),
    }))
  }, [enemyHps, series, split])

  return <div className="gg2-results-layout" data-table-layout={split ? 'split' : 'single'} ref={frameRef}
    style={{ '--gg2-table-width': `${tableWidth}px` } as CSSProperties}>
    <div className="gg2-chart-column">{children}</div>
    <section className="gg-performance-numeric-table gg2-table-view" aria-labelledby="gg2-table-title" aria-busy={running}>
      {toolbar}
      <div className={`gg2-table-scroll${stale ? ' gg2-table-stale' : ''}`}>
        <div className="gg2-table-groups">
          {groups.map((group, index) => <div className="gg2-table-group" key={index}>
            <table className="gg-probability-table gg-performance-table gg2-results-table" aria-labelledby={`gg2-table-caption-${index}`}>
              <caption id={`gg2-table-caption-${index}`} className={split ? 'gg2-table-range' : 'visually-hidden'}>
                {split ? `HP ${formatHp(group.range[0])}〜${formatHp(group.range.at(-1)!)}` : '数値表'}
                <span className="visually-hidden">・{metricLabel}{metric !== 'total' && baselineLabel ? `・基準 ${baselineLabel}` : ''}・{condition}</span>
              </caption>
              <thead><tr><th scope="col">敵HP</th>{series.map((item) => <th scope="col" key={item.id}>
                <div className="gg-performance-column-label"><strong>{item.label}</strong>
                  {metric !== 'total' && item.id === baselineId && <span className="gg2-table-baseline">基準</span>}
                </div>
              </th>)}</tr></thead>
              <tbody>{group.rows.length ? group.rows.map((point) => <tr key={point.enemyHp}
                className={selectedHp === point.enemyHp ? 'gg-performance-selected-resistance' : undefined}
                onClick={(event) => {
                  if (event.target instanceof Element && event.target.closest('button')) return
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  onSelectHp(point.enemyHp)
                }}>
                <th scope="row"><button type="button" className="gg2-table-hp" data-enemy-hp={point.enemyHp}
                  aria-label={`敵HP ${formatHp(point.enemyHp)}を選択`} aria-pressed={selectedHp === point.enemyHp}
                  onClick={() => onSelectHp(point.enemyHp)}>{formatHp(point.enemyHp)}</button></th>
                {point.values.map((value, valueIndex) => <td key={series[valueIndex].id}>
                  {value === null ? '—' : formatDamage(value)}
                </td>)}
              </tr>) : <tr><td colSpan={series.length + 1} className="gg2-table-empty">{running ? '計算中…' : '計算結果なし'}</td></tr>}</tbody>
            </table>
          </div>)}
        </div>
      </div>
    </section>
  </div>
}
