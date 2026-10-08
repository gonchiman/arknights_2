import { useEffect, useMemo, useRef, useState } from 'react'
import { aggregateMainEnemyChapters, aggregateMainEnemyMaps, loadMainEnemyTrends, MAIN_ENEMY_METRICS,
  type MainEnemyKind, type MainEnemyMetric, type MainEnemyTrendRow, type MainEnemyTrendsData, type MainEnemyWeighting } from '../lib/mainEnemyTrends'
import { createMainEnemyTrendImageFilename } from '../lib/mainEnemyTrendImageFilename'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { DATA_SOURCE_URLS } from '../lib/dataSources'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { PersistentDetails } from './PersistentDetails'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import { MainEnemyTrendChart, MAIN_ENEMY_TREND_NATURAL_HEIGHT, type MainEnemyTrendPoint } from './MainEnemyTrendChart'
import { MainEnemyTrendImage, MainEnemyTrendImagePreview, type MainEnemyTrendImageSnapshot } from './MainEnemyTrendImage'
import './DamageCalculator.css'
import './EnemyAnalysis.css'
import './EnemyStatisticsSummary.css'
import './MainEnemyTrendsPage.css'

const PAGE_SIZE = 6
const KIND_OPTIONS: { value: MainEnemyKind; label: string }[] = [
  { value: 'all', label: '全敵' }, { value: 'combat', label: '通常＋エリート' },
  { value: 'normal', label: '通常のみ' }, { value: 'boss', label: 'ボスのみ' },
]
const WEIGHT_OPTIONS: { value: MainEnemyWeighting; label: string }[] = [
  { value: 'appearances', label: '出現体数' }, { value: 'types', label: '敵の種類' },
]
const PLOT_METRICS = { hp: 'hp', attack: 'atk', defense: 'def', resistance: 'res' } as const
const format = (value: number | null, digits = 1) => value === null ? '—' : value.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const kindLabel = (value: MainEnemyKind) => KIND_OPTIONS.find((option) => option.value === value)!.label
const weightLabel = (value: MainEnemyWeighting) => WEIGHT_OPTIONS.find((option) => option.value === value)!.label

