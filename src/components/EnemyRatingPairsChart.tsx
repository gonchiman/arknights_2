import { useLayoutEffect, useRef, useState } from 'react'
import { getEnemyHeatmapOpacity } from '../lib/enemyHeatmapColor'
import type { EnemyRatingPairs } from '../lib/enemyRatingPairs'
import { DamageCalculatorThreeAttributeChartImageDialog, type DamageCalculatorThreeAttributeChartImageSnapshot } from './DamageCalculatorThreeAttributeChartImageDialog'
import { OutputImageSaveButton } from './OutputImageSaveButton'
import './EnemyJointHeatmap.css'
import './EnemyRatingPairsChart.css'

interface PlotProps {
  distribution: EnemyRatingPairs
  countLabel: string
  unit: string
}
interface ImageProps extends PlotProps {
  versionId: string
  scopeLabel: string
  groupingLabel: string
  filterLabel: string
  coverageLabel?: string
  parentLocation?: readonly string[]
}

const number = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const formatRate = new Intl.NumberFormat('ja-JP', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const horizontalAxis = '防御力（ゲーム内評価）'
const naturalHeight = (data: EnemyRatingPairs) => data.labels.length > 2 ? 360 : 174
const cellMaximum = (data: EnemyRatingPairs) => Math.max(0, ...data.cells.flat())

export function getEnemyRatingPairsFocus(data: EnemyRatingPairs, unit: string) {
  if (data.labels.length !== 2 || !data.defenseTotals[1]) return undefined
  const highDefense = data.defenseTotals[1]
  const bothHigh = data.cells[1][1]
  return `防御力A+以上の${number.format(highDefense)}${unit}のうち、術耐性もA+以上は${number.format(bothHigh)}${unit}（${formatRate.format(bothHigh / highDefense)}）`
}

function PairLegend({ countLabel, maximum, unit }: { countLabel: string; maximum: number; unit: string }) {
  return <span className="enemy-rating-pairs-legend">
    <span>{countLabel}</span><span>0</span>
    <svg width="52" height="10" aria-hidden="true">
      <rect width="52" height="10" className="enemy-joint-tile" />
      {[0, 1, 2, 3, 4].map(step => <rect key={step} x={step * 10.4} width="10.4" height="10"
        className="enemy-joint-color" fillOpacity={getEnemyHeatmapOpacity(step, 4)} />)}
    </svg>
    <span>{number.format(maximum)}{unit}</span>
  </span>
}

function PairPlot({ distribution: data, countLabel, unit, width, height, image = false }: PlotProps & {
  width: number; height: number; image?: boolean
}) {
  const left = data.labels.length === 2 ? 88 : 55
  const right = width - 62
  const top = 28
  const bottom = height - (image ? 30 : 59)
  const columns = data.labels.length
  const cellWidth = (right - left) / columns
  const cellHeight = (bottom - top) / columns
  const x = (i: number) => left + (i + 0.5) * cellWidth
  const y = (i: number) => bottom - (i + 0.5) * cellHeight
  const maximum = cellMaximum(data)
  return <svg className={`enemy-joint-svg${image ? ' enemy-joint-svg-image' : ''}`} width={width} height={height}
    viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`防御力と術耐性の組み合わせ、${countLabel} ${number.format(data.total)}${unit}`}>
    <desc>{`横軸は防御力、縦軸は術耐性。防御力は ${data.labels.join('、')} の順。 ${data.cells.map((row, i) =>
      '術耐性' + data.labels[i] + 'は ' + row.map(n => number.format(n)).join('、')).join('。')}`}</desc>
    <rect className="enemy-joint-background" width={width} height={height} />
    <text className="enemy-joint-axis-title" x={13} y={(top + bottom) / 2}
      textAnchor="middle" transform={`rotate(-90 13 ${(top + bottom) / 2})`}>術耐性</text>
    {data.labels.map((label, i) => <g key={label}>
      <text className="enemy-joint-tick" x={x(i)} y={top - 8} textAnchor="middle">{label}</text>
      <text className="enemy-joint-tick" x={left - 7} y={y(i)} textAnchor="end" dominantBaseline="central">{label}</text>
    </g>)}
    {data.cells.map((row, ry) => row.map((value, dx) => {
      const rect = { x: left + dx * cellWidth + 1, y: bottom - (ry + 1) * cellHeight + 1, width: cellWidth - 2, height: cellHeight - 2 }
      return <g key={data.labels[ry] + '/' + data.labels[dx]}>
        <rect {...rect} className="enemy-joint-tile" />
        <rect {...rect} className="enemy-joint-color" fillOpacity={getEnemyHeatmapOpacity(value, maximum)} />
        <text className={value ? 'enemy-joint-count' : 'enemy-joint-count enemy-joint-zero'}
          x={x(dx)} y={y(ry)} textAnchor="middle" dominantBaseline="central">{number.format(value)}</text>
      </g>
    }))}
    <g className="enemy-joint-total">
      <text x={width - 7} y={top - 8} textAnchor="end">合計</text>
      <text x={left - 7} y={bottom + 19} textAnchor="end">合計</text>
      {data.labels.map((label, i) => <g key={label}>
        <text x={width - 7} y={y(i)} textAnchor="end" dominantBaseline="central">{number.format(data.resistanceTotals[i])}</text>
        <text x={x(i)} y={bottom + 19} textAnchor="middle">{number.format(data.defenseTotals[i])}</text>
      </g>)}
      <text x={width - 7} y={bottom + 19} textAnchor="end">{number.format(data.total)}</text>
    </g>
    {!image && <text className="enemy-joint-axis-title" x={(left + right) / 2} y={height - 8} textAnchor="middle">{horizontalAxis}</text>}
  </svg>
}

