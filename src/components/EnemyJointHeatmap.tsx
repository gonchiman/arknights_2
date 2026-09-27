import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { EnemyJointDistribution } from '../lib/enemyJointDistribution'
import { ENEMY_HISTOGRAM_COUNT_MODES } from '../lib/enemyHistogramCounts'
import { getEnemyHeatmapOpacity, type EnemyHeatmapColorScale } from '../lib/enemyHeatmapColor'
import './EnemyJointHeatmap.css'

type JointCell = EnemyJointDistribution['cells'][number][number]
interface CellSelection { distribution: EnemyJointDistribution; cell: JointCell }

const SCREEN_HEIGHT = 392
const MINIMUM_WIDTH = 640
const formatCount = (value: number) => value.toLocaleString('ja-JP')
const formatPercent = (proportion: number) => `${(proportion * 100).toFixed(1)}%`

function getLayout(distribution: EnemyJointDistribution, width: number, height: number, image: boolean) {
  const left = 88, top = 28, right = width - 62, bottom = height - (image ? 36 : 60)
  const columnWidth = (right - left) / distribution.hpBins.length
  const rowHeight = (bottom - top) / distribution.resistanceBins.length
  const cellRect = (cell: JointCell) => ({
    x: left + cell.hpIndex * columnWidth + 1.5,
    y: top + (distribution.resistanceBins.length - 1 - cell.resistanceIndex) * rowHeight + 1.5,
    width: columnWidth - 3,
    height: rowHeight - 3,
  })
  return { left, right, top, bottom, columnWidth, rowHeight, cellRect }
}

function cellLabel(distribution: EnemyJointDistribution, cell: JointCell) {
  const hp = distribution.hpBins[cell.hpIndex]
  const resistance = distribution.resistanceBins[cell.resistanceIndex]
  const mode = ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === distribution.countMode)!
  return `HP ${hp.label}（${hp.rangeLabel}）、術耐性 ${resistance.rangeLabel}：${formatCount(cell.count)}${mode.unit}（対象の${formatPercent(cell.proportion)}）`
}

/** Stateless SVG shared by the screen and the saved image. */
export function EnemyJointHeatmapSvg({ distribution, colorScale = 'LINEAR', width, height, image = false }: {
  distribution: EnemyJointDistribution
  colorScale?: EnemyHeatmapColorScale
  width: number
  height: number
  image?: boolean
}) {
  const layout = getLayout(distribution, width, height, image)
  const { left, right, top, bottom, columnWidth, rowHeight, cellRect } = layout
  const mode = ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === distribution.countMode)!
  const proportion = (count: number) => distribution.count > 0 ? count / distribution.count : 0
  return (
    <svg className={`enemy-joint-svg${image ? ' enemy-joint-svg-image' : ''}`}
      width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      role="img" aria-label={`HPと術耐性ごとの敵の${mode.axisLabel}、対象${formatCount(distribution.count)}${mode.unit}`}>
      <desc>横軸はHPランク、縦軸は術耐性。セルの数字と色の濃さは敵の{mode.axisLabel}。周辺の割合は対象全体に占める割合。</desc>
      <rect className="enemy-joint-background" width={width} height={height} />
      <text className="enemy-joint-axis-title" x={16} y={(top + bottom) / 2}
        textAnchor="middle" transform={`rotate(-90 16 ${(top + bottom) / 2})`}>術耐性</text>
      {distribution.hpBins.map((bin, index) => <text className="enemy-joint-tick" key={bin.key}
        x={left + (index + 0.5) * columnWidth} y={top - 10} textAnchor="middle">{bin.label}</text>)}
      {distribution.resistanceBins.map((bin, index) => <text className="enemy-joint-tick" key={bin.key}
        x={left - 9} y={top + (distribution.resistanceBins.length - index - 0.5) * rowHeight}
        textAnchor="end" dominantBaseline="central">{bin.label}</text>)}
      <rect className="enemy-joint-frame" x={left} y={top} width={right - left} height={bottom - top} />
      {distribution.cells.flatMap((row) => row.map((cell) => {
        const rect = cellRect(cell)
        const intensity = getEnemyHeatmapOpacity(cell.count, distribution.maximumCount, colorScale)
        return <g key={`${cell.resistanceIndex}-${cell.hpIndex}`}>
          <title>{cellLabel(distribution, cell)}</title>
          <rect className="enemy-joint-tile" {...rect} />
          <rect className="enemy-joint-color" {...rect} fillOpacity={intensity} />
          <text className={`enemy-joint-count${cell.count === 0 ? ' enemy-joint-zero' : ''}`}
            x={rect.x + rect.width / 2} y={rect.y + rect.height / 2}
            textAnchor="middle" dominantBaseline="central">{formatCount(cell.count)}</text>
        </g>
      }))}
      <text className="enemy-joint-total" x={width - 8} y={top - 10} textAnchor="end">割合</text>
      {distribution.resistanceTotals.map((count, index) => <text className="enemy-joint-total" key={index}
        x={width - 8} y={top + (distribution.resistanceBins.length - index - 0.5) * rowHeight}
        textAnchor="end" dominantBaseline="central">{formatPercent(proportion(count))}</text>)}
      <text className="enemy-joint-total" x={left - 9} y={bottom + 22} textAnchor="end">HP別割合</text>
      {distribution.hpTotals.map((count, index) => <text className="enemy-joint-total" key={index}
        x={left + (index + 0.5) * columnWidth} y={bottom + 22}
        textAnchor="middle">{formatPercent(proportion(count))}</text>)}
      {!image && <text className="enemy-joint-axis-title" x={(left + right) / 2} y={height - 8}
        textAnchor="middle">HP（ランク）</text>}
    </svg>
  )
}

