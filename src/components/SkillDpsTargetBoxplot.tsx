import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import type { SkillDpsTargetGroup } from '../lib/skillDpsTargetGroups'
import './SkillDpsTargetBoxplot.css'

export const SKILL_DPS_TARGET_BOXPLOT_HEIGHT = 354

interface Props {
  groups: readonly SkillDpsTargetGroup[]
  yLabel: string
  imageSize?: { width: number; height: number }
}

const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const COMPACT = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 })
const format = (value: number) => Math.abs(value) >= 10_000 ? COMPACT.format(value) : NUMBER.format(value)
const SUMMARY = [
  ['count', '件数'], ['firstQuartile', 'Q1'], ['median', '中央値'], ['thirdQuartile', 'Q3'],
] as const

export function SkillDpsTargetBoxplotLegend({ imageMode = false }: { imageMode?: boolean }) {
  return <ul className={`chart-image-frame-legend-list skill-dps-target-legend${imageMode ? ' is-image' : ''}`} aria-label="箱ひげ図の凡例">
    <li className="chart-image-frame-legend-item"><svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
      <rect x="2" y="2" width="14" height="8" className="skill-dps-target-box" />
    </svg><span>箱 中央50%</span></li>
    <li className="chart-image-frame-legend-item"><svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
      <line x1="9" x2="9" y1="1" y2="11" className="skill-dps-target-median" />
    </svg><span>中央値</span></li>
    <li className="chart-image-frame-legend-item"><svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
      <path d="M1 2V10M1 6H17M17 2V10" fill="none" className="skill-dps-target-whisker" />
    </svg><span>ひげ 1.5IQR</span></li>
    <li className="chart-image-frame-legend-item"><svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
      <circle cx="9" cy="6" r="2.5" className="skill-dps-target-outlier" />
    </svg><span>ひげ外</span></li>
  </ul>
}

/** Capacities are independent groups; the drawing has no selection, tooltip or zoom. */
export function SkillDpsTargetBoxplot({ groups, yLabel, imageSize }: Props) {
  const id = useId()
  const container = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(640)
  const forImage = imageSize !== undefined
  useLayoutEffect(() => {
    if (forImage) return
    const element = container.current
    if (!element) return
    let frame = 0
    const measure = () => {
      const next = Math.floor(element.clientWidth)
      if (next > 0) setMeasuredWidth(current => current === next ? current : next)
    }
    measure()
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    })
    observer.observe(element)
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame) }
  }, [forImage])

  const width = imageSize?.width ?? Math.max(measuredWidth, 86 + groups.length * 84)
  const height = imageSize?.height ?? SKILL_DPS_TARGET_BOXPLOT_HEIGHT
  const scrolls = !forImage && width > measuredWidth
  const left = 66, right = width - 20, top = 29
  const bottom = height - (forImage ? 104 : 128)
  const axis = useMemo(() => getHpChartValueAxis(groups.flatMap(group => [group.minimum, group.maximum])), [groups])
  const y = (value: number) => bottom - (value - axis.lowerLimit) / (axis.upperLimit - axis.lowerLimit) * (bottom - top)
  const slot = (right - left) / Math.max(1, groups.length)
  const halfBox = Math.min(24, slot * .24)
  const summaryTop = bottom + 30
  const description = groups.map(group => `${group.label}、${group.count}件、Q1 ${NUMBER.format(group.firstQuartile)}、中央値 ${NUMBER.format(group.median)}、Q3 ${NUMBER.format(group.thirdQuartile)}`).join('。')

  return <div className={`skill-dps-target-boxplot${forImage ? ' is-image' : ''}`} ref={container} style={imageSize}
    role={scrolls ? 'region' : undefined} aria-label={scrolls ? '最大攻撃対象数別の箱ひげ図' : undefined} tabIndex={scrolls ? 0 : undefined}>
    {groups.length === 0 ? <p className="skill-dps-target-empty" role="status">分析対象は0件です。</p> : <>
      <svg className="skill-dps-target-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        style={imageSize} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} focusable="false">
        <title id={`${id}-title`}>{`最大攻撃対象数別の${yLabel}`}</title>
        <desc id={`${id}-description`}>{description}。箱は中央50%、ひげは1.5IQR内の観測値です。</desc>
        {axis.yTicks.map(tick => <g key={tick}>
          <line className="skill-dps-target-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
          <text className="skill-dps-target-tick" x={left - 8} y={y(tick)} dy=".35em" textAnchor="end">{format(tick)}</text>
        </g>)}
        <line className="skill-dps-target-axis" x1={left} x2={left} y1={top} y2={bottom} />
        <line className="skill-dps-target-axis" x1={left} x2={right} y1={bottom} y2={bottom} />
        {groups.map((group, index) => {
          const center = left + slot * (index + .5)
          return <g key={group.key} className="skill-dps-target-group">
            <line className="skill-dps-target-whisker" x1={center} x2={center} y1={y(group.lowerWhisker)} y2={y(group.upperWhisker)} />
            {[group.lowerWhisker, group.upperWhisker].map((value, endpoint) => <line key={endpoint} className="skill-dps-target-whisker"
              x1={center - halfBox * .6} x2={center + halfBox * .6} y1={y(value)} y2={y(value)} />)}
            <rect className="skill-dps-target-box" x={center - halfBox} y={y(group.thirdQuartile)} width={halfBox * 2}
              height={Math.max(0, y(group.firstQuartile) - y(group.thirdQuartile))} />
            <line className="skill-dps-target-median" x1={center - halfBox} x2={center + halfBox} y1={y(group.median)} y2={y(group.median)} />
            {group.outliers.map((value, point) => <circle className="skill-dps-target-outlier" key={point} cx={center} cy={y(value)} r="3" />)}
            {group.count < 5 && group.values.map((point, index) => <circle className="skill-dps-target-point" key={`${point.id}:${index}`}
              cx={center + (index - (group.count - 1) / 2) * 5} cy={y(point.value)} r="3" />)}
            <text className="skill-dps-target-tick" x={center} y={bottom + 20} textAnchor="middle">{group.label}</text>
            {SUMMARY.map(([key], row) => <g key={key}>
              <rect className="skill-dps-target-summary-cell" x={left + slot * index + 2} y={summaryTop + row * 18}
                width={Math.max(0, slot - 4)} height="17" />
              <text className="skill-dps-target-summary-value" x={center} y={summaryTop + row * 18 + 12} textAnchor="middle">{format(group[key])}</text>
            </g>)}
          </g>
        })}
        {SUMMARY.map(([key, label], row) => <text key={key} className="skill-dps-target-summary-label" x={left - 8}
          y={summaryTop + row * 18 + 12} textAnchor="end">{label}</text>)}
        <text className="skill-dps-target-label" x={left} y="14">{yLabel}</text>
        {!forImage && <text className="skill-dps-target-label" x={(left + right) / 2} y={height - 6} textAnchor="middle">最大攻撃対象数</text>}
      </svg>
      {!forImage && <SkillDpsTargetBoxplotLegend />}
    </>}
  </div>
}