export function EnemyRatingPairsChart(props: PlotProps) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const update = () => setWidth(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const minimumWidth = props.distribution.labels.length === 2 ? 300 : 640
  return <div className="enemy-rating-pairs-chart">
    <PairLegend countLabel={props.countLabel} maximum={cellMaximum(props.distribution)} unit={props.unit} />
    <div className="enemy-joint-scroll" ref={container} role="region" aria-label="防御力と術耐性のヒートマップ" tabIndex={0}>
      <PairPlot {...props} width={Math.max(width, minimumWidth)} height={naturalHeight(props.distribution) + 29} />
    </div>
  </div>
}

export function EnemyRatingPairsImageButton({ distribution, countLabel, unit, versionId, scopeLabel, groupingLabel, filterLabel, coverageLabel, parentLocation }: ImageProps) {
  const [snapshot, setSnapshot] = useState<DamageCalculatorThreeAttributeChartImageSnapshot | null>(null)
  function open() {
    const conditions = [`集計版 ${versionId}`, scopeLabel, filterLabel, countLabel, groupingLabel]
    setSnapshot({
      title: '防御力と術耐性の組み合わせ',
      axisTitle: horizontalAxis,
      conditions: [...conditions, `有効 ${number.format(distribution.total)}${unit}`,
        `値なし ${number.format(distribution.missing)}${unit}`, ...(coverageLabel ? [coverageLabel] : [])],
      filenameParts: conditions,
      naturalChartHeight: naturalHeight(distribution),
      footerNote: getEnemyRatingPairsFocus(distribution, unit),
      legend: <PairLegend countLabel={countLabel} maximum={cellMaximum(distribution)} unit={unit} />,
      chart: size => <PairPlot {...size} distribution={distribution} countLabel={countLabel} unit={unit} image />,
    })
  }
  return <>
    <OutputImageSaveButton onClick={open} />
    {snapshot && <DamageCalculatorThreeAttributeChartImageDialog snapshot={snapshot} parentLocation={parentLocation}
      helpMode="none" onClose={() => setSnapshot(null)} />}
  </>
}
