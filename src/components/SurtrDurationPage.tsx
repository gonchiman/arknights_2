import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EnemyRecord } from '../types/enemy'
import type { SkillRecord } from '../types/skill'
import { SURTR_OPERATOR_ID } from '../lib/surtrDps'
import { deriveSurtrDurationModel } from '../lib/surtrDuration'
import { calculateSurtrDurationCombat } from '../lib/surtrDurationCombat'
import { createSurtrDurationCondition, deriveSurtrDurationParticipants, type SurtrDurationCondition } from '../lib/surtrDurationParticipants'
import { describeSurtrDurationCondition, getSurtrDurationConditionName, getSurtrDurationFilenameParts, type SurtrDurationComparisonLine } from '../lib/surtrDurationComparison'
import { loadEnemyRecords } from '../lib/enemyData'
import { buildSurtrDurationTimeline, type SurtrDurationTableLayout } from '../lib/surtrDurationTimeline'
import { getModuleComparisonColors } from '../lib/moduleColors'
import { getSurtrDurationImageFilename } from '../lib/surtrDurationImageFilename'
import type { SurtrDurationChartRange } from '../lib/surtrDurationChartView'
import { getSurtrDurationTableImageFilename, type SurtrDurationTableImageConditions } from '../lib/surtrDurationTableImageFilename'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { withChartImageLabelFilename, type ChartImageLabelOverrides } from '../lib/chartImageLabels'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { SURTR_HOME_LINK } from '../lib/navigation'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartImageLabelEditor } from './ChartImageLabelEditor'
import { SurtrDurationChart, SurtrDurationChartImage, SurtrDurationChartImagePreview,
  getSurtrDurationImageLabelDefaults, type SurtrDurationSeries } from './SurtrDurationChart'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import { SurtrDurationConditionEditor } from './SurtrDurationConditionEditor'
import { SurtrDurationTimelineTable } from './SurtrDurationTimelineTable'
import { SurtrDurationTableImagePreview, saveSurtrDurationTableImage, type SurtrDurationTableImageSnapshot } from './SurtrDurationTableImage'
import './DamageCalculator.css'
import './SurtrS3Page.css'
import './SurtrDurationPage.css'

const skillLabel = (index: number) => index < 7 ? `ランク${index + 1}` : `特化${index - 6}`
const seconds = (value: number | null) => value === null ? '—' : `${value.toFixed(1)} 秒`
const MAX_LINES = 8
const formatHp = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(value)
interface ImageSnapshot {
  id: number
  series: SurtrDurationSeries[]
  range: SurtrDurationChartRange
  title: string
  conditions: string
  filename: string
  labels?: ChartImageLabelOverrides
}
interface TableImageSnapshot extends SurtrDurationTableImageSnapshot {
  id: number
  filenameOptions: SurtrDurationTableImageConditions
}

