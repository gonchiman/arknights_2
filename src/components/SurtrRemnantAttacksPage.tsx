import { useMemo, useRef, useState, type MouseEvent } from 'react'
import type { SkillRecord } from '../types/skill'
import { SURTR_OPERATOR_ID, type SurtrDpsSettings } from '../lib/surtrDps'
import {
  deriveSurtrRemnantAttackModel, calculateSurtrRemnantAttacks,
  getSurtrRemnantCtLimit, getSurtrRemnantWindupLimit, buildSurtrRemnantCtSamples,
  type SurtrRemnantAttackModel, type SurtrRemnantAttackAssumptions,
  type SurtrRemnantAttackResult, type SurtrRemnantCtStep,
} from '../lib/surtrRemnantAttacks'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules } from '../lib/operatorModules'
import { getModuleComparisonColors } from '../lib/moduleColors'
import type { SurtrRemnantChartKind, SurtrRemnantChartSeries } from '../lib/surtrRemnantChart'
import { getSurtrRemnantAttackImageFilename } from '../lib/surtrRemnantAttackImageFilename'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { SURTR_HOME_LINK } from '../lib/navigation'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { HelpPopover } from './HelpPopover'
import { SurtrRemnantAttackChart } from './SurtrRemnantAttackChart'
import { SurtrRemnantAttackChartImage, SurtrRemnantAttackChartImagePreview, type SurtrRemnantAttackChartImageProps } from './SurtrRemnantAttackChartImage'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './DamageCalculator.css'
import './SurtrS3Page.css'
import './SurtrRemnantAttacksPage.css'

const PAGE_SIZE = 13
const seconds = (value: number | null) => value === null ? '—' : `${value.toFixed(3)} s`
const chartLabels: Record<SurtrRemnantChartKind, string> = { 'grouped-bar': '集合棒グラフ', step: '階段グラフ', bands: '回数の区間帯' }
interface ImageSnapshot extends SurtrRemnantAttackChartImageProps { filename: string }
interface Comparison {
  id: string
  label: string
  color: string
  model: SurtrRemnantAttackModel | null
}
interface DetailSelection {
  ct: number
  potential: number
  blocking: boolean
  assumptions: SurtrRemnantAttackAssumptions
  columns: (Comparison & { model: SurtrRemnantAttackModel; result: SurtrRemnantAttackResult | null })[]
}

function ColumnHeaders({ comparison }: { comparison: readonly Comparison[] }) {
  return <>{comparison.map(item => <th key={item.id} scope="col">
    <span className="surtr-s3-column-label"><i aria-hidden="true" style={{ backgroundColor: item.color }} />{item.label}</span>
  </th>)}</>
}

