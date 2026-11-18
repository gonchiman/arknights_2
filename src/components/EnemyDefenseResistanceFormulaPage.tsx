import { useId, useMemo, useState } from 'react'
import { getEnemyMainStoryScope } from '../lib/enemyAggregationData'
import {
  buildEnemyDefenseResistanceCorrespondence,
  evaluateCorrespondenceErrors,
  fitCorrespondenceModel,
  type CorrespondenceData,
  type CorrespondenceMethod,
  type FormulaSegment,
} from '../lib/enemyDefenseResistanceFormula'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import type { EnemyFormulaChartImageSnapshot } from '../lib/enemyFormulaChartImage'
import { AnalysisTabs } from './AnalysisTabs'
import { EnemyAggregationScopeSelector, type EnemyAggregationScope } from './EnemyAggregationScopeSelector'
import { EnemyAggregationSelector } from './EnemyAggregationSelector'
import { EnemyDefenseResistanceFormulaChart } from './EnemyDefenseResistanceFormulaChart'
import { EnemyDefenseResistanceFormulaImageDialog } from './EnemyDefenseResistanceFormulaImageDialog'
import { EnemyDataContent } from './EnemyPageShared'
import './DamageCalculator.css'
import './EnemyAnalysis.css'
import './EnemyDefenseResistanceFormulaPage.css'

const METHODS = [
  ['exact', '累積割合'],
  ['linear', '一次式'],
  ['piecewise', '区分一次式'],
  ['polynomial', '多項式'],
  ['spline', '単調スプライン'],
] as const
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const COEFFICIENT = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 8, useGrouping: false })

export function EnemyDefenseResistanceFormulaPage() {
  const aggregation = useEnemyAggregation({ defaultToLatest: true })
  const [scope, setScope] = useState<EnemyAggregationScope>('main')
  const mainStory = useMemo(() => aggregation.data && scope === 'main'
    ? getEnemyMainStoryScope(aggregation.data) : null, [aggregation.data, scope])
  const scopedData = mainStory ?? aggregation.data
  const unavailable = mainStory?.spawnCountsAvailable === false
  const correspondence = useMemo(() => scopedData && !unavailable
    ? buildEnemyDefenseResistanceCorrespondence(scopedData.rows, scopedData.counts) : null, [scopedData, unavailable])

  return <section className="calculator-page enemy-analysis-route enemy-formula-page">
    <header className="page-intro">
      <h1>防御力・術耐性の対応式</h1>
      <div className="enemy-analysis-page-actions">
        <div className="enemy-analysis-aggregation" role="group" aria-label="集計設定">
          <EnemyAggregationSelector state={aggregation} />
          <EnemyAggregationScopeSelector scope={scope} onChange={setScope} disabled={!aggregation.data} />
        </div>
        <a className="button secondary enemy-page-link"
          href={`#/analysis/enemies/defense-resistance${aggregation.selectedId ? `?aggregationVersion=${encodeURIComponent(aggregation.selectedId)}` : ''}`}>対応表へ</a>
      </div>
    </header>
    <EnemyDataContent loading={aggregation.loading} error={aggregation.error} onRetry={aggregation.retry}>
      {unavailable && <p role="status">この集計版ではメインストーリーの出現回数を利用できません。</p>}
      {correspondence && (correspondence.points.length > 0
        ? <FormulaResults data={correspondence} versionId={aggregation.selectedId} scopeLabel={scope === 'main' ? 'メインストーリー' : '全体'} />
        : <p role="status">防御力と術耐性の両方が有効な出現データがありません。</p>)}
    </EnemyDataContent>
  </section>
}

