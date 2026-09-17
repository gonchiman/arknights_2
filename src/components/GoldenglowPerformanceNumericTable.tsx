import { useMemo, useState } from 'react'
import { writeClipboardText } from '../lib/clipboard'
import {
  buildGoldenglowResistanceValues,
  DEFAULT_GOLDENGLOW_RESISTANCE_STEP,
  type GoldenglowComparisonBuild,
  type GoldenglowPerformanceComparisonColumn,
} from '../lib/goldenglowPerformanceComparison'
import {
  buildGoldenglowPerformanceTable,
  buildGoldenglowPerformanceTableTsv,
  type GoldenglowPerformanceTableMetric,
} from '../lib/goldenglowPerformanceTable'

export function GoldenglowPerformanceNumericTable({
  columns, metric, baselineId, digits, formatValue, title, condition, labelBuild,
  chartResistance, emptyMessage,
}: {
  columns: readonly GoldenglowPerformanceComparisonColumn[]
  metric: GoldenglowPerformanceTableMetric
  baselineId: string
  digits: number
  formatValue: (value: number) => string
  title: string
  condition?: string
  labelBuild: (build: GoldenglowComparisonBuild) => { name: string; detail: string }
  chartResistance?: number
  emptyMessage: string
}) {
  const [step, setStep] = useState(DEFAULT_GOLDENGLOW_RESISTANCE_STEP)
  const [stepInput, setStepInput] = useState(String(DEFAULT_GOLDENGLOW_RESISTANCE_STEP))
  const [extraInput, setExtraInput] = useState('')
  const [copying, setCopying] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; state: 'copied' | 'failed' } | null>(null)
  const extraNumber = extraInput.trim() === '' ? null : Number(extraInput)
  const invalidExtra = extraNumber !== null && (!Number.isFinite(extraNumber) || extraNumber < 0 || extraNumber > 100)
  const extraResistance = invalidExtra ? null : extraNumber
  const resistances = useMemo(() => [...new Set([
    ...buildGoldenglowResistanceValues(step),
    ...(extraResistance === null ? [] : [extraResistance]),
    ...(chartResistance === undefined ? [] : [chartResistance]),
  ])].sort((a, b) => a - b), [step, extraResistance, chartResistance])
  const comparison = useMemo(() => buildGoldenglowPerformanceTable(columns, metric, baselineId, resistances),
    [columns, metric, baselineId, resistances])
  const tableText = buildGoldenglowPerformanceTableTsv(comparison.map(({ build, values }) => {
    const label = labelBuild(build)
    return { label: `${label.name}（${label.detail}）［${title}${condition ? `・${condition}` : ''}］`, values }
  }), metric, digits)
  const copyState = copyFeedback?.text === tableText ? copyFeedback.state : null
  const baseline = columns.find(({ build }) => build.id === baselineId)
  const missingBaseline = metric !== 'total' && !baseline?.values.some(value => value.expectedTotalDamage !== null)
  const hasMissingValues = comparison.some(column => column.values.some(value => value.expectedTotalDamage === null))
  const copyTable = async () => {
    setCopying(true)
    try {
      await writeClipboardText(tableText)
      setCopyFeedback({ text: tableText, state: 'copied' })
    } catch {
      setCopyFeedback({ text: tableText, state: 'failed' })
    } finally {
      setCopying(false)
    }
  }

  return <div className="gg-performance-numeric-table">
    <div className="gg-performance-table-toolbar">
      <label className="calculator-field gg-performance-step">
        <span>表の術耐性刻み</span>
        <input type="number" aria-label="表の術耐性刻み" min={1} max={100} step={1} value={stepInput}
          onChange={event => {
            setStepInput(event.target.value)
            const value = event.target.valueAsNumber
            if (Number.isInteger(value) && value >= 1 && value <= 100) setStep(value)
          }} onBlur={() => setStepInput(String(step))}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      </label>
      <label className="calculator-field gg-performance-extra-resistance">
        <span>任意の術耐性</span>
        <input type="number" aria-label="数値表に追加する術耐性" min={0} max={100} step="any" value={extraInput}
          aria-invalid={invalidExtra} aria-describedby={invalidExtra ? 'gg-performance-extra-error' : undefined}
          onChange={event => setExtraInput(event.target.value)} />
      </label>
      <button type="button" className="button secondary gg-performance-copy-table" aria-label="数値表をコピー"
        disabled={copying || !tableText} aria-busy={copying} onClick={() => void copyTable()}>
        {copying ? 'コピー中…' : copyState === 'copied' ? 'コピー済み' : copyState === 'failed' ? 'コピー失敗' : '表をコピー'}
      </button>
    </div>
    {invalidExtra && <p id="gg-performance-extra-error" className="gg-performance-status" role="alert">術耐性は0〜100の数値で入力してください。</p>}
    <span className="visually-hidden" role="status">
      {copyState === 'copied' ? '数値表をコピーしました。' : copyState === 'failed' ? '数値表をコピーできませんでした。もう一度お試しください。' : ''}
    </span>
    {comparison.length === 0 ? <p className="gg-performance-status" role="status">{emptyMessage}</p> : <>
      <div className="gg-performance-table-wrap" tabIndex={0} role="region" aria-label={`${title}の数値表`}>
        <table className="gg-probability-table gg-performance-table" style={{ minWidth: 88 + comparison.length * 130 }}>
          <caption className="visually-hidden">{title}{condition ? `・${condition}` : ''}</caption>
          <thead><tr>
            <th scope="col">敵の術耐性</th>
            {comparison.map(({ build }) => {
              const label = labelBuild(build)
              return <th key={build.id} scope="col"><div className="gg-performance-column-label">
                <strong>{label.name}</strong><span>{label.detail}</span>
              </div></th>
            })}
          </tr></thead>
          <tbody>{resistances.map((resistance, rowIndex) => <tr key={resistance}
            className={resistance === extraResistance || resistance === chartResistance ? 'gg-performance-selected-resistance' : undefined}>
            <th scope="row">{resistance}</th>
            {comparison.map(({ build, values }) => {
              const value = values[rowIndex]?.expectedTotalDamage
              return <td key={build.id}>{value == null ? '—' : formatValue(value)}</td>
            })}
          </tr>)}</tbody>
        </table>
      </div>
      {missingBaseline ? <p className="gg-performance-status" role="status">基準列のデータがないため、比較値を計算できません。</p>
        : hasMissingValues && <p className="gg-performance-status" role="status">{metric === 'ratio' || metric === 'growth'
          ? '基準が0または未計算の術耐性や、未計算の比較値は、比率を表示できません。'
          : '計算に必要なデータがない比較値は表示できません。'}</p>}
    </>}
  </div>
}
