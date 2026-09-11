import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { GoldenglowTargetSwitchGridRow } from '../lib/goldenglowTargetSwitchGrid'
import { createGoldenglowBarPalette, GOLDENGLOW_BAR_PALETTES, goldenglowResistanceBarColor } from '../lib/goldenglowTargetSwitchChart'
import type { GoldenglowBarPaletteKey } from '../lib/goldenglowTargetSwitchChart'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowTargetSwitchGroupedBars } from './GoldenglowTargetSwitchGroupedBars'
import { saveGoldenglowTargetSwitchChartImage } from './saveGoldenglowTargetSwitchChartImage'
import './GoldenglowTargetSwitchChartPanel.css'

interface ChartPanelProps {
  enemyHps: readonly number[]
  enemyResistances: readonly number[]
  rows: readonly GoldenglowTargetSwitchGridRow[]
  status: 'idle' | 'running' | 'complete' | 'cancelled' | 'error'
  error: string | null
  showDecimals: boolean
  controls: ReactNode
  rangeLabel: string
}

interface SelectedPoint {
  row: GoldenglowTargetSwitchGridRow
  index: number
}

const integerFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const decimalFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const dashPatterns = [undefined, '8 3', '3 3', '9 3 2 3'] as const

export function GoldenglowTargetSwitchChartPanel({
  enemyHps, enemyResistances, rows, status, error, showDecimals, controls, rangeLabel,
}: ChartPanelProps) {
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar')
  const figureRef = useRef<HTMLElement>(null)
  const imageSaveInProgress = useRef(false)
  const [savingImage, setSavingImage] = useState(false)
  const [imageFeedback, setImageFeedback] = useState<'saved' | 'failed' | null>(null)
  const [barPalette, setBarPalette] = useState<GoldenglowBarPaletteKey | 'custom'>('blue')
  const [customColor, setCustomColor] = useState('#3e80af')
  const [customColorText, setCustomColorText] = useState('#3e80af')
  const barColors = useMemo(() => barPalette === 'custom'
    ? createGoldenglowBarPalette(customColor) : GOLDENGLOW_BAR_PALETTES[barPalette].colors, [barPalette, customColor])
  const frameRef = useRef<HTMLDivElement>(null)
  const pointRefs = useRef(new Map<string, SVGGElement>())
  const [width, setWidth] = useState(720)
  const [selection, setSelection] = useState<SelectedPoint | null>(null)
  const resistanceKey = enemyResistances.join(',')
  const [visibility, setVisibility] = useState<{ key: string; hidden: Set<number> }>({ key: resistanceKey, hidden: new Set() })
  const hidden = visibility.key === resistanceKey ? visibility.hidden : new Set<number>()
  const chartTitleId = useId()
  const chartDescriptionId = useId()
  const pointDescriptionId = useId()
  const damageFormat = showDecimals ? decimalFormat : integerFormat

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const resize = () => {
      const measured = Math.round(frame.getBoundingClientRect().width)
      if (measured > 0) setWidth(measured)
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

  const orderedRows = useMemo(() => enemyResistances.flatMap((resistance) => {
    const row = rows.find((item) => item.enemyResistance === resistance)
    return row ? [row] : []
  }), [enemyResistances, rows])
  const visibleRows = orderedRows.filter((row) => !hidden.has(row.enemyResistance))
  const isValidPoint = (row: GoldenglowTargetSwitchGridRow, index: number) => (
    Number.isFinite(enemyHps[index]) && Number.isFinite(row.expectedDamages[index]) && row.expectedDamages[index] >= 0
  )
  // Keep a selection only while its actual result row is still present.
  const selected = selection && visibleRows.includes(selection.row) && isValidPoint(selection.row, selection.index) ? selection : null
  const firstRow = visibleRows.find((row) => enemyHps.some((_, index) => isValidPoint(row, index)))
  const tabPoint = selected || (firstRow ? { row: firstRow, index: enemyHps.findIndex((_, index) => isValidPoint(firstRow, index)) } : null)
  const hps = enemyHps.filter(Number.isFinite)
  const minHp = hps.length ? Math.min(...hps) : 0
  const maxHp = Math.max(minHp + 1, ...hps)
  // Legend changes do not rescale the chart; every computed row determines its range.
  const maximumDamage = Math.max(0, ...orderedRows.flatMap((row) => row.expectedDamages.filter((value) => Number.isFinite(value) && value >= 0)))
  const step = Math.max(1, niceStep(maximumDamage / 4))
  const maxDamage = Math.max(step, Math.ceil(maximumDamage / step) * step)
  const yTicks = Array.from({ length: Math.round(maxDamage / step) + 1 }, (_, index) => index * step)
  const compact = width < 520
  const height = compact ? 310 : 360
  const tickLabelWidth = Math.max(...yTicks.map((tick) => damageFormat.format(tick).length)) * 6.6
  const margin = { top: 18, right: 16, bottom: 54, left: Math.max(compact ? 65 : 78, Math.ceil(tickLabelWidth + 29)) }
  const plotRight = Math.max(margin.left + 1, width - margin.right)
  const plotBottom = height - margin.bottom
  const getX = (hp: number) => margin.left + (hp - minHp) / (maxHp - minHp) * (plotRight - margin.left)
  const getY = (damage: number) => plotBottom - damage / maxDamage * (plotBottom - margin.top)
  const tickCount = width < 360 ? 3 : compact ? 4 : 6
  const tickIndexes = [...new Set(Array.from({ length: Math.min(tickCount, enemyHps.length) }, (_, index) => (
    Math.round(index * (enemyHps.length - 1) / Math.max(1, Math.min(tickCount, enemyHps.length) - 1))
  )))].filter((index) => Number.isFinite(enemyHps[index]))
  const hasData = orderedRows.some((row) => enemyHps.some((_, index) => isValidPoint(row, index)))
  const canSaveImage = status === 'complete' && !error && Boolean(firstRow)
  const emptyMessage = error || (status === 'running' ? '計算中…'
    : status === 'cancelled' ? '計算を中止しました。'
      : status === 'error' ? '計算結果を表示できませんでした。'
        : hasData && !firstRow ? '凡例で表示する術耐性を選択してください。'
          : !hasData ? '「計算する」でグラフを表示します。' : null)

  const saveChartImage = async () => {
    if (!canSaveImage || imageSaveInProgress.current) return
    imageSaveInProgress.current = true
    setSavingImage(true)
    setImageFeedback(null)
    try {
      const svg = figureRef.current?.querySelector<SVGSVGElement>(chartType === 'bar' ? '.ggs-bars-svg' : '.ggs-chart-svg')
      if (!svg) throw new Error('保存するグラフがありません。')
      await saveGoldenglowTargetSwitchChartImage({
        svg, chartType,
        series: visibleRows.map((row) => ({
          resistance: row.enemyResistance,
          color: chartType === 'bar' ? goldenglowResistanceBarColor(row.enemyResistance, barColors) : resistanceColor(row.enemyResistance),
          dash: chartType === 'line' ? resistanceDash(row.enemyResistance) : undefined,
        })),
        filename: `goldenglow-target-switch-${chartType}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      })
      setImageFeedback('saved')
    } catch {
      setImageFeedback('failed')
    } finally {
      imageSaveInProgress.current = false
      setSavingImage(false)
    }
  }

  const toggleResistance = (resistance: number) => {
    const next = new Set(hidden)
    if (next.has(resistance)) next.delete(resistance)
    else next.add(resistance)
    setVisibility({ key: resistanceKey, hidden: next })
  }
  const pointKey = (row: GoldenglowTargetSwitchGridRow, index: number) => `${row.enemyResistance}:${index}`
  const selectWithKeyboard = (event: KeyboardEvent<SVGGElement>, row: GoldenglowTargetSwitchGridRow, index: number) => {
    let next: SelectedPoint | undefined
    const indexes = enemyHps.flatMap((_, itemIndex) => isValidPoint(row, itemIndex) ? [itemIndex] : [])
    const currentIndex = indexes.indexOf(index)
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const nextIndex = indexes[Math.max(0, Math.min(indexes.length - 1, currentIndex + (event.key === 'ArrowRight' ? 1 : -1)))]
      next = { row, index: nextIndex }
    } else if (event.key === 'Home' || event.key === 'End') {
      next = { row, index: event.key === 'Home' ? indexes[0] : indexes[indexes.length - 1] }
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const candidates = visibleRows.filter((item) => isValidPoint(item, index))
      const nextRow = candidates[Math.max(0, Math.min(candidates.length - 1, candidates.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1)))]
      if (nextRow) next = { row: nextRow, index }
    } else if (event.key === 'Enter' || event.key === ' ') next = { row, index }
    if (!next) return
    event.preventDefault()
    setSelection(next)
    pointRefs.current.get(pointKey(next.row, next.index))?.focus()
  }

  return <CollapsibleCalculatorPanel id="ggs-chart-panel" number="04" title="HP別の期待ダメージ比較"
    summary={rangeLabel} collapsedLabel="グラフを表示">
    {controls}
    {status === 'running' && <p className="ggs-status" role="status">計算中… {rows.length} / {enemyResistances.length}行</p>}
    <div className="ggs-chart-heading">
      <h3 className="gg-table-title" id={chartTitleId}>スキル総ダメージ期待値</h3>
      <div className="ggs-chart-display-controls">
      {chartType === 'bar' && <div className="ggs-chart-color-controls">
        <label className="ggs-chart-palette">
          配色
          <select value={barPalette} onChange={(event) => setBarPalette(event.target.value as GoldenglowBarPaletteKey | 'custom')}>
            {Object.entries(GOLDENGLOW_BAR_PALETTES).map(([key, palette]) => <option key={key} value={key}>{palette.label}</option>)}
            <option value="custom">カスタム</option>
          </select>
        </label>
        {barPalette === 'custom' && <div className="ggs-chart-custom-color">
          <input className="ggs-chart-color-picker" type="color" aria-label="棒のカスタム色" value={customColor}
            onChange={(event) => { setCustomColor(event.target.value); setCustomColorText(event.target.value) }} />
          <input className="ggs-chart-color-code" type="text" aria-label="棒の色コード" value={customColorText}
            spellCheck={false} autoCapitalize="off" maxLength={7} aria-invalid={!/^#?[0-9a-fA-F]{6}$/.test(customColorText)}
            onChange={(event) => {
              const value = event.target.value
              setCustomColorText(value)
              const match = value.match(/^#?([0-9a-fA-F]{6})$/)
              if (match) setCustomColor(`#${match[1].toLowerCase()}`)
            }} onBlur={() => setCustomColorText(customColor)} />
        </div>}
      </div>}
      <div className="ggs-chart-type" role="group" aria-label="グラフの種類">
        <button type="button" aria-pressed={chartType === 'bar'} onClick={() => setChartType('bar')}>集合棒グラフ</button>
        <button type="button" aria-pressed={chartType === 'line'} onClick={() => setChartType('line')}>折れ線グラフ</button>
      </div>
      <button type="button" className="button secondary ggs-chart-save-image" aria-label="グラフをPNG画像で保存"
        disabled={!canSaveImage || savingImage} aria-busy={savingImage}
        onClick={() => void saveChartImage()}>{savingImage ? '画像を作成中…' : '画像を保存'}</button>
      </div>
    </div>
    <p role="status" className={imageFeedback === 'failed' ? 'ggs-error' : 'visually-hidden'}>
      {imageFeedback === 'failed' ? '画像を保存できませんでした。もう一度お試しください。'
        : imageFeedback === 'saved' ? 'PNG画像のダウンロードを開始しました。' : ''}
    </p>
    <figure className="ggs-chart" ref={figureRef}>
      <figcaption className="ggs-chart-legend">
        <div className="ggs-chart-legend-heading">
          <strong>術耐性</strong>
          <div className="ggs-chart-legend-actions">
            <button type="button" onClick={() => setVisibility({ key: resistanceKey, hidden: new Set() })} disabled={hidden.size === 0}>すべて表示</button>
            <button type="button" onClick={() => setVisibility({ key: resistanceKey, hidden: new Set(enemyResistances) })} disabled={hidden.size === enemyResistances.length}>すべて非表示</button>
          </div>
        </div>
        <div className="ggs-chart-series-buttons" role="group" aria-label="グラフに表示する術耐性">
          {enemyResistances.map((resistance) => <button type="button" key={resistance}
            aria-label={`術耐性 ${resistance}`} aria-pressed={!hidden.has(resistance)} onClick={() => toggleResistance(resistance)}>
            <svg viewBox="0 0 24 8" aria-hidden="true">{chartType === 'bar'
              ? <rect x="4" y="0" width="16" height="8" fill={goldenglowResistanceBarColor(resistance, barColors)} />
              : <line x1="0" x2="24" y1="4" y2="4" stroke={resistanceColor(resistance)} strokeWidth="2.5" strokeDasharray={resistanceDash(resistance)} />}</svg>
            {resistance}
          </button>)}
        </div>
      </figcaption>
      <div hidden={chartType !== 'bar'}>
        <GoldenglowTargetSwitchGroupedBars enemyHps={enemyHps} rows={orderedRows} visibleRows={visibleRows}
          showDecimals={showDecimals} colors={barColors} error={Boolean(error)}
          emptyMessage={emptyMessage && (!hasData || error || !firstRow) ? emptyMessage : null} />
      </div>
      <div hidden={chartType !== 'line'}>
      <div className="ggs-chart-frame" ref={frameRef}>
        <svg className="ggs-chart-svg" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-labelledby={chartTitleId} aria-describedby={chartDescriptionId}>
          <desc id={chartDescriptionId}>横軸は敵HP、縦軸はスキル総ダメージ期待値です。術耐性ごとの計算値を点と直線で示します。点を選択すると値を確認できます。左右キーでHP、上下キーで術耐性を移動し、Home・Endキーで系列の両端へ移動できます。</desc>
          {yTicks.map((tick) => <g key={tick} aria-hidden="true">
            <line className="ggs-chart-grid" x1={margin.left} x2={plotRight} y1={getY(tick)} y2={getY(tick)} />
            <text className="ggs-chart-tick" x={margin.left - 8} y={getY(tick) + 4} textAnchor="end">{damageFormat.format(tick)}</text>
          </g>)}
          <rect className="ggs-chart-axis" x={margin.left} y={margin.top} width={plotRight - margin.left} height={plotBottom - margin.top} aria-hidden="true" />
          {visibleRows.map((row) => {
            let segmentOpen = false
            const path = enemyHps.map((hp, index) => {
              if (!isValidPoint(row, index)) { segmentOpen = false; return '' }
              const instruction = `${segmentOpen ? 'L' : 'M'} ${getX(hp)} ${getY(row.expectedDamages[index])}`
              segmentOpen = true
              return instruction
            }).join(' ')
            const color = resistanceColor(row.enemyResistance)
            return <g key={row.enemyResistance} className="ggs-chart-series" aria-label={`術耐性 ${row.enemyResistance}の系列`}>
              <path className="ggs-chart-line" d={path} stroke={color} strokeDasharray={resistanceDash(row.enemyResistance)} aria-hidden="true" />
              {enemyHps.map((hp, index) => {
                if (!isValidPoint(row, index)) return null
                const active = selected?.row === row && selected.index === index
                return <g key={hp} role="button" className={`ggs-chart-point${active ? ' selected' : ''}`}
                  ref={(element) => { if (element) pointRefs.current.set(pointKey(row, index), element); else pointRefs.current.delete(pointKey(row, index)) }}
                  tabIndex={tabPoint?.row === row && tabPoint.index === index ? 0 : -1}
                  aria-label={`HP ${integerFormat.format(hp)}、術耐性 ${row.enemyResistance}、スキル総ダメージ期待値 ${damageFormat.format(row.expectedDamages[index])}`}
                  aria-describedby={active ? pointDescriptionId : undefined}
                  onPointerEnter={() => setSelection({ row, index })} onFocus={() => setSelection({ row, index })}
                  onClick={() => setSelection({ row, index })} onKeyDown={(event) => selectWithKeyboard(event, row, index)}>
                  <circle className="ggs-chart-point-target" cx={getX(hp)} cy={getY(row.expectedDamages[index])} r="9" />
                  <circle className="ggs-chart-point-dot" cx={getX(hp)} cy={getY(row.expectedDamages[index])} r={active ? 4.5 : 3} stroke={color} fill={active ? color : '#fff'} />
                </g>
              })}
            </g>
          })}
          {tickIndexes.map((index, tickIndex) => <g key={index} aria-hidden="true">
            <line className="ggs-chart-axis-mark" x1={getX(enemyHps[index])} x2={getX(enemyHps[index])} y1={plotBottom} y2={plotBottom + 4} />
            <text className="ggs-chart-tick" x={getX(enemyHps[index])} y={plotBottom + 20}
              textAnchor={tickIndex === 0 ? 'start' : tickIndex === tickIndexes.length - 1 ? 'end' : 'middle'}>{integerFormat.format(enemyHps[index])}</text>
          </g>)}
          <text className="ggs-chart-axis-title" x={(margin.left + plotRight) / 2} y={height - 8} textAnchor="middle" aria-hidden="true">敵HP</text>
          <text className="ggs-chart-axis-title" transform={`translate(14 ${(margin.top + plotBottom) / 2}) rotate(-90)`} textAnchor="middle" aria-hidden="true">期待ダメージ</text>
        </svg>
        {emptyMessage && (!hasData || error || !firstRow) && <p className={`ggs-chart-empty${error ? ' ggs-error' : ''}`} role={error ? 'alert' : 'status'}>{emptyMessage}</p>}
      </div>
      {selected && <output className="ggs-chart-selected" id={pointDescriptionId} aria-live="off">
        <span>HP <strong>{integerFormat.format(enemyHps[selected.index])}</strong></span>
        <span>術耐性 <strong>{selected.row.enemyResistance}</strong></span>
        <span>期待ダメージ <strong>{damageFormat.format(selected.row.expectedDamages[selected.index])}</strong></span>
      </output>}
      </div>
    </figure>
  </CollapsibleCalculatorPanel>
}

function niceStep(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const fraction = value / magnitude
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude
}

function resistanceColor(resistance: number) {
  const hue = ((resistance / 5 * 137.508 + 214) % 360 + 360) % 360
  return `hsl(${hue.toFixed(1)} 64% 40%)`
}

function resistanceDash(resistance: number) {
  return dashPatterns[Math.abs(Math.round(resistance / 20)) % dashPatterns.length]
}