function FormulaResults({ data, versionId, scopeLabel }: { data: CorrespondenceData; versionId: string; scopeLabel: string }) {
  const [method, setMethod] = useState<CorrespondenceMethod>('exact')
  const [degree, setDegree] = useState<2 | 3>(2)
  const [breakpointDraft, setBreakpointDraft] = useState<string | null>(null)
  const [imageSnapshot, setImageSnapshot] = useState<EnemyFormulaChartImageSnapshot | null>(null)
  const minimum = data.points[0].x
  const maximum = data.points[data.points.length - 1].x
  const defaultBreakpoints = minimum === maximum ? '' : [1 / 3, 5 / 9, 5 / 6]
    .map(fraction => Number((minimum + (maximum - minimum) * fraction).toPrecision(12))).join(',')
  const breakpointInput = breakpointDraft ?? defaultBreakpoints
  const parsedBreakpoints = useMemo(() => parseBreakpoints(breakpointInput, minimum, maximum),
    [breakpointInput, minimum, maximum])
  const [probeInput, setProbeInput] = useState(() => String(Math.min(maximum, Math.max(minimum, 50))))
  const inputId = useId()
  const tabsId = useId()
  const probe = probeInput.trim() === '' ? NaN : Number(probeInput)
  const probeValid = Number.isFinite(probe) && probe >= minimum && probe <= maximum
  const fit = useMemo(() => method === 'piecewise' && parsedBreakpoints.error
    ? { model: null, error: parsedBreakpoints.error }
    : fitCorrespondenceModel(data.points, method, { degree, breakpoints: parsedBreakpoints.values }),
  [data.points, method, degree, parsedBreakpoints])
  const reference = useMemo(() => fitCorrespondenceModel(data.points, 'exact').model, [data.points])
  const errors = useMemo(() => fit.model ? evaluateCorrespondenceErrors(data.points, fit.model) : null, [data.points, fit.model])
  const prediction = probeValid ? fit.model?.predict(probe) ?? null : null
  const referencePrediction = probeValid ? reference?.predict(probe) ?? null : null
  const selectedSegment = fit.model ? segmentAt(fit.model.segments, probeValid ? probe : minimum) : null
  const methodLabel = METHODS.find(([key]) => key === method)![1]
  const flags = [
    fit.model?.negativePrediction && '負の防御力を返す区間あり',
    fit.model?.nonMonotonic && '術耐性の増加に対して防御力が減少する区間あり',
  ].filter(Boolean).join(' · ')
  const detailedSegments = fit.model && (method === 'exact' || method === 'piecewise' || method === 'spline')
    ? fit.model.segments : []

  const result = <div className="enemy-formula-results">
    {method === 'polynomial' && <div className="enemy-formula-options">
      <label htmlFor={`${inputId}-degree`}>次数</label>
      <select id={`${inputId}-degree`} value={degree} onChange={event => setDegree(Number(event.target.value) as 2 | 3)}>
        <option value={2}>2次</option><option value={3}>3次</option>
      </select>
    </div>}
    {method === 'piecewise' && <div className="enemy-formula-options">
      <label htmlFor={`${inputId}-breakpoints`}>区切りの術耐性</label>
      <input id={`${inputId}-breakpoints`} type="text" value={breakpointInput}
        aria-invalid={!!parsedBreakpoints.error} aria-describedby={parsedBreakpoints.error ? `${inputId}-fit-error` : undefined}
        onChange={event => setBreakpointDraft(event.target.value)} />
      <span className="enemy-formula-muted">両端 {NUMBER.format(minimum)}・{NUMBER.format(maximum)}</span>
    </div>}
    {fit.error && <p id={`${inputId}-fit-error`} className="enemy-formula-error" role="alert">{fit.error}</p>}
    <div className="enemy-formula-equation" aria-live="polite">
      <div className="enemy-formula-equation-heading"><h2>対応式</h2><span>X＝術耐性　Y＝防御力</span></div>
      <div className="enemy-formula-math">
        {!selectedSegment ? '—' : method === 'exact'
          ? <>Y = Q<sub>防御力</sub>(F<sub>術耐性</sub>(X))</>
          : formatSegmentEquation(selectedSegment, method)}
      </div>
      {selectedSegment && <div className="enemy-formula-interval">
        {method === 'spline' && `u = X − (${COEFFICIENT.format(selectedSegment.origin)})　`}
        {formatSegmentRange(selectedSegment, maximum, method)}
        {method === 'exact' && `　Y = ${NUMBER.format(selectedSegment.coefficients[0])}`}
      </div>}
      {flags && <div className="enemy-formula-error" role="status">{flags}</div>}
    </div>
    {detailedSegments.length > 0 && <details className="enemy-formula-segments" key={method}>
      <summary>全区間の式（{detailedSegments.length}区間）</summary>
      <dl>{detailedSegments.map((segment, index) => <div key={index}>
        <dt>{formatSegmentRange(segment, maximum, method)}</dt>
        <dd>{method === 'spline' && `u = X − (${COEFFICIENT.format(segment.origin)})　`}
          {method === 'exact' ? `Y = ${NUMBER.format(segment.coefficients[0])}` : formatSegmentEquation(segment, method)}</dd>
      </div>)}</dl>
    </details>}
    <div className="enemy-formula-chart-toolbar">
      <div className="enemy-formula-legend">
        <span><i className="enemy-formula-reference-swatch" aria-hidden="true" />累積割合による対応</span>
        <span><i className="enemy-formula-model-swatch" aria-hidden="true" />{methodLabel}</span>
      </div>
      <button type="button" className="button secondary" disabled={!fit.model}
        aria-label="対応式のグラフをPNG画像で保存" aria-haspopup="dialog" aria-expanded={imageSnapshot !== null}
        onClick={() => {
          if (!fit.model) return
          setImageSnapshot({
            points: data.points.map(point => ({ ...point })),
            model: fit.model,
            probe: probeValid ? probe : null,
            versionId, scopeLabel, total: data.total, methodLabel,
          })
        }}>画像を保存</button>
    </div>
    <EnemyDefenseResistanceFormulaChart points={data.points} model={fit.model} probe={probeValid ? probe : null} />
    <div className="enemy-formula-probe">
      <label htmlFor={`${inputId}-probe`}>術耐性 X
        <input id={`${inputId}-probe`} type="number" min={minimum} max={maximum} step="any" value={probeInput}
          aria-invalid={!probeValid} aria-describedby={!probeValid ? `${inputId}-probe-error` : undefined}
          onChange={event => setProbeInput(event.target.value)} />
      </label>
      <dl aria-live="polite">
        <div><dt>対応する防御力 Y</dt><dd>{formatPrediction(prediction)}</dd></div>
        <div><dt>累積割合の値</dt><dd>{formatPrediction(referencePrediction)}</dd></div>
      </dl>
    </div>
    {!probeValid && <p id={`${inputId}-probe-error`} className="enemy-formula-error" role="alert">
      術耐性は{NUMBER.format(minimum)}〜{NUMBER.format(maximum)}で指定してください。</p>}
    <div className="enemy-formula-errors" aria-live="polite">
      <span>防御力の誤差</span>
      <span>平均絶対誤差 <strong>{formatPrediction(errors?.meanAbsoluteError ?? null)}</strong></span>
      <span>最大絶対誤差 <strong>{formatPrediction(errors?.maximumAbsoluteError ?? null)}</strong></span>
      {errors && <span className="enemy-formula-muted">X＝{NUMBER.format(minimum)}〜{NUMBER.format(maximum)}
        ・{errors.sampleCount === 1 ? '1点' : `${COEFFICIENT.format(errors.step)}刻み`}</span>}
    </div>
  </div>

  return <>
    <div className="enemy-formula-source" role="status">
      <span>出現回数 · 全敵</span><span>有効 {NUMBER.format(data.total)}体</span><span>値なし {NUMBER.format(data.missingCount)}体</span>
      <span>対応点 {data.points.length}点</span><span>同値は累積割合の上端</span>
    </div>
    <AnalysisTabs tabs={METHODS} activeTab={method} onChange={setMethod} idPrefix={tabsId} label="式を作る方法" />
    {METHODS.map(([key]) => <section key={key} id={`${tabsId}-panel-${key}`} role="tabpanel"
      aria-labelledby={`${tabsId}-tab-${key}`} hidden={method !== key}>{method === key && result}</section>)}
    {imageSnapshot && <EnemyDefenseResistanceFormulaImageDialog snapshot={imageSnapshot} onClose={() => setImageSnapshot(null)} />}
  </>
}