export function MainEnemyTrendsPage() {
  const [data, setData] = useState<MainEnemyTrendsData | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(16)
  const [kind, setKind] = useState<MainEnemyKind>('all')
  const [weighting, setWeighting] = useState<MainEnemyWeighting>('appearances')
  const [metric, setMetric] = useState<MainEnemyMetric>('hp')
  const [chartKind, setChartKind] = useState<'line' | 'bar'>('line')
  const [showMean, setShowMean] = useState(true)
  const [showMedian, setShowMedian] = useState(true)
  const [selectedChapter, setSelectedChapter] = useState(12)
  const [page, setPage] = useState(2)
  const [imageSnapshot, setImageSnapshot] = useState<MainEnemyTrendImageSnapshot | null>(null)
  const [imageAspect, setImageAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [imageFeedback, setImageFeedback] = useState<'saved' | 'failed' | null>(null)
  const savingRef = useRef(false)
  useEffect(() => {
    let active = true
    setError(false)
    void loadMainEnemyTrends().then((next) => {
      if (!active) return
      setData(next)
      setStart(next.source.chapterRange[0])
      setEnd(next.source.chapterRange[1])
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [attempt])
  const rows = useMemo(() => data ? aggregateMainEnemyChapters(data, { kind, weighting })
    .filter((row) => row.chapter >= start && row.chapter <= end) : [], [data, kind, weighting, start, end])
  const selected = rows.find((row) => row.chapter === selectedChapter) ?? rows[0]
  const mapRows = useMemo(() => data && selected ? aggregateMainEnemyMaps(data, selected.chapter, { kind, weighting }) : [],
    [data, selected?.chapter, kind, weighting])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const activePage = Math.min(page, pageCount - 1)
  const pageRows = rows.slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE)
  const points: MainEnemyTrendPoint[] = rows.map((row) => ({ chapter: row.chapter, label: row.name,
    mean: row.stats[metric].mean, median: row.stats[metric].median,
    includedMaps: row.includedMapCount, totalMaps: row.eligibleMapCount, partialMaps: row.partialMapCount,
    missingCount: row.stats[metric].missingCount }))
  const included = rows.reduce((sum, row) => sum + row.includedMapCount, 0)
  const partial = rows.reduce((sum, row) => sum + row.partialMapCount, 0)
  const eligible = rows.reduce((sum, row) => sum + row.eligibleMapCount, 0)
  const totalEnemies = rows.reduce((sum, row) => sum + row.enemyCount, 0)
  const totalTypes = rows.reduce((sum, row) => sum + row.typeCount, 0)
  const metricLabel = MAIN_ENEMY_METRICS.find(({ key }) => key === metric)!.label
  const scope = `${start}〜${end}章 · ${kindLabel(kind)} · ${weightLabel(weighting)}`
  const selectChapter = (chapter: number) => {
    setSelectedChapter(chapter)
    const index = rows.findIndex((row) => row.chapter === chapter)
    if (index >= 0) setPage(Math.floor(index / PAGE_SIZE))
  }
  const changeRange = (nextStart: number, nextEnd: number) => {
    const nextChapter = Math.max(nextStart, Math.min(nextEnd, selectedChapter))
    const nextIndex = data?.chapters.filter(({ chapter }) => chapter >= nextStart && chapter <= nextEnd)
      .findIndex(({ chapter }) => chapter === nextChapter) ?? 0
    setStart(nextStart)
    setEnd(nextEnd)
    setSelectedChapter(nextChapter)
    setPage(Math.floor(Math.max(0, nextIndex) / PAGE_SIZE))
  }
  const openImage = () => {
    setImageFeedback(null)
    setImageSnapshot({ id: crypto.randomUUID(), points, metric: PLOT_METRICS[metric], kind: chartKind,
      showMean, showMedian, conditions: `${kindLabel(kind)}・${weightLabel(weighting)}・${start}〜${end}章`,
      filename: createMainEnemyTrendImageFilename({ metric: PLOT_METRICS[metric], chapterRange: [start, end],
        enemyKind: kindLabel(kind), weighting: weightLabel(weighting), kind: chartKind, showMean, showMedian }) })
  }
  const saveImage = async (filename: string, aspectRatio?: number) => {
    if (!imageSnapshot || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setImageFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, getChartImageSavePicker())
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({ chart: <MainEnemyTrendImage snapshot={imageSnapshot} aspectRatio={aspectRatio} />,
        filename, width: getChartImageLayout({ naturalChartHeight: MAIN_ENEMY_TREND_NATURAL_HEIGHT, aspectRatio }).width,
        writeBlob: destination.type === 'file' ? destination.write : undefined })
      setImageFeedback('saved')
      setImageSnapshot(null)
    } catch { setImageFeedback('failed') }
    finally { savingRef.current = false; setSaving(false) }
  }
  const previewAspect = imageAspect.preset === 'auto' ? undefined : Number(imageAspect.width) / Number(imageAspect.height)
  return <section className="calculator-page enemy-analysis-route main-enemy-trends-page">
    <header className="page-intro">
      <div><span className="page-kicker">MAIN STORY ENEMY STATISTICS</span><h1>メイン敵ステータス推移</h1></div>
      <a className="button secondary enemy-page-link" href="#/maps">マップデータベースへ</a>
    </header>
    {!data ? <div className="calculator-loading" role={error ? 'alert' : 'status'}>
      {error ? <div>データを読み込めませんでした。<button type="button" className="button secondary" onClick={() => setAttempt((current) => current + 1)}>再読み込み</button></div>
        : '敵ステータス推移データを読み込み中…'}
    </div> : <>
      <CollapsibleCalculatorPanel id="main-trend-settings" number="01" title="集計条件" summary={scope} collapsedLabel="設定を表示">
        <div className="main-trend-filters">
          <fieldset><legend>章の範囲</legend><div className="main-trend-range">
            <label><span className="visually-hidden">開始章</span><select aria-label="開始章" value={start}
              onChange={(event) => changeRange(Number(event.target.value), Math.max(Number(event.target.value), end))}>
              {data.chapters.map(({ chapter }) => <option key={chapter} value={chapter}>{chapter}章</option>)}
            </select></label><span>〜</span>
            <label><span className="visually-hidden">終了章</span><select aria-label="終了章" value={end}
              onChange={(event) => changeRange(Math.min(start, Number(event.target.value)), Number(event.target.value))}>
              {data.chapters.map(({ chapter }) => <option key={chapter} value={chapter}>{chapter}章</option>)}
            </select></label>
          </div></fieldset>
          <label><span>敵の区分</span><select value={kind} onChange={(event) => setKind(event.target.value as MainEnemyKind)}>
            {KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>
          <label><span>集計の重み</span><select value={weighting} onChange={(event) => setWeighting(event.target.value as MainEnemyWeighting)}>
            {WEIGHT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>
          <button type="button" className="button secondary" onClick={() => {
            changeRange(data.source.chapterRange[0], data.source.chapterRange[1]); setKind('all'); setWeighting('appearances')
          }}>条件をリセット</button>
        </div>
        <div className="main-trend-coverage"><span>集計マップ <strong>{included} / {eligible}</strong></span><span>出現体数 <strong>{format(totalEnemies, 0)}</strong></span>
          {partial > 0 && <span>うち一部集計 <strong>{partial}マップ</strong></span>}
          {weighting === 'types' && <span>種類数（章別合計） <strong>{format(totalTypes, 0)}</strong></span>}
        </div>
        <PersistentDetails persistenceId="main-trend-method" className="enemy-stat-summary-help">
          <summary>集計方法・対象範囲</summary>
          <dl>
            <div><dt>対象</dt><dd>メインテーマの通常本編。強襲・厄難・死地作戦・サブステージ（S）・訓練・ストーリーのみのマップは対象外です。</dd></div>
            <div><dt>出現体数</dt><dd>各マップの確定している固定出現を集計します。条件付きの追加出現・召喚・再出現は含めません。市民・味方・演出用ユニット・環境装置を除外します。</dd></div>
            <div><dt>ステータス</dt><dd>マップの敵レベルと初期補正を反映します。戦闘中のバフ・形態変化は含めません。不明な値は0に置き換えず、指標ごとに集計から除外します。</dd></div>
            <div><dt>敵の種類</dt><dd>同じ敵ID・レベル・ステータスの組み合わせを章内で1種類として集計します。マップ別の値はそのマップ内で集計します。</dd></div>
            <div><dt>平均・中央値</dt><dd>選んだ重みで章内の敵をまとめて計算します。マップごとの平均の単純平均ではありません。</dd></div>
            <div><dt>集計マップ数</dt><dd>一部集計を含む、集計できたマップ数 / 対象マップ数。未確定・敵を含まないマップも対象数に残します。各マップの状態はパネル03で確認できます。</dd></div>
            <div><dt>一部集計・欠測</dt><dd>条件付きの出現を除外したマップや、未集計のマップ・不明なステータスを含む章を、白抜きの点（棒グラフでは薄い棒）で示します。値は確認できた出現だけの集計で、マップ全体の値を保証するものではありません。</dd></div>
            <div><dt>欠測</dt><dd>選んだ指標の値が不明な集計単位の数です。出現体数では体数、敵の種類では種類数です。</dd></div>
            <div><dt>参照元</dt><dd><a href={DATA_SOURCE_URLS.stageTable} target="_blank" rel="noreferrer">ステージデータ</a> · <a href={DATA_SOURCE_URLS.enemyDatabase} target="_blank" rel="noreferrer">敵ステータス</a> · <a href={DATA_SOURCE_URLS.levelDirectory} target="_blank" rel="noreferrer">マップデータ</a></dd></div>
          </dl>
        </PersistentDetails>
      </CollapsibleCalculatorPanel>
      <CollapsibleCalculatorPanel id="main-trend-output" number="02" title="ステータスの推移" summary={`${metricLabel} · ${chartKind === 'line' ? '折れ線' : '集合棒'}`} collapsedLabel="出力を表示"
        headerActions={<button type="button" className="button secondary" aria-haspopup="dialog"
          disabled={!points.some((point) => point.mean !== null) || (!showMean && !showMedian)} onClick={openImage}>画像を保存</button>}>
        <div className="main-trend-output-controls">
          <div className="enemy-metric-selector main-trend-metric-selector" role="group" aria-label="表示するステータス">
            {MAIN_ENEMY_METRICS.map(({ key, label }) => <button key={key} type="button" className={metric === key ? 'active' : ''}
              aria-pressed={metric === key} onClick={() => setMetric(key)}>{label}</button>)}
          </div>
          <label className="main-trend-chart-choice"><span>グラフ</span><select value={chartKind} onChange={(event) => setChartKind(event.target.value as 'line' | 'bar')}>
            <option value="line">折れ線</option><option value="bar">集合棒</option>
          </select></label>
          <div className="main-trend-series" role="group" aria-label="表示する統計量">
            <label><input type="checkbox" checked={showMean} onChange={(event) => setShowMean(event.target.checked)} />平均</label>
            <label><input type="checkbox" checked={showMedian} onChange={(event) => setShowMedian(event.target.checked)} />中央値</label>
          </div>
        </div>
        <MainEnemyTrendChart points={points} metric={PLOT_METRICS[metric]} kind={chartKind} showMean={showMean} showMedian={showMedian}
          selectedChapter={selected?.chapter} onSelectChapter={selectChapter} />
        {imageFeedback === 'saved' && <p role="status">画像を保存しました。</p>}
        <div className="main-trend-table-title"><h3>章別の数値</h3><span>{metricLabel}</span></div>
        <div className="enemy-stat-summary-scroll" tabIndex={0} aria-label="章別の数値">
          <table className="enemy-stat-summary-table main-trend-chapter-table">
            <thead><tr><th scope="col">章</th><th scope="col">平均</th><th scope="col">中央値</th><th scope="col">{weighting === 'types' ? '種類数' : '出現体数'}</th><th scope="col">集計マップ / 対象</th><th scope="col">欠測</th></tr></thead>
            <tbody>{pageRows.map((row) => <tr key={row.id} className={selected?.chapter === row.chapter ? 'selected' : ''} onClick={() => selectChapter(row.chapter)}>
              <th scope="row"><button type="button" aria-pressed={selected?.chapter === row.chapter} onClick={() => selectChapter(row.chapter)}>{row.label}</button></th>
              <td>{format(row.stats[metric].mean)}</td><td>{format(row.stats[metric].median)}</td>
              <td>{format(weighting === 'types' ? row.typeCount : row.enemyCount, 0)}</td>
              <td>{row.includedMapCount} / {row.eligibleMapCount}{row.partialMapCount > 0 && <small className="main-trend-partial-count">うち一部集計 {row.partialMapCount}</small>}</td>
              <td>{format(row.stats[metric].missingCount, 0)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="main-trend-pagination"><span>{rows.length ? activePage * PAGE_SIZE + 1 : 0}–{Math.min((activePage + 1) * PAGE_SIZE, rows.length)} / {rows.length}章</span>
          <div><button type="button" className="button secondary" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>前へ</button>
            <span>{activePage + 1} / {pageCount}</span><button type="button" className="button secondary" disabled={activePage === pageCount - 1} onClick={() => setPage(activePage + 1)}>次へ</button></div>
        </div>
      </CollapsibleCalculatorPanel>
      <CollapsibleCalculatorPanel id="main-trend-maps" number="03" title="選択章のマップ" summary={selected ? `${selected.label} · ${selected.includedMapCount} / ${selected.eligibleMapCount}マップ` : '対象なし'} collapsedLabel="マップを表示">
        {selected && <>
          <div className="main-trend-selected"><h3>{selected.label}<span>{selected.name}</span></h3>
            <div className="main-trend-selected-metrics">{MAIN_ENEMY_METRICS.map(({ key, label }) => <span key={key}>{label}<strong>{format(selected.stats[key].mean)}</strong><small>平均</small></span>)}</div>
          </div>
          <PersistentDetails persistenceId="main-trend-map-table" className="main-trend-map-details">
            <summary>マップ別の数値 <span>{mapRows.length}マップ</span></summary>
            <div className="enemy-stat-summary-scroll" tabIndex={0} aria-label="マップ別の数値">
              <table className="enemy-stat-summary-table main-trend-map-table">
                <thead><tr><th scope="col">マップ</th>{MAIN_ENEMY_METRICS.map(({ key, label }) => <th scope="col" key={key}>{label}<span className="enemy-stat-summary-unit">平均</span></th>)}<th scope="col">{weighting === 'types' ? '種類数' : '出現体数'}</th><th scope="col">集計状態</th></tr></thead>
                <tbody>{mapRows.map((row) => <MapRow key={row.id} row={row} weighting={weighting} />)}</tbody>
              </table>
            </div>
          </PersistentDetails>
        </>}
      </CollapsibleCalculatorPanel>
    </>}
    {imageSnapshot && <ChartImageSaveDialog initialFilename={imageSnapshot.filename}
      getDefaultFilename={(aspectRatio) => withChartImageAspect(imageSnapshot.filename, aspectRatio)}
      aspect={imageAspect} onAspectChange={setImageAspect} canChooseLocation={Boolean(getChartImageSavePicker())}
      saving={saving} error={imageFeedback === 'failed'} helpMode="popover"
      onClose={() => { if (!saving) setImageSnapshot(null) }} onSave={(filename, aspectRatio) => void saveImage(filename, aspectRatio)}
      preview={<MainEnemyTrendImagePreview key={`${imageSnapshot.id}:${previewAspect ?? 'auto'}`} snapshot={imageSnapshot} aspectRatio={previewAspect} />} />}
  </section>
}

function MapRow({ row, weighting }: { row: MainEnemyTrendRow; weighting: MainEnemyWeighting }) {
  const missing = MAIN_ENEMY_METRICS.filter(({ key }) => row.stats[key].missingCount > 0)
  const reasons = [...new Set(row.reasons.map(mapReasonLabel))].join('・')
  const contributing = row.status === 'included' || row.status === 'partial'
  return <tr><th scope="row"><span title={row.name}>{row.label}</span></th>
    {MAIN_ENEMY_METRICS.map(({ key }) => <td key={key}>{format(row.stats[key].mean)}</td>)}
    <td>{contributing ? format(weighting === 'types' ? row.typeCount : row.enemyCount, 0) : '—'}</td>
    <td className="main-trend-map-status">{contributing ? missing.length
      ? <details><summary>{row.status === 'partial' ? '一部集計・欠測' : '一部欠測'}</summary><small>{missing.map(({ key, label }) => `${label}：${row.stats[key].missingCount}欠測`).join('・')}</small></details>
      : row.status === 'partial' ? '一部集計' : '集計済み'
      : <span>{row.status === 'missing' ? '未取得' : '対象外'}</span>}
      {reasons && <small>{reasons}</small>}
    </td>
  </tr>
}

function mapReasonLabel(reason: string): string {
  if (reason === 'no-hostile-spawn') return '集計対象の敵なし'
  if (reason === 'hidden-spawn-group') return '非表示グループの出現指定'
  if (reason === 'branch-spawn') return '分岐に応じた出現指定'
  if (reason === 'random-spawn-group' || reason === 'weighted-spawn') return 'ランダム出現を除外'
  if (reason === 'unscheduled-spawn') return '追加出現を除外'
  if (reason.startsWith('conditional-spawn:') || reason === 'unsupported-wave-tag') return '条件付きの出現を除外'
  if (reason === 'enemy-replacement') return '敵の置き換え'
  if (reason.includes('missing') || reason === 'not-cached') return 'マップデータ未取得'
  if (reason.startsWith('unsupported')) return '未対応の設定'
  return '出現条件を確認できない'
}