function RemnantAttackDetail({ selection, onClose }: { selection: DetailSelection; onClose: () => void }) {
  const { columns, assumptions } = selection
  const hitRows = Math.max(...columns.map(item => item.result?.hitCount ?? 0))
  const details: { label: string; value: (item: DetailSelection['columns'][number]) => string }[] = [
    { label: '命中回数', value: item => item.result ? `${item.result.hitCount} 回` : '—' },
    { label: '最初の命中', value: item => seconds(item.result?.firstHitTime ?? null) },
    { label: '最後の命中', value: item => seconds(item.result?.lastHitTime ?? null) },
    { label: '退場', value: item => seconds(item.model.remnantDuration) },
    { label: '発動前の攻撃間隔', value: item => seconds(item.model.attackIntervalBefore) },
    { label: '発動後の攻撃間隔', value: item => seconds(item.model.attackIntervalAfter) },
    { label: '発動後の残りCT', value: item => seconds(item.result?.remainingCtAfter ?? null) },
  ]
  return <GoldenglowDetailModal title={`残りCT ${selection.ct.toFixed(2)} s の命中詳細`} closeLabel="命中詳細を閉じる"
    className="surtr-remnant-detail" closeOnContextMenu onClose={onClose}>
    <p className="surtr-remnant-detail-conditions">潜在{selection.potential}・{selection.blocking ? 'ブロック中' : '非ブロック'}・余燼発動を0秒とする</p>
    <div className="surtr-s3-table-wrap"><table className="surtr-s3-table surtr-remnant-table" aria-label="余燼中の命中詳細">
      <thead><tr><th scope="col">項目</th><ColumnHeaders comparison={columns} /></tr></thead>
      <tbody>{details.map(row => <tr key={row.label}><th scope="row">{row.label}</th>
        {columns.map(item => <td key={item.id}>{row.value(item)}</td>)}
      </tr>)}</tbody>
    </table></div>
    <details className="surtr-s3-assumptions surtr-remnant-hit-details"><summary>すべての命中時刻</summary>
      <div className="surtr-s3-table-wrap"><table className="surtr-s3-table surtr-remnant-table" aria-label="余燼発動からの命中時刻">
        <thead><tr><th scope="col">攻撃</th><ColumnHeaders comparison={columns} /></tr></thead>
        <tbody>{Array.from({ length: hitRows }, (_, index) => <tr key={index}><th scope="row">{index + 1}回目</th>
          {columns.map(item => <td key={item.id}>{seconds(item.result?.hitTimes[index] ?? null)}</td>)}
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">退場</th>{columns.map(item => <td key={item.id}>{seconds(item.model.remnantDuration)}</td>)}</tr></tfoot>
      </table></div>
    </details>
    <details className="surtr-s3-assumptions"><summary>この試算の条件</summary>
      <p>攻撃開始から命中まで {seconds(assumptions.windup)}。残りCTは{assumptions.ctCarry === 'time' ? '時間を維持' : '攻撃間隔に対する割合を維持'}。退場と同時の命中は{assumptions.includeRetreatHit ? '含む' : '含まない'}。</p>
      <p>内部計算は丸めず、表示のみ小数第3位に丸めています。</p>
      {columns.some(item => !item.result) && <p>発動前の攻撃間隔を超える残りCTの計算結果は「—」で表示しています。</p>}
    </details>
  </GoldenglowDetailModal>
}

export function SurtrRemnantAttacksPage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]; loading: boolean; error: string | null; onRetry: () => void
}) {
  const record = rows.find(row => row.operatorId === SURTR_OPERATOR_ID && row.skillIndex === 3)
  const [potential, setPotential] = useState(1)
  const [blocking, setBlocking] = useState(false)
  const [step, setStep] = useState<SurtrRemnantCtStep>(0.1)
  const [windupInput, setWindupInput] = useState('0.20')
  const [ctCarry, setCtCarry] = useState<SurtrRemnantAttackAssumptions['ctCarry']>('time')
  const [includeRetreatHit, setIncludeRetreatHit] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [selection, setSelection] = useState<DetailSelection | null>(null)
  const [chartKind, setChartKind] = useState<SurtrRemnantChartKind>('grouped-bar')
  const [showValues, setShowValues] = useState(true)
  const [showBoundaries, setShowBoundaries] = useState(false)
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([])
  const [selectedCtInput, setSelectedCtInput] = useState('0.50')
  const [image, setImage] = useState<ImageSnapshot | null>(null)
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const saveInProgress = useRef(false)
  const nextSnapshot = useRef(0)
  const picker = getChartImageSavePicker()
  const settings = useMemo<SurtrDpsSettings>(() => ({
    level: record?.operatorProfile.phases[2]?.maxLevel ?? 90, trust: 100, potential, blocking,
    skillLevelIndex: Math.max(0, (record?.skillLevels.length ?? 10) - 1),
  }), [record, potential, blocking])
  const comparison = useMemo<Comparison[]>(() => {
    const modules = getOperatorModules(record?.operatorProfile ?? {})
    const types = [null, 'X', 'Y'] as const
    const colors = getModuleComparisonColors(types.map(moduleType => ({ moduleType, potential })))
    return types.map((type, index) => {
      const moduleIndex = modules.findIndex(module => module.typeName2?.trim().toUpperCase() === type)
      const module = modules[moduleIndex]
      const id = type === null ? '' : module ? getOperatorModuleId(module, moduleIndex) : null
      const valid = type === null || (module && getOperatorModuleLevels(module).includes(3))
      return { id: type ?? 'none', label: type ? `MOD ${type} Lv.3` : '未装備', color: colors[index],
        model: record && id !== null && valid ? deriveSurtrRemnantAttackModel(record, settings, id, 3) : null }
    })
  }, [record, settings, potential])
  const models = useMemo(() => comparison.flatMap(item => item.model ? [item.model] : []), [comparison])
  const ctLimit = getSurtrRemnantCtLimit(models)
  const windupLimit = getSurtrRemnantWindupLimit(models)
  const missingModel = comparison.some(item => !item.model) || ctLimit === null || windupLimit === null
  const windup = Number(windupInput)
  const invalidWindup = windupInput.trim() === '' || !Number.isFinite(windup) || windup < 0 || (windupLimit !== null && windup > windupLimit)
  const assumptions = useMemo<SurtrRemnantAttackAssumptions>(() => ({ windup, ctCarry, includeRetreatHit }), [windup, ctCarry, includeRetreatHit])
  const samples = useMemo(() => ctLimit === null ? [] : buildSurtrRemnantCtSamples(ctLimit, step), [ctLimit, step])
  const calculations = useMemo(() => missingModel || invalidWindup ? [] : samples.map(ct => ({
    ct, results: comparison.map(item => item.model ? calculateSurtrRemnantAttacks(item.model, ct, assumptions) : null),
  })), [missingModel, invalidWindup, samples, comparison, assumptions])
  const series = useMemo<SurtrRemnantChartSeries[]>(() => comparison.flatMap(item => item.model && !hiddenSeries.includes(item.id)
    ? [{ ...item, model: item.model }] : []), [comparison, hiddenSeries])
  const invalidCalculation = calculations.some(row => row.results.some((result, index) =>
    !result && row.ct <= (comparison[index].model?.attackIntervalBefore ?? Infinity)))
  const pageCount = Math.max(1, Math.ceil(calculations.length / PAGE_SIZE))
  const page = Math.min(pageIndex, pageCount - 1)
  const visibleRows = calculations.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const selectDetail = (ct: number) => {
    const columns = comparison.flatMap(item => {
      const result = item.model ? calculateSurtrRemnantAttacks(item.model, ct, assumptions) : null
      return item.model ? [{ ...item, model: item.model, result }] : []
    })
    if (columns.length !== comparison.length) return
    setSelection({ ct, potential, blocking, assumptions: { ...assumptions }, columns })
  }
  const openDetail = (event: MouseEvent<HTMLTableRowElement>, row: typeof calculations[number]) => {
    event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
    selectDetail(row.ct)
  }
  const ctCandidate = Number(selectedCtInput)
  const validSelectedCt = selectedCtInput.trim() !== '' && Number.isFinite(ctCandidate) && ctCandidate >= 0 && ctLimit !== null && ctCandidate <= ctLimit
  const selectedCt = validSelectedCt ? ctCandidate : undefined
  const selectedResults = series.map(item => selectedCt === undefined ? null : calculateSurtrRemnantAttacks(item.model, selectedCt, assumptions))
  const selectCt = (ct: number) => setSelectedCtInput(String(ct))
  const commitCtInput = () => {
    if (selectedCt === undefined) return
    const ct = chartKind === 'grouped-bar' && samples.length
      ? samples.reduce((nearest, value) => Math.abs(value - selectedCt) < Math.abs(nearest - selectedCt) ? value : nearest)
      : selectedCt
    setSelectedCtInput(Number.isInteger(ct * 100) ? ct.toFixed(2) : String(ct))
  }
  const canOutput = !!record && !missingModel && !invalidCalculation && !invalidWindup && !!series.length
  const aspectRatio = aspect.preset !== 'auto' && [aspect.width, aspect.height].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(aspect.width) / Number(aspect.height) : undefined
  const openImage = () => {
    if (!canOutput) return
    setFeedback(null)
    setImage({ id: String(++nextSnapshot.current), series, assumptions: { ...assumptions }, samples: [...samples], ctLimit: ctLimit!, kind: chartKind,
      showValues, showBoundaries, potential, blocking, step,
      filename: getSurtrRemnantAttackImageFilename({ potential, blocking, ...assumptions, kind: chartKind, step,
        modules: series.map(item => item.label), showValues, showBoundaries }),
    })
  }
  const saveImage = async (filename: string, ratio?: number) => {
    if (!image || saveInProgress.current) return
    saveInProgress.current = true; setSaving(true); setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({ filename,
        width: getChartImageLayout({ naturalChartHeight: 334, aspectRatio: ratio }).width,
        chart: <SurtrRemnantAttackChartImage {...image} aspectRatio={ratio} />,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded'); setImage(null)
    } catch { setFeedback('failed') }
    finally { saveInProgress.current = false; setSaving(false) }
  }
  const status = error ? <div className="error-box" role="alert">{error}<button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></div>
    : <p className="surtr-s3-status" role="status">{loading ? 'スルトのデータを読み込み中…' : 'スルトS3のデータを取得できませんでした。'}</p>

  return <section className="calculator-page surtr-s3-page surtr-remnant-page" aria-labelledby="surtr-remnant-title">
    <div className="page-heading-with-breadcrumbs">
      <PageBreadcrumbs parents={[SURTR_HOME_LINK]} current="余燼中の攻撃回数" />
      <header className="page-intro"><h1 id="surtr-remnant-title">余燼中の攻撃回数</h1></header>
    </div>
    <CollapsibleCalculatorPanel id="surtr-remnant-settings" number="01" title="比較条件" summary={`潜在${potential}・${blocking ? 'ブロック中' : '非ブロック'}`} collapsedLabel="設定を表示">
      {!record ? status : <>
        <div className="surtr-remnant-fields">
          <label className="calculator-field"><span>潜在</span><select aria-label="潜在" value={potential} onChange={event => { setPotential(Number(event.target.value)); setPageIndex(0) }}>
            {[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>潜在{value}</option>)}
          </select></label>
          <div className="surtr-s3-block-setting"><span id="surtr-remnant-block-label">ブロック状態</span>
            <div className="surtr-s3-segments" role="group" aria-labelledby="surtr-remnant-block-label">
              <button type="button" aria-pressed={!blocking} onClick={() => { setBlocking(false); setPageIndex(0) }}>非ブロック</button>
              <button type="button" aria-pressed={blocking} onClick={() => { setBlocking(true); setPageIndex(0) }}>ブロック中</button>
            </div>
          </div>
        </div>
        <details className="surtr-s3-assumptions"><summary>計算の前提・仮定</summary>
          <div className="surtr-remnant-assumption-fields">
            <label className="calculator-field"><span>攻撃開始から命中まで（s・仮定）</span><input aria-label="攻撃開始から命中まで（s・仮定）" type="number" min="0" max={windupLimit ?? undefined} step="0.01" value={windupInput}
              aria-invalid={invalidWindup} aria-describedby={invalidWindup ? 'surtr-remnant-windup-error' : undefined}
              onChange={event => setWindupInput(event.target.value)} /></label>
            <label className="calculator-field"><span>発動時の残りCT</span><select aria-label="発動時の残りCT" value={ctCarry} onChange={event => setCtCarry(event.target.value as typeof ctCarry)}>
              <option value="time">時間を維持</option><option value="ratio">残りの割合を維持</option>
            </select></label>
            <label className="calculator-field"><span>退場と同時の命中</span><select aria-label="退場と同時の命中" value={includeRetreatHit ? 'include' : 'exclude'} onChange={event => setIncludeRetreatHit(event.target.value === 'include')}>
              <option value="exclude">含まない</option><option value="include">含む</option>
            </select></label>
          </div>
          <p>発動直前の残りCTは、次の攻撃を開始するまでの時間です。各MODを同じ秒数で比較します。表は最も長い攻撃間隔以内を、選択した刻みで表示します。各MODの攻撃間隔を超える残りCTは「—」で表示します。</p>
          <p>次の攻撃を待っている間に余燼が発動し、対象を攻撃し続けられる状況を試算します。最初の命中は「発動後の残りCT＋攻撃開始から命中まで」、以降は発動後の攻撃間隔ごとに数えます。</p>
          <p>余燼中の攻撃速度と持続時間はゲームデータから取得します。命中までの初期値0.20秒は仮定です。残りCTの引継ぎ、進行中の攻撃動作、フレーム単位の丸めは実機未検証です。</p>
          <p>余燼の発動を0秒とし、S3の準備時間0.6秒は加算しません。外部の攻撃速度補正は含めません。</p>
        </details>
        {invalidWindup && <p className="surtr-remnant-error" id="surtr-remnant-windup-error" role="alert">命中までの時間は0{windupLimit === null ? '' : `〜${windupLimit.toFixed(2)}`}秒で入力してください。</p>}
      </>}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-remnant-output" number="02" title="攻撃回数" summary="残りCT別の命中回数" collapsedLabel="結果を表示"
      className="surtr-s3-output-panel" headerActions={<>
        <span className="surtr-remnant-estimate-help"><HelpPopover label="仮定の試算について" title="仮定の試算とは" triggerText="仮定の試算" mode="dialog">
          <div className="surtr-remnant-estimate-help-content">
            <p><strong>未確認の挙動を仮に決めて計算している</strong>、という意味です。</p>
            <h4>ゲームデータを使っている部分</h4>
            <p>余燼の持続時間と、MODによる攻撃速度補正です。</p>
            <h4>現在の仮定</h4>
            <ul>
              <li>余燼発動時の残りCTは、{ctCarry === 'time' ? '秒数をそのまま引き継ぎます' : '攻撃間隔に対する残りの割合を引き継ぎます'}。</li>
              <li>攻撃開始から命中までは{invalidWindup ? '入力の確認が必要です' : `${windup.toFixed(2)}秒とします`}。この時間は実測値ではありません。</li>
              <li>退場と同時の命中は{includeRetreatHit ? '数えます' : '数えません'}。</li>
            </ul>
            <p>表示される回数は、<strong>「この前提なら何回命中するか」</strong>を示します。実際のゲームで必ずこの回数になると確定した結果ではありません。</p>
            <p>特に、残りCTの引継ぎ方はまだ未確認です。仮定は「比較条件」の「計算の前提・仮定」で変更できます。</p>
          </div>
        </HelpPopover></span>
        <label className="surtr-s3-output-control"><span>表示するグラフ</span><select aria-label="表示するグラフ" value={chartKind} onChange={event => setChartKind(event.target.value as SurtrRemnantChartKind)}>
          {Object.entries(chartLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="surtr-s3-output-control"><span>CTの刻み</span><select aria-label="CTの刻み" value={step} onChange={event => { setStep(Number(event.target.value) as SurtrRemnantCtStep); setPageIndex(0) }}>
        {[0.1, 0.05, 0.01].map(value => <option key={value} value={value}>{value.toFixed(2)} s</option>)}
      </select></label></>}>
      {!record ? status : missingModel || invalidCalculation ? <p role="alert">計算に必要なMOD・攻撃速度・余燼のデータを取得できませんでした。</p>
        : invalidWindup ? <p className="surtr-s3-status" role="status">計算条件の入力を確認してください。</p>
          : <>
            <section className="surtr-remnant-chart-section" aria-label={chartLabels[chartKind]}>
              <div className="surtr-remnant-chart-toolbar">
                <div className="surtr-remnant-chart-legend" role="group" aria-label="表示する装備">
                  {comparison.map(item => <button type="button" key={item.id} aria-pressed={!hiddenSeries.includes(item.id)}
                    onClick={() => setHiddenSeries(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id)
                      : previous.length < comparison.length - 1 ? [...previous, item.id] : previous)}>
                    {chartKind === 'step' ? <svg className="surtr-remnant-line-swatch" width="18" height="12" aria-hidden="true"><line x1="0" x2="18" y1="6" y2="6" stroke={item.color}
                      strokeWidth={item.model?.moduleType === null ? 4 : 2.5} strokeDasharray={item.model?.moduleType === null ? '2 4' : item.model?.moduleType === 'X' ? '8 5' : undefined} /></svg>
                      : <i aria-hidden="true" style={{ backgroundColor: item.color }} />}{item.label}
                  </button>)}
                </div>
                <div className="surtr-remnant-chart-actions">
                  {chartKind !== 'step' && <label className="surtr-s3-values-toggle"><input type="checkbox" checked={showValues} onChange={event => setShowValues(event.target.checked)} /><span>{chartKind === 'bands' ? '帯の数値' : '棒の数値'}</span></label>}
                  {chartKind !== 'grouped-bar' && <label className="surtr-s3-values-toggle"><input type="checkbox" checked={showBoundaries} onChange={event => setShowBoundaries(event.target.checked)} /><span>境界CTの数値</span></label>}
                  <button type="button" className="button secondary" onClick={openImage} aria-haspopup="dialog">画像を保存</button>
                </div>
              </div>
              <SurtrRemnantAttackChart series={series} samples={samples} ctLimit={ctLimit ?? undefined} assumptions={assumptions} kind={chartKind}
                selectedCt={selectedCt} onSelectCt={selectCt} showValues={showValues} showBoundaries={showBoundaries} />
              <div className="surtr-remnant-chart-selection">
                <label className="calculator-field"><span>残りCT（s）</span><input aria-label="残りCT（s）" type="number" min="0" max={ctLimit ?? undefined} step={chartKind === 'grouped-bar' ? step : 0.01}
                  value={selectedCtInput} aria-invalid={!validSelectedCt}
                  onChange={event => setSelectedCtInput(event.target.value)} onBlur={commitCtInput} /></label>
                <input type="range" aria-label="残りCTを選択" min="0" max={chartKind === 'grouped-bar' ? samples.at(-1) ?? 0 : ctLimit ?? 0}
                  step={chartKind === 'grouped-bar' ? step : 0.01} value={selectedCt ?? 0} onChange={event => selectCt(Number(event.target.value))} />
                <button type="button" className="button secondary" disabled={selectedCt === undefined} onClick={() => { if (selectedCt !== undefined) selectDetail(selectedCt) }} aria-haspopup="dialog">命中詳細</button>
              </div>
              {!validSelectedCt ? <p className="surtr-remnant-error" role="alert">残りCTは0〜{ctLimit?.toFixed(2)}秒で入力してください。</p>
                : <div className="surtr-remnant-chart-counts" aria-live="polite">{series.map((item, index) => <span key={item.id}>
                    <i aria-hidden="true" style={{ backgroundColor: item.color }} />{item.label} <strong>{selectedResults[index] ? `${selectedResults[index]!.hitCount} 回` : '—'}</strong>
                  </span>)}</div>}
            </section>
            <div className="surtr-s3-table-wrap"><table className="surtr-s3-table surtr-s3-result-table surtr-remnant-table" aria-label="発動直前の残りCTごとの命中回数">
              <thead><tr><th scope="col">発動直前の残りCT（s）</th><ColumnHeaders comparison={comparison} /></tr></thead>
              <tbody>{visibleRows.map(row => <tr key={row.ct} onClick={event => openDetail(event, row)}>
                <th scope="row"><button type="button" className="surtr-s3-table-resistance" aria-haspopup="dialog" aria-label={`残りCT ${row.ct.toFixed(2)}秒の命中詳細`}>
                  {row.ct.toFixed(2)}<span aria-hidden="true">›</span>
                </button></th>
                {row.results.map((result, index) => <td key={comparison[index].id}>{result
                  ? <><strong>{result.hitCount}</strong> 回</>
                  : <span aria-label="残りCTが攻撃間隔の範囲外">—</span>}</td>)}
              </tr>)}</tbody>
            </table></div>
            <nav className="surtr-remnant-pagination" aria-label="攻撃回数表のページ">
              <span aria-live="polite">{page + 1} / {pageCount}</span>
              <button type="button" className="button secondary" disabled={page === 0} onClick={() => setPageIndex(page - 1)}>前へ</button>
              <button type="button" className="button secondary" disabled={page + 1 >= pageCount} onClick={() => setPageIndex(page + 1)}>次へ</button>
            </nav>
          </>}
      {feedback && feedback !== 'failed' && <p className="surtr-s3-status" role="status">{feedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    </CollapsibleCalculatorPanel>
    {image && <ChartImageSaveDialog initialFilename={image.filename} getDefaultFilename={ratio => withChartImageAspect(image.filename, ratio)} aspect={aspect} onAspectChange={setAspect}
      canChooseLocation={!!picker} saving={saving} error={feedback === 'failed'} helpMode="popover"
      onClose={() => { if (!saveInProgress.current) { setImage(null); setFeedback(null) } }} onSave={(filename, ratio) => void saveImage(filename, ratio)}
      preview={<SurtrRemnantAttackChartImagePreview key={`${image.id}:${aspectRatio ?? 'auto'}`} {...image} aspectRatio={aspectRatio} />} />}
    {selection && <RemnantAttackDetail selection={selection} onClose={() => setSelection(null)} />}
  </section>
}
