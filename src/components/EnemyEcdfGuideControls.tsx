import { useId, useRef } from 'react'
import type { EcdfGuideReadings } from '../lib/enemyEcdfGuides'
import './EnemyEcdfGuideControls.css'

interface EnemyEcdfGuideControlsProps {
  metricLabel: string
  suffix: string
  xInput: string
  yInput: string
  onXChange: (value: string) => void
  onYChange: (value: string) => void
  xError: string | null
  yError: string | null
  hasData: boolean
  readings: EcdfGuideReadings
}

const valueFormatter = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 12 })
const proportionFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 })

export function EnemyEcdfGuideControls({
  metricLabel, suffix, xInput, yInput, onXChange, onYChange,
  xError, yError, hasData, readings,
}: EnemyEcdfGuideControlsProps) {
  const headingId = useId()
  const xInputId = useId()
  const yInputId = useId()
  const xResultId = useId()
  const yResultId = useId()
  const xRef = useRef<HTMLInputElement>(null)
  const yRef = useRef<HTMLInputElement>(null)
  const xReading = readings.x
  const yReading = readings.y
  const xResult = xError ?? (xInput === '' ? '' : !hasData
    ? '数値データがありません'
    : xReading
      ? `${valueFormatter.format(xReading.value)}${suffix}以下：${proportionFormatter.format(xReading.proportion * 100)}%（${valueFormatter.format(xReading.cumulativeCount)}体）${xReading.inRange ? '' : ' · 表示範囲外'}`
      : '')
  const yResult = yError ?? (yInput === '' ? '' : !hasData
    ? '数値データがありません'
    : yReading
      ? yReading.percentage === 0
        ? `0%：最小${metricLabel}未満`
        : `${valueFormatter.format(yReading.percentage)}%以上になる最小${metricLabel}：${yReading.value === null ? '—' : valueFormatter.format(yReading.value) + suffix}`
      : '')

  return <div className="enemy-ecdf-guide-settings" role="group" aria-labelledby={headingId}>
    <h3 id={headingId}>補助線</h3>
    <div className="enemy-ecdf-guide-fields">
      <div className="enemy-ecdf-guide-field">
        <label htmlFor={xInputId}>横軸の値：{metricLabel}（縦線{suffix ? `・${suffix}` : ''}）</label>
        <div className="enemy-ecdf-guide-input-row">
          <input
            ref={xRef}
            id={xInputId}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="指定なし"
            value={xInput}
            onChange={(event) => onXChange(event.target.value)}
            aria-invalid={Boolean(xError)}
            aria-describedby={xResult ? xResultId : undefined}
          />
          <button type="button" aria-label="縦線を消去" disabled={xInput === ''} onClick={() => {
            onXChange('')
            xRef.current?.focus()
          }}>消去</button>
        </div>
        <div id={xResultId} className={`enemy-ecdf-guide-readout${xError ? ' error' : ''}`} aria-live="polite" aria-atomic="true">{xResult}</div>
      </div>
      <div className="enemy-ecdf-guide-field">
        <label htmlFor={yInputId}>縦軸の値：累積割合（横線・%）</label>
        <div className="enemy-ecdf-guide-input-row">
          <input
            ref={yRef}
            id={yInputId}
            type="number"
            min="0"
            max="100"
            step="any"
            inputMode="decimal"
            placeholder="指定なし"
            value={yInput}
            onChange={(event) => onYChange(event.target.value)}
            aria-invalid={Boolean(yError)}
            aria-describedby={yResult ? yResultId : undefined}
          />
          <button type="button" aria-label="横線を消去" disabled={yInput === ''} onClick={() => {
            onYChange('')
            yRef.current?.focus()
          }}>消去</button>
        </div>
        <div id={yResultId} className={`enemy-ecdf-guide-readout${yError ? ' error' : ''}`} aria-live="polite" aria-atomic="true">{yResult}</div>
      </div>
    </div>
  </div>
}