function parseBreakpoints(input: string, minimum: number, maximum: number): { values: number[]; error: string | null } {
  if (input.trim() === '') return { values: [], error: null }
  const parts = input.split(/[,、，]/).map(part => part.trim())
  const values = parts.map(Number)
  const invalid = parts.some(part => part === '') || values.length > 7
    || values.some((value, index) => !Number.isFinite(value) || value <= minimum || value >= maximum
      || (index > 0 && value <= values[index - 1]))
  return { values, error: invalid ? `${NUMBER.format(minimum)}より大きく${NUMBER.format(maximum)}未満の区切りを、7個以内で小さい順にカンマで指定してください。` : null }
}

function segmentAt(segments: readonly FormulaSegment[], x: number) {
  return segments.find(segment => x >= segment.from && x < segment.to) ?? segments[segments.length - 1] ?? null
}

function formatSegmentRange(segment: FormulaSegment, maximum: number, method: CorrespondenceMethod): string {
  if (segment.from === segment.to) return `X = ${COEFFICIENT.format(segment.from)}`
  return `${COEFFICIENT.format(segment.from)} ≤ X ${method !== 'exact' && segment.to === maximum ? '≤' : '<'} ${COEFFICIENT.format(segment.to)}`
}

function formatSegmentEquation(segment: FormulaSegment, method: CorrespondenceMethod): string {
  let coefficients = segment.coefficients
  const variable = method === 'spline' ? 'u' : 'X'
  if (method !== 'spline' && segment.origin !== 0) {
    const [a = 0, b = 0, c = 0, d = 0] = coefficients
    const o = segment.origin
    coefficients = [a - b * o + c * o * o - d * o * o * o, b - 2 * c * o + 3 * d * o * o, c - 3 * d * o, d]
  }
  const terms: string[] = []
  for (let power = coefficients.length - 1; power >= 0; power--) {
    const value = coefficients[power]
    if (Math.abs(value) < 1e-12) continue
    const sign = value < 0 ? '−' : terms.length ? '＋' : ''
    const suffix = power === 0 ? '' : power === 1 ? variable : `${variable}${power === 2 ? '²' : '³'}`
    terms.push(`${sign}${COEFFICIENT.format(Math.abs(value))}${suffix}`)
  }
  return `Y ≈ ${terms.join(' ') || '0'}`
}

function formatPrediction(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : NUMBER.format(value)
}