export function EnemyJointHeatmap({ distribution, colorScale, onColorScaleChange }: {
  distribution: EnemyJointDistribution
  colorScale: EnemyHeatmapColorScale
  onColorScaleChange: (value: EnemyHeatmapColorScale) => void
}) {
  const mode = ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === distribution.countMode)!
  const titleId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [width, setWidth] = useState(MINIMUM_WIDTH)
  const [hovered, setHovered] = useState<CellSelection | null>(null)
  const [focused, setFocused] = useState<CellSelection | null>(null)
  const [pinned, setPinned] = useState<CellSelection | null>(null)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => setWidth(Math.max(MINIMUM_WIDTH, Math.floor(container.clientWidth)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const current = (selection: CellSelection | null) => selection?.distribution === distribution ? selection.cell : null
  const pinnedCell = current(pinned)
  const activeCell = current(hovered) ?? current(focused) ?? pinnedCell
  const layout = getLayout(distribution, width, SCREEN_HEIGHT, false)
  const displayCells = [...distribution.cells].reverse().flatMap((row) => row)
  const hpBin = activeCell ? distribution.hpBins[activeCell.hpIndex] : null
  const resistanceBin = activeCell ? distribution.resistanceBins[activeCell.resistanceIndex] : null
  const examples = activeCell ? [...new Set(activeCell.enemies.map((enemy) => enemy.name))].slice(0, 4) : []
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const columns = distribution.hpBins.length
    const column = index % columns
    let next = index
    if (event.key === 'ArrowRight') next = Math.min(index + 1, index - column + columns - 1)
    else if (event.key === 'ArrowLeft') next = Math.max(index - 1, index - column)
    else if (event.key === 'ArrowDown') next = Math.min(index + columns, displayCells.length - columns + column)
    else if (event.key === 'ArrowUp') next = Math.max(index - columns, column)
    else if (event.key === 'Home') next = index - column
    else if (event.key === 'End') next = index - column + columns - 1
    else if (event.key === 'Escape') {
      setPinned(null)
      setHovered(null)
      setFocused(null)
      return
    } else return
    event.preventDefault()
    cellRefs.current[next]?.focus()
  }

  return (
    <figure className="enemy-analysis-figure enemy-joint-figure" aria-labelledby={titleId}>
      <figcaption>
        <div>
          <strong id={titleId}>HP × 術耐性</strong>
          <span>対象 {formatCount(distribution.count)}{mode.unit}{distribution.missingCount > 0 && `・数値不明など ${formatCount(distribution.missingCount)}${mode.unit}を除外`}</span>
        </div>
        <div className="enemy-joint-display-options">
          <div className="enemy-joint-color-scale">
            <span>濃淡</span>
            <div className="enemy-chart-scale-switch" role="group" aria-label="ヒートマップの濃淡">
              <button type="button" className={colorScale === 'LINEAR' ? 'active' : ''} aria-pressed={colorScale === 'LINEAR'}
                onClick={() => onColorScaleChange('LINEAR')}>件数に比例</button>
              <button type="button" className={colorScale === 'SQRT' ? 'active' : ''} aria-pressed={colorScale === 'SQRT'}
                onClick={() => onColorScaleChange('SQRT')}>中程度を見やすく</button>
            </div>
          </div>
          <div className="enemy-joint-legend" aria-label={`色と数字は敵の${mode.axisLabel}`}>
            <span>少ない</span><i aria-hidden="true" /><span>多い</span><span>数字：{mode.axisLabel}</span>
          </div>
        </div>
      </figcaption>
      <div className="enemy-joint-scroll" ref={containerRef}>
        <div className="enemy-joint-chart" style={{ width, height: SCREEN_HEIGHT }}>
          <div aria-hidden="true"><EnemyJointHeatmapSvg distribution={distribution} colorScale={colorScale} width={width} height={SCREEN_HEIGHT} /></div>
          <div className="enemy-joint-cell-controls" role="group" aria-label="HPと術耐性の組み合わせ">
            {displayCells.map((cell, index) => {
              const rect = layout.cellRect(cell)
              return <button type="button" key={`${cell.resistanceIndex}-${cell.hpIndex}`}
                ref={(element) => { cellRefs.current[index] = element }}
                className={`enemy-joint-cell-control${cell === activeCell ? ' is-active' : ''}`}
                style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                aria-label={cellLabel(distribution, cell)} aria-pressed={cell === pinnedCell}
                onPointerEnter={(event) => { if (event.pointerType !== 'touch') setHovered({ distribution, cell }) }}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => { setHovered(null); setFocused({ distribution, cell }) }} onBlur={() => setFocused(null)}
                onClick={() => setPinned(cell === pinnedCell ? null : { distribution, cell })}
                onKeyDown={(event) => navigate(event, index)} />
            })}
          </div>
        </div>
      </div>
      {distribution.count === 0 && <div className="enemy-joint-empty" role="status">集計できる敵がありません</div>}
      <div className="enemy-joint-detail" aria-live="polite" aria-atomic="true">
        {activeCell && hpBin && resistanceBin && <>
          <div className="enemy-joint-detail-heading">
            <strong>HP {hpBin.label}（{hpBin.rangeLabel}）・術耐性 {resistanceBin.rangeLabel}</strong>
            <span>{formatCount(activeCell.count)}{mode.unit}（対象の{formatPercent(activeCell.proportion)}）</span>
          </div>
          {examples.length > 0 && <div className="enemy-joint-examples">{examples.join('・')}{activeCell.enemies.length > examples.length ? ' ほか' : ''}</div>}
        </>}
      </div>
      {distribution.countMode !== 'TYPES' && pinnedCell && pinnedCell.enemies.length > 0 && (
        <details className="enemy-joint-contributions" key={`${distribution.countMode}-${pinnedCell.hpIndex}-${pinnedCell.resistanceIndex}`}>
          <summary>敵別の内訳（{formatCount(pinnedCell.enemies.length)}種類）</summary>
          <div className="enemy-frequency-table-wrapper">
            <table className="enemy-frequency-table enemy-joint-contribution-table">
              <caption>HP {distribution.hpBins[pinnedCell.hpIndex].label}・術耐性 {distribution.resistanceBins[pinnedCell.resistanceIndex].rangeLabel}</caption>
              <thead><tr><th scope="col">敵</th><th scope="col">HP</th><th scope="col">術耐性</th><th scope="col">{mode.axisLabel}</th></tr></thead>
              <tbody>{pinnedCell.enemies.map((enemy) => <tr key={enemy.id}>
                <th scope="row">{enemy.name}</th>
                <td>{formatCount(enemy.stats.maxHp!)}</td><td>{formatCount(enemy.stats.magicResistance!)}</td>
                <td>{formatCount(pinnedCell.enemyCounts[enemy.id])}{mode.unit}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details>
      )}
      <details className="enemy-joint-help">
        <summary>集計・表示方法</summary>
        <p>{distribution.countMode === 'TYPES'
          ? '現在の絞り込み対象を敵IDごとに1種類として数えます。出現数ではありません。'
          : distribution.countMode === 'MAPS'
            ? '現在の絞り込み対象について、敵ごとの登場マップ数を合計します。同じマップに同じ区間の敵が複数種類いれば、それぞれ加算します。'
            : '現在の絞り込み対象について、出現数を確定できるマップの敵配置数を合計します。ランダム出現や条件付き増援を含むマップは除外します。'}HP・術耐性は基礎ステータスを使い、ステージ補正は含めません。両方の数値が有効な敵を集計し、不明な値や範囲外の値は除外します。</p>
        <p>割合の分母は集計対象の{mode.axisLabel}の合計です。HPのS・S+・SSは「S以上」にまとめています。色の濃さは最多のセルを基準にしています。</p>
        <p>「件数に比例」は件数と同じ比率で色を濃くします。「中程度を見やすく」はその比率の平方根を使い、最多のセルの濃さを保ちながら、中程度の件数にも色を付けます。件数や割合の値は変わりません。</p>
      </details>
    </figure>
  )
}