export function SurtrDurationPage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]; loading: boolean; error: string | null; onRetry: () => void
}) {
  const record = rows.find(row => row.operatorId === SURTR_OPERATOR_ID && row.skillIndex === 3)
  const [draft, setDraft] = useState<SurtrDurationCondition | null>(null)
  const [draftLimit, setDraftLimit] = useState(120)
  const [savedLines, setSavedLines] = useState<SurtrDurationComparisonLine[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tableLineId, setTableLineId] = useState('baseline')
  const [enemyRows, setEnemyRows] = useState<EnemyRecord[]>([])
  const [enemyLoading, setEnemyLoading] = useState(true)
  const [enemyError, setEnemyError] = useState<string | null>(null)
  const [enemyAttempt, setEnemyAttempt] = useState(0)
  const [lineFeedback, setLineFeedback] = useState('')
  const nextLine = useRef(0)
  const [timelineStep, setTimelineStep] = useState<1 | 5>(1)
  const [chartRange, setChartRange] = useState<SurtrDurationChartRange>('remnant')
  const [tablePrecision, setTablePrecision] = useState(2)
  const [tableLayout, setTableLayout] = useState<SurtrDurationTableLayout>('vertical')
  const [timelineSelection, setTimelineSelection] = useState<{ lineId: string; condition: SurtrDurationCondition; timeLimit: number; time: number } | null>(null)
  const [image, setImage] = useState<ImageSnapshot | null>(null)
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const [tableImage, setTableImage] = useState<TableImageSnapshot | null>(null)
  const [tableAspect, setTableAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [tableSaving, setTableSaving] = useState(false)
  const [tableFeedback, setTableFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const [tablePreviewReady, setTablePreviewReady] = useState(false)
  const [tablePreviewError, setTablePreviewError] = useState<string | null>(null)
  const tableSaveInProgress = useRef(false)
  const saveInProgress = useRef(false)
  const nextSnapshot = useRef(0)
  const picker = getChartImageSavePicker()
  useEffect(() => {
    let active = true
    setEnemyLoading(true); setEnemyError(null)
    void loadEnemyRecords().then(value => { if (active) setEnemyRows(value) })
      .catch(cause => { if (active) setEnemyError(cause instanceof Error ? cause.message : '敵データを取得できませんでした。') })
      .finally(() => { if (active) setEnemyLoading(false) })
    return () => { active = false }
  }, [enemyAttempt])
  const initialCondition = useMemo(() => record ? createSurtrDurationCondition(record) : null, [record])
  const currentDraft = draft ?? initialCondition
  const lines = useMemo<SurtrDurationComparisonLine[]>(() => savedLines ?? (initialCondition
    ? [{ id: 'baseline', condition: initialCondition, timeLimit: 120, visible: true }] : []), [savedLines, initialCondition])
  const comparison = useMemo(() => {
    if (!record) return []
    const calculations = lines.map(line => {
      const model = deriveSurtrDurationModel(record, line.condition.settings, line.condition.moduleId, line.condition.moduleLevel)
      const participants = deriveSurtrDurationParticipants(record, line.condition, enemyRows, rows)
      const result = model && !participants.unsupportedReasons.length
        ? calculateSurtrDurationCombat(model, participants.actions, line.timeLimit) : null
      return { ...line, model, participants, result,
        label: getSurtrDurationConditionName(record, line.condition, enemyRows, rows),
        details: describeSurtrDurationCondition(record, line.condition, line.timeLimit, enemyRows, rows) }
    })
    const colors = getModuleComparisonColors(calculations.map(line => ({
      moduleType: line.model?.moduleType, moduleLevel: line.model?.moduleLevel,
      potential: line.condition.settings.potential,
    })), { shadeBy: 'moduleLevel' })
    return calculations.map((line, index) => ({ ...line, color: colors[index], styleIndex: index }))
  }, [record, lines, enemyRows, rows])
  const series = useMemo<SurtrDurationSeries[]>(() => comparison.flatMap(item => item.result && item.visible
    ? [{ id: item.id, label: item.label, color: item.color, styleIndex: item.styleIndex, ...item.result }] : []), [comparison])
  const calculation = comparison.find(item => item.id === tableLineId) ?? comparison[0]
  const settings = calculation?.condition.settings ?? initialCondition?.settings
    ?? { level: 90, trust: 100, potential: 1, skillLevelIndex: 9 }
  const potential = settings.potential
  const label = skillLabel(settings.skillLevelIndex)
  const timelineRows = useMemo(() => calculation?.model && calculation.result
    ? buildSurtrDurationTimeline(calculation.model, calculation.result, timelineStep) : [], [calculation, timelineStep])
  const selectedTimelineRow = timelineSelection?.lineId === calculation?.id
    && timelineSelection?.condition === calculation?.condition && timelineSelection?.timeLimit === calculation?.timeLimit
    ? timelineRows.find(row => row.time === timelineSelection?.time) : undefined
  const invalid = !!calculation && !calculation.result
  const validLimit = Number.isInteger(draftLimit) && draftLimit >= 1 && draftLimit <= 600
  const resetDraft = () => { setDraft(initialCondition ? structuredClone(initialCondition) : null); setDraftLimit(120); setEditingId(null) }
  const saveLine = () => {
    if (!record || !currentDraft || !validLimit || (!editingId && lines.length >= MAX_LINES)) return
    const condition = structuredClone(currentDraft)
    const participants = deriveSurtrDurationParticipants(record, condition, enemyRows, rows)
    const model = deriveSurtrDurationModel(record, condition.settings, condition.moduleId, condition.moduleLevel)
    if (!model || participants.unsupportedReasons.length || !calculateSurtrDurationCombat(model, participants.actions, draftLimit)) return
    const id = editingId ?? `line-${++nextLine.current}`
    setSavedLines(editingId ? lines.map(line => line.id === id ? { ...line, condition, timeLimit: draftLimit } : line)
      : [...lines, { id, condition, timeLimit: draftLimit, visible: true }])
    setTableLineId(id)
    setTimelineSelection(null)
    setLineFeedback(`${getSurtrDurationConditionName(record, condition, enemyRows, rows)}を${editingId ? '更新' : '追加'}しました。`)
    setEditingId(null)
  }
  const editLine = (line: SurtrDurationComparisonLine) => {
    setDraft(structuredClone(line.condition)); setDraftLimit(line.timeLimit); setEditingId(line.id); setLineFeedback('')
    document.getElementById('surtr-duration-settings')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const removeLine = (id: string) => {
    const remaining = lines.filter(line => line.id !== id)
    setSavedLines(remaining)
    if (tableLineId === id) { setTableLineId(remaining[0]?.id ?? ''); setTimelineSelection(null) }
    if (editingId === id) resetDraft()
  }
  const title = 'HPの推移（推定）'
  const aspectRatio = aspect.preset !== 'auto' && [aspect.width, aspect.height].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(aspect.width) / Number(aspect.height) : undefined
  const openImage = () => {
    if (!series.length) return
    setFeedback(null)
    setImage({ id: ++nextSnapshot.current, series, range: chartRange,
      title: `スルト S3 ${title}`, conditions: `${[...new Set(comparison.filter(item => item.visible && item.result).map(item => skillLabel(item.condition.settings.skillLevelIndex)))].join('・')}・比較${series.length}条件`,
      filename: getSurtrDurationImageFilename({ ...settings, chartRange, skillLevelLabel: label, modules: series.map(item => item.label),
        comparisonConditions: record ? comparison.filter(item => item.visible && item.result).flatMap(item =>
          getSurtrDurationFilenameParts(record, item.condition, item.timeLimit, enemyRows, rows)) : [] }),
    })
  }
  const saveImage = async (filename: string, ratio?: number) => {
    if (!image || saveInProgress.current) return
    saveInProgress.current = true
    setSaving(true)
    setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({ filename,
        width: getChartImageLayout({ naturalChartHeight: 334, aspectRatio: ratio }).width,
        chart: <SurtrDurationChartImage {...image} aspectRatio={ratio} />,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
      setImage(null)
    } catch { setFeedback('failed') }
    finally { saveInProgress.current = false; setSaving(false) }
  }
  const openTableImage = () => {
    if (!timelineRows.length || !calculation?.model || invalid) return
    setTableImage(structuredClone({ id: ++nextSnapshot.current, rows: timelineRows, precision: tablePrecision, layout: tableLayout,
      title: 'スルト S3 HPの推移（推定）',
      conditions: [calculation.label, ...calculation.details, `準備${calculation.model.activationDelay}秒`],
      filenameOptions: { ...settings, skillLevelLabel: label, modules: [calculation.label],
        comparisonConditions: record ? getSurtrDurationFilenameParts(record, calculation.condition, calculation.timeLimit, enemyRows, rows) : [],
        step: timelineStep, precision: tablePrecision, layout: tableLayout },
    }))
    setTableFeedback(null); setTablePreviewReady(false); setTablePreviewError(null)
  }
  const saveTableImage = async (filename: string, ratio?: number) => {
    if (!tableImage || !tablePreviewReady || tablePreviewError || tableSaveInProgress.current) return
    const snapshot = tableImage
    tableSaveInProgress.current = true; setTableSaving(true); setTableFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveSurtrDurationTableImage({ snapshot, filename, aspectRatio: ratio,
        writeBlob: destination.type === 'file' ? destination.write : undefined })
      setTableImage(null); setTableFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
    } catch { setTableFeedback('failed') }
    finally { tableSaveInProgress.current = false; setTableSaving(false) }
  }
  const tableAspectRatio = tableAspect.preset === 'auto' ? undefined : Number(tableAspect.width) / Number(tableAspect.height)
  const tableLayoutReady = useCallback(() => { setTablePreviewReady(true); setTablePreviewError(null) }, [])
  const tableLayoutError = useCallback(() => {
    setTablePreviewReady(false)
    setTablePreviewError('この配置・比率では表全体を画像に収められません。表示間隔・配置・画像の比率を変更してください。')
  }, [])
  const status = error ? <div className="error-box" role="alert">{error}<button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></div>
    : <p className="surtr-s3-status" role="status">{loading ? 'スルトのデータを読み込み中…' : 'スルトS3のデータを取得できませんでした。'}</p>

  return <section className="calculator-page surtr-s3-page surtr-duration-page" aria-labelledby="surtr-duration-title">
    <div className="page-heading-with-breadcrumbs">
      <PageBreadcrumbs parents={[SURTR_HOME_LINK]} current="S3 継続時間" />
      <header className="page-intro"><h1 id="surtr-duration-title">S3 継続時間<span className="surtr-s3-subtitle">発動から退場まで</span></h1></header>
    </div>
    <CollapsibleCalculatorPanel id="surtr-duration-info" number="01" title="オペレーター情報" defaultOpen={false}
      summary={`スルト・昇進2 Lv.${settings.level}・信頼${settings.trust}`} collapsedLabel="情報を表示">
      {record ? <div className="surtr-s3-table-wrap"><table className="surtr-s3-table" aria-label="スルトのHPと余燼">
        <thead><tr><th scope="col">装備</th><th scope="col">発動前の最大HP</th><th scope="col">スキル中の最大HP</th><th scope="col">余燼の持続時間</th></tr></thead>
        <tbody>{comparison.map(item => <tr key={item.id}><th scope="row">{item.label}</th>
          <td>{item.model ? formatHp(item.model.baseMaxHp) : '—'}</td><td>{item.model ? formatHp(item.model.maxHp) : '—'}</td>
          <td>{item.model ? seconds(item.model.remnantDuration) : '—'}</td>
        </tr>)}</tbody>
      </table></div> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-duration-settings" number="02" title="線の条件"
      summary={editingId ? '比較線を編集中' : '比較線を追加'} collapsedLabel="設定を表示">
      {record && currentDraft ? <>
        {enemyLoading && <p className="surtr-s3-status" role="status">敵データを読み込み中…</p>}
        {enemyError && <div className="error-box" role="alert">{enemyError}<button type="button" className="button secondary" onClick={() => setEnemyAttempt(value => value + 1)}>再読み込み</button></div>}
        <SurtrDurationConditionEditor key={editingId ?? 'new-line'} record={record} skillRows={rows} enemyRows={enemyRows}
          enemyLoading={enemyLoading} enemyError={enemyError} onEnemyRetry={() => setEnemyAttempt(value => value + 1)}
          value={currentDraft} onChange={setDraft} onSubmit={saveLine} submitLabel={editingId ? '線を更新' : '線を追加'}
          onCancelEdit={editingId ? resetDraft : undefined} submitDisabled={!validLimit || !editingId && lines.length >= MAX_LINES}
          footerFields={<label className="calculator-field surtr-duration-limit-field"><span>計算上限（秒）</span>
            <input type="number" min={1} max={600} step={1} required value={Number.isNaN(draftLimit) ? '' : draftLimit}
              onChange={event => setDraftLimit(event.target.value === '' ? NaN : Number(event.target.value))} /></label>} />
        {!editingId && lines.length >= MAX_LINES && <p className="surtr-s3-status" role="status">比較線は{MAX_LINES}本まで追加できます。</p>}
        {lineFeedback && <p className="surtr-s3-status" role="status">{lineFeedback}</p>}
        <details className="surtr-s3-assumptions"><summary>計算条件・対応範囲</summary>
          <p>S3の発動操作を0秒とし、準備時間0.6秒の後に最大HP増加・全回復を反映します。開始時は全快とし、外部HPバフと手動撤退は含めません。</p>
          <p>最大HPに対する毎秒の減少率が0から60秒で20%まで増え、効果開始から0.2秒ごとにHPを減らす推定です。致死量に達するとHP1で余燼へ移行します。余燼中も回復しますが、発動時に決まった退場時刻は延長しません。</p>
          <p>敵はデータ上の通常攻撃だけを繰り返します。スルトの防御力・術耐性とMODの加算値を反映し、敵の特殊能力、ステージ補正、敵の撃破、射程・攻撃対象の競合は計算しません。同じ行の敵は指定数が同時に攻撃します。</p>
          <p>回復役はアンセル・ハイビスカス・ススーロに対応します。選択した育成とスキルを反映し、スルトだけを回復対象とします。回復役のMOD、外部バフ、配置による対象選択は計算しません。スキルは指定時刻に1回だけ発動し、SPは計算しません。</p>
          <p>通常時とスキル中の最初の回復時刻をそれぞれ指定し、以後は各状態の回復間隔で繰り返します。スキル終了後は通常の回復間隔を1回待って再開します。状態切替時の実際の攻撃CTを再現するものではありません。</p>
          <p>同時刻は退場、S3の全回復、自傷、敵の攻撃、味方の回復の順に処理します。初回の減少タイミング、内部の丸め、発動・退場フレームは実機未検証です。計算上限までに退場しなければ、その範囲での結果として表示します。</p>
          <p><a href="https://prts.wiki/w/%E5%8F%B2%E5%B0%94%E7%89%B9%E5%B0%94" target="_blank" rel="noreferrer">減少間隔・準備時間の参照元</a></p>
        </details>
      </> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-duration-output" number="03" title="計算結果" summary={title} collapsedLabel="結果を表示" className="surtr-s3-output-panel">
      {!record ? status : <div className="surtr-s3-results-layout">
        <div className="surtr-s3-table-wrap"><table className="surtr-s3-table surtr-duration-lines-table" aria-label="比較線の一覧">
          <thead><tr><th scope="col">表示</th><th scope="col">線名</th><th scope="col">余燼発動まで</th><th scope="col">余燼中</th><th scope="col">退場まで</th><th scope="col">操作</th></tr></thead>
          <tbody>{comparison.map(item => <tr key={item.id}>
            <td><input type="checkbox" aria-label={`${item.label}をグラフに表示`} checked={item.visible}
              onChange={event => setSavedLines(lines.map(line => line.id === item.id ? { ...line, visible: event.target.checked } : line))} /></td>
            <th scope="row"><span className="surtr-s3-column-label"><i style={{ backgroundColor: item.color }} />{item.label}</span>
              <details className="surtr-duration-line-details"><summary>条件</summary>{item.details.map((detail, index) => <p key={index}>{detail}</p>)}</details></th>
            <td>{item.result ? item.result.remnantStart === null ? `${item.timeLimit}秒以内に未発動` : seconds(item.result.remnantStart) : '計算不可'}</td>
            <td>{item.result?.remnantStart != null ? seconds(item.result.remnantDuration) : '—'}</td>
            <td>{item.result ? item.result.outcome === 'limit' ? `${item.timeLimit}秒以内に退場せず` : <strong>{seconds(item.result.retreatTime)}</strong> : '—'}</td>
            <td><div className="surtr-duration-line-actions">
              <button type="button" aria-label={`${item.label}の線を編集`} onClick={() => editLine(item)}>編集</button>
              <button type="button" aria-label={`${item.label}の線を複製`} disabled={lines.length >= MAX_LINES} onClick={() => {
                const id = `line-${++nextLine.current}`
                setSavedLines([...lines, { id, timeLimit: item.timeLimit, visible: item.visible, condition: { ...structuredClone(item.condition), name: `${item.label}（複製）` } }])
                setTableLineId(id)
              }}>複製</button>
              <button type="button" aria-label={`${item.label}の線を削除`} onClick={() => removeLine(item.id)}>削除</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
        {comparison.filter(item => !item.result).map(item => <p key={item.id} role="alert">{item.label}：{item.participants.unsupportedReasons.join(' ') || '計算設定を確認してください。'}</p>)}
        <section className="surtr-s3-chart-section" aria-labelledby="surtr-duration-chart-title">
          <div className="surtr-s3-result-heading"><h3 id="surtr-duration-chart-title">{title}</h3>
            <button type="button" className="button secondary" aria-label="グラフをPNG画像で保存" aria-haspopup="dialog" disabled={!series.length} onClick={openImage}>画像を保存</button>
          </div>
          <label className="surtr-s3-output-control surtr-duration-chart-range"><span>表示範囲</span>
            <select aria-label="グラフの表示範囲" value={chartRange} onChange={event => setChartRange(event.target.value as SurtrDurationChartRange)}>
              <option value="remnant">素質2発動まで</option><option value="retreat">退場まで</option>
            </select></label>
          <div className="surtr-s3-chart-area"><SurtrDurationChart series={series} title={title} range={chartRange}
            selection={calculation?.visible && selectedTimelineRow ? { ...selectedTimelineRow, seriesId: calculation.id } : undefined} /></div>
        </section>
      </div>}
      {feedback && feedback !== 'failed' && <p className="surtr-s3-status" role="status">{feedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-duration-table-output" number="04" title="テーブル出力" summary={title} collapsedLabel="テーブルを表示"
      className="surtr-s3-output-panel" headerActions={<button type="button" className="button secondary"
        aria-label="テーブルをPNG画像で保存" aria-haspopup="dialog" disabled={!timelineRows.length || invalid} onClick={openTableImage}>画像を保存</button>}>
      {record && comparison.length > 0 && <label className="surtr-s3-output-control surtr-duration-table-line"><span>対象の線</span>
        <select aria-label="テーブルの対象の線" value={calculation?.id ?? ''} onChange={event => { setTableLineId(event.target.value); setTimelineSelection(null); setTableFeedback(null) }}>
          {comparison.map(item => <option key={item.id} value={item.id}>{item.label}{item.visible ? '' : '（グラフ非表示）'}</option>)}
        </select></label>}
      {!record ? status : invalid ? <p role="alert">計算に必要なデータを取得できませんでした。</p>
        : !timelineRows.length ? <p className="surtr-s3-status" role="status">比較線を追加してください。</p>
          : <SurtrDurationTimelineTable key={calculation?.id}
            rows={timelineRows} step={timelineStep} onStepChange={value => { setTimelineStep(value); setTableFeedback(null) }}
            layout={tableLayout} onLayoutChange={value => { setTableLayout(value); setTableFeedback(null) }}
            precision={tablePrecision} onPrecisionChange={value => { setTablePrecision(value); setTableFeedback(null) }} selectedTime={selectedTimelineRow?.time}
            onSelect={row => { if (calculation?.result) setTimelineSelection({ lineId: calculation.id, condition: calculation.condition, timeLimit: calculation.timeLimit, time: row.time }) }} />}
      {tableFeedback && tableFeedback !== 'failed' && <p className="surtr-s3-status" role="status">{tableFeedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    </CollapsibleCalculatorPanel>
    {image && <ChartImageSaveDialog initialFilename={image.filename} getDefaultFilename={ratio => withChartImageAspect(
      withChartImageLabelFilename(image.filename, getSurtrDurationImageLabelDefaults(image.series, image.title), image.labels), ratio)} aspect={aspect} onAspectChange={setAspect}
      canChooseLocation={!!picker} saving={saving} error={feedback === 'failed'} helpMode="popover"
      onClose={() => { if (!saveInProgress.current) { setImage(null); setFeedback(null) } }} onSave={(filename, ratio) => void saveImage(filename, ratio)}
      options={<ChartImageLabelEditor defaults={getSurtrDurationImageLabelDefaults(image.series, image.title)} value={image.labels ?? {}}
        disabled={saving} onChange={labels => setImage(current => current ? { ...current, labels } : null)} />}
      preview={<SurtrDurationChartImagePreview key={JSON.stringify([image.id, image.labels, aspectRatio ?? 'auto'])} {...image} aspectRatio={aspectRatio} />} />}
    {tableImage && <ChartImageSaveDialog initialFilename={getSurtrDurationTableImageFilename(tableImage.filenameOptions)}
      getDefaultFilename={ratio => getSurtrDurationTableImageFilename(tableImage.filenameOptions, ratio)} aspect={tableAspect}
      onAspectChange={value => { setTablePreviewReady(false); setTablePreviewError(null); setTableAspect(value) }}
      aspectHint="タイトル・条件を含むテーブル全体の比率です。指定なしでは全行・全列が収まる大きさに自動調整します。"
      canChooseLocation={!!picker} saving={tableSaving} saveDisabled={!tablePreviewReady || !!tablePreviewError} error={tableFeedback === 'failed'} helpMode="popover"
      onClose={() => { if (!tableSaveInProgress.current) { setTableImage(null); setTableFeedback(null) } }} onSave={(filename, ratio) => void saveTableImage(filename, ratio)}
      options={<><label className="chart-image-save-field"><span>画像タイトル</span><input type="text" maxLength={100} value={tableImage.title} disabled={tableSaving}
        onChange={event => { setTablePreviewReady(false); setTablePreviewError(null); setTableImage(previous => previous ? { ...previous, title: event.target.value } : null) }} /></label>
        {tablePreviewError && <p role="alert" className="chart-image-save-error">{tablePreviewError}</p>}</>}
      preview={<SurtrDurationTableImagePreview key={`${tableImage.id}:${tableImage.title}:${JSON.stringify(tableAspect)}`} {...tableImage} aspectRatio={tableAspectRatio}
        onLayoutReady={tableLayoutReady} onLayoutError={tableLayoutError} />} />}
  </section>
}
