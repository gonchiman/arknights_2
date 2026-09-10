import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { GoldenglowTargetSwitchGridRow } from '../lib/goldenglowTargetSwitchGrid'
import { goldenglowResistanceBarColor } from '../lib/goldenglowTargetSwitchChart'
import './GoldenglowTargetSwitchGroupedBars.css'

interface GroupedBarsProps {
  enemyHps: readonly number[]
  rows: readonly GoldenglowTargetSwitchGridRow[]
  visibleRows: readonly GoldenglowTargetSwitchGridRow[]
  showDecimals: boolean
  colors: readonly string[]
  emptyMessage: string | null
  error: boolean
}

interface SelectedBar {
  row: GoldenglowTargetSwitchGridRow
  index: number
}

const integerFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const decimalFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })

export function GoldenglowTargetSwitchGroupedBars({
  enemyHps, rows, visibleRows, showDecimals, colors, emptyMessage, error,
}: GroupedBarsProps) {
  const hpKey = enemyHps.join(',')
  const [hpSelection, setHpSelection] = useState(() => ({ key: hpKey, values: defaultHps(enemyHps) }))
  const selectedHps = hpSelection.key === hpKey ? hpSelection.values : defaultHps(enemyHps)
  if (hpSelection.key !== hpKey) setHpSelection({ key: hpKey, values: selectedHps })
  const hpIndexes = enemyHps.flatMap((hp, index) => selectedHps.includes(hp) ? [index] : [])
  const [selection, setSelection] = useState<SelectedBar | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const barRefs = useRef(new Map<string, SVGGElement>())
  const [frameWidth, setFrameWidth] = useState(720)
  const chartTitleId = useId()
  const chartDescriptionId = useId()
  const barDescriptionId = useId()
  const damageFormat = showDecimals ? decimalFormat : integerFormat
  const orderedVisibleRows = [...visibleRows].sort((left, right) => left.enemyResistance - right.enemyResistance)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const resize = () => {
      const measured = Math.round(frame.getBoundingClientRect().width)
      if (measured > 0) setFrameWidth(measured)
    }
    resize()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resize)
      return () => window.removeEventListener('resize', resize)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const isValidBar = (row: GoldenglowTargetSwitchGridRow, index: number) => (
    Number.isFinite(enemyHps[index]) && Number.isFinite(row.expectedDamages[index]) && row.expectedDamages[index] >= 0
  )
  const selected = selection && hpIndexes.includes(selection.index) && orderedVisibleRows.includes(selection.row)
    && isValidBar(selection.row, selection.index) ? selection : null
  const firstRow = orderedVisibleRows.find((row) => hpIndexes.some((index) => isValidBar(row, index)))
  const tabBar = selected || (firstRow ? { row: firstRow, index: hpIndexes.find((index) => isValidBar(firstRow, index))! } : null)
  // Keep the vertical scale fixed when selecting HP values or hiding a series.
  const maximumDamage = Math.max(0, ...rows.flatMap((row) => row.expectedDamages.filter((value) => Number.isFinite(value) && value >= 0)))
  const step = Math.max(1, niceStep(maximumDamage / 4))
  const maxDamage = Math.max(step, Math.ceil(maximumDamage / step) * step)
  const yTicks = Array.from({ length: Math.round(maxDamage / step) + 1 }, (_, index) => index * step)
  const compact = frameWidth < 520
  const height = compact ? 310 : 360
  const tickLabelWidth = Math.max(...yTicks.map((tick) => damageFormat.format(tick).length)) * 6.6
  const margin = { top: 18, right: 16, bottom: 54, left: Math.max(compact ? 65 : 78, Math.ceil(tickLabelWidth + 29)) }
  const minimumGroupWidth = Math.max(90, orderedVisibleRows.length * 16 + 24)
  const width = Math.max(frameWidth, margin.left + margin.right + hpIndexes.length * minimumGroupWidth)
  const plotRight = width - margin.right
  const plotBottom = height - margin.bottom
  const groupWidth = (plotRight - margin.left) / Math.max(1, hpIndexes.length)
  const groupGap = Math.min(32, groupWidth * 0.2)
  const barSlot = (groupWidth - groupGap) / Math.max(1, orderedVisibleRows.length)
  const barWidth = Math.min(30, Math.max(1, barSlot - 4))
  const getY = (damage: number) => plotBottom - damage / maxDamage * (plotBottom - margin.top)
  const barKey = (row: GoldenglowTargetSwitchGridRow, index: number) => `${row.enemyResistance}:${index}`

  const toggleHp = (hp: number) => {
    const exists = selectedHps.includes(hp)
    if ((exists && selectedHps.length <= 1) || (!exists && selectedHps.length >= 4)) return
    setHpSelection({ key: hpKey, values: exists ? selectedHps.filter((value) => value !== hp) : [...selectedHps, hp] })
  }
  const selectWithKeyboard = (event: KeyboardEvent<SVGGElement>, row: GoldenglowTargetSwitchGridRow, index: number) => {
    let next: SelectedBar | undefined
    const indexes = hpIndexes.filter((itemIndex) => isValidBar(row, itemIndex))
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const offset = event.key === 'ArrowRight' ? 1 : -1
      const nextIndex = indexes[Math.max(0, Math.min(indexes.length - 1, indexes.indexOf(index) + offset))]
      next = { row, index: nextIndex }
    } else if (event.key === 'Home' || event.key === 'End') {
      next = { row, index: event.key === 'Home' ? indexes[0] : indexes[indexes.length - 1] }
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const candidates = orderedVisibleRows.filter((item) => isValidBar(item, index))
      const offset = event.key === 'ArrowDown' ? 1 : -1
      const nextRow = candidates[Math.max(0, Math.min(candidates.length - 1, candidates.indexOf(row) + offset))]
      if (nextRow) next = { row: nextRow, index }
    } else if (event.key === 'Enter' || event.key === ' ') next = { row, index }
    if (!next) return
    event.preventDefault()
    setSelection(next)
    const nextBar = barRefs.current.get(barKey(next.row, next.index))
    nextBar?.focus({ preventScroll: true })
    nextBar?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  return <>
    <div className="ggs-bars-hp-selection">
      <strong>比較するHP（最大4件）</strong>
      <div className="ggs-bars-hp-buttons" role="group" aria-label="比較するHP">
        {enemyHps.map((hp) => {
          const active = selectedHps.includes(hp)
          return <button type="button" key={hp} aria-label={`HP ${integerFormat.format(hp)}`} aria-pressed={active}
            disabled={active ? selectedHps.length <= 1 : selectedHps.length >= 4} onClick={() => toggleHp(hp)}>
            {integerFormat.format(hp)}
          </button>
        })}
      </div>
    </div>
    <div className="ggs-chart-frame ggs-bars-frame" ref={frameRef}>
      <div className="ggs-bars-scroll">
        <svg className="ggs-bars-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-labelledby={chartTitleId} aria-describedby={chartDescriptionId}>
          <title id={chartTitleId}>スキル総ダメージ期待値の集合棒グラフ</title>
          <desc id={chartDescriptionId}>横軸は選択した敵HP、縦軸はスキル総ダメージ期待値です。HPごとに術耐性別の棒を並べます。左右キーでHP、上下キーで術耐性を移動し、Home・Endキーで系列の両端へ移動できます。</desc>
          {yTicks.map((tick) => <g key={tick} aria-hidden="true">
            <line className="ggs-chart-grid" x1={margin.left} x2={plotRight} y1={getY(tick)} y2={getY(tick)} />
            <text className="ggs-chart-tick" x={margin.left - 8} y={getY(tick) + 4} textAnchor="end">{damageFormat.format(tick)}</text>
          </g>)}
          <rect className="ggs-chart-axis" x={margin.left} y={margin.top} width={plotRight - margin.left} height={plotBottom - margin.top} aria-hidden="true" />
          {hpIndexes.map((index, groupIndex) => {
            const groupStart = margin.left + groupIndex * groupWidth
            const hp = enemyHps[index]
            return <g key={hp} className="ggs-bars-hp-group" aria-label={`HP ${integerFormat.format(hp)}の比較`}>
              {orderedVisibleRows.map((row, rowIndex) => {
                if (!isValidBar(row, index)) return null
                const active = selected?.row === row && selected.index === index
                const damage = row.expectedDamages[index]
                const x = groupStart + groupGap / 2 + rowIndex * barSlot + (barSlot - barWidth) / 2
                const y = getY(damage)
                const color = goldenglowResistanceBarColor(row.enemyResistance, colors)
                return <g key={row.enemyResistance} role="button" className={`ggs-chart-bar${active ? ' selected' : ''}`}
                  ref={(element) => { if (element) barRefs.current.set(barKey(row, index), element); else barRefs.current.delete(barKey(row, index)) }}
                  tabIndex={tabBar?.row === row && tabBar.index === index ? 0 : -1}
                  aria-label={`HP ${integerFormat.format(hp)}、術耐性 ${row.enemyResistance}、スキル総ダメージ期待値 ${damageFormat.format(damage)}`}
                  aria-describedby={active ? barDescriptionId : undefined}
                  onPointerEnter={() => setSelection({ row, index })} onFocus={() => setSelection({ row, index })}
                  onClick={() => setSelection({ row, index })} onKeyDown={(event) => selectWithKeyboard(event, row, index)}>
                  <rect className="ggs-chart-bar-fill" x={x} y={y} width={barWidth} height={plotBottom - y} fill={color} />
                  <rect className="ggs-chart-bar-target" x={x - 2} y={Math.max(margin.top, y - 4)} width={barWidth + 4}
                    height={Math.max(8, plotBottom - Math.max(margin.top, y - 4) + 4)} />
                </g>
              })}
              <text className="ggs-chart-tick" x={groupStart + groupWidth / 2} y={plotBottom + 20} textAnchor="middle" aria-hidden="true">{integerFormat.format(hp)}</text>
            </g>
          })}
          <text className="ggs-chart-axis-title" x={(margin.left + plotRight) / 2} y={height - 8} textAnchor="middle" aria-hidden="true">敵HP</text>
          <text className="ggs-chart-axis-title" transform={`translate(14 ${(margin.top + plotBottom) / 2}) rotate(-90)`} textAnchor="middle" aria-hidden="true">期待ダメージ</text>
        </svg>
      </div>
      {emptyMessage && (!firstRow || error) && <p className={`ggs-chart-empty${error ? ' ggs-error' : ''}`} role={error ? 'alert' : 'status'}>{emptyMessage}</p>}
    </div>
    {selected && <output className="ggs-chart-selected" id={barDescriptionId} aria-live="off">
      <span>HP <strong>{integerFormat.format(enemyHps[selected.index])}</strong></span>
      <span>術耐性 <strong>{selected.row.enemyResistance}</strong></span>
      <span>期待ダメージ <strong>{damageFormat.format(selected.row.expectedDamages[selected.index])}</strong></span>
    </output>}
  </>
}

function defaultHps(hps: readonly number[]) {
  const preferred = hps.includes(1_000) ? [1_000, 5_000, 10_000] : [5_000, 10_000, 20_000]
  if (preferred.every((hp) => hps.includes(hp))) return preferred
  if (!hps.length) return []
  return [...new Set([hps[0], hps[Math.floor((hps.length - 1) / 2)], hps[hps.length - 1]])]
}

function niceStep(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const fraction = value / magnitude
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude
}
