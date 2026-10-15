import { useCallback, useId, useRef, useState } from 'react'
import { writeClipboardText } from '../lib/clipboard'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { CHART_IMAGE_LABEL_MAX_LENGTH } from '../lib/chartImageLabels'
import { DEFAULT_COMPARISON_TABLE_IMAGE_TYPOGRAPHY } from '../lib/tableImageTypography'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ComparisonTableImageOptions } from './ComparisonTableImageOptions'
import { getSurtrSkillComparisonTableTsv, SurtrSkillComparisonTableContent, SURTR_SKILL_COMPARISON_METRIC_LABELS,
  type SurtrSkillComparisonColumnOrder, type SurtrSkillComparisonDisplayMode, type SurtrSkillComparisonMetric, type SurtrSkillComparisonRankMode, type SurtrSkillComparisonTableData,
  type SurtrSkillComparisonTableMetadata, type SurtrSkillComparisonTableSeries } from './SurtrSkillComparisonTableContent'
import { getSurtrSkillComparisonTableImageFilename, getSurtrSkillComparisonTableTitle, saveSurtrSkillComparisonTableImage,
  SurtrSkillComparisonTableImagePreview, type SurtrSkillComparisonImageLayout,
  type SurtrSkillComparisonTableImageSnapshot } from './SurtrSkillComparisonTableImage'

export type { SurtrSkillComparisonTableSeries, SurtrSkillComparisonTableMetadata } from './SurtrSkillComparisonTableContent'

export function SurtrSkillComparisonTableOutput({ series, resistances, metadata, onOpenDetail }: {
  series: readonly SurtrSkillComparisonTableSeries[]
  resistances: readonly number[]
  metadata: SurtrSkillComparisonTableMetadata
  onOpenDetail?: (resistance: number, seriesId: string, skillIndex?: 2 | 3) => void
}) {
  const [displayMode, setDisplayMode] = useState<SurtrSkillComparisonDisplayMode>('numeric')
  const [metric, setMetric] = useState<SurtrSkillComparisonMetric>('dps')
  const [precision, setPrecision] = useState(0)
  const [columnOrder, setColumnOrder] = useState<SurtrSkillComparisonColumnOrder>('module')
  const [requestedRankMode, setRankMode] = useState<SurtrSkillComparisonRankMode>('none')
  const rankMode: SurtrSkillComparisonRankMode = requestedRankMode === 'merged' ? 'merged' : 'none'
  const [colorScale, setColorScale] = useState<SurtrSkillComparisonTableData['colorScale']>('none')
  const [winnerColor, setWinnerColor] = useState<'category' | 'none'>('category')
  const [winnerGapShading, setWinnerGapShading] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; ok: boolean } | null>(null)
  const [copying, setCopying] = useState(false)
  const [image, setImage] = useState<SurtrSkillComparisonTableImageSnapshot | null>(null)
  const [imageTitle, setImageTitle] = useState<string | null>(null)
  const [imageLayout, setImageLayout] = useState<SurtrSkillComparisonImageLayout>('current')
  const [typography, setTypography] = useState({ ...DEFAULT_COMPARISON_TABLE_IMAGE_TYPOGRAPHY })
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const [layoutError, setLayoutError] = useState('')
  const saveInProgress = useRef(false)
  const titleId = useId()
  const picker = getChartImageSavePicker()
  const winner = displayMode !== 'numeric'
  const insufficientCandidates = displayMode === 'module-winner' ? series.length < 2 : series.length < 1
  const data = { series, resistances, metric, precision, columnOrder, rankMode, colorScale, displayMode, winnerColor,
    winnerGapShading: winnerGapShading && winnerColor !== 'none' && !insufficientCandidates }
  const tableText = getSurtrSkillComparisonTableTsv(data)
  const copyState = copyFeedback?.text === tableText ? copyFeedback.ok : null
  const ratio = aspect.preset === 'auto' ? undefined : Number(aspect.width) / Number(aspect.height)
  const aspectError = ratio !== undefined && (!Number.isFinite(ratio) || ratio < 0.1 || ratio > 10)
    ? '幅÷高さが0.1〜10になる縦横比を指定してください。' : undefined
  const reportLayoutError = useCallback((cause: unknown) => setLayoutError(cause instanceof Error ? cause.message : '表のプレビューを表示できませんでした。'), [])
  const reportLayoutReady = useCallback(() => setLayoutError(''), [])
  const exportImage = image && { ...image, imageLayout, typography }
  const openImage = () => {
    setFeedback(null); setLayoutError('')
    setImage(structuredClone({ ...data, metadata, title: imageTitle ?? getSurtrSkillComparisonTableTitle(metric, displayMode), imageLayout, typography }))
  }
  const copyTable = async () => {
    if (copying) return
    setCopying(true)
    try { await writeClipboardText(tableText); setCopyFeedback({ text: tableText, ok: true }) }
    catch { setCopyFeedback({ text: tableText, ok: false }) }
    finally { setCopying(false) }
  }
  const saveImage = async (filename: string, aspectRatio?: number) => {
    if (!exportImage || saveInProgress.current || layoutError || aspectError) return
    saveInProgress.current = true; setSaving(true); setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveSurtrSkillComparisonTableImage({ snapshot: exportImage, filename, aspectRatio,
        writeBlob: destination.type === 'file' ? destination.write : undefined })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded'); setImage(null)
    } catch { setFeedback('failed') }
    finally { saveInProgress.current = false; setSaving(false) }
  }
  return <section className="surtr-s3-table-section" aria-label="S2・S3比較表">
    <div className="surtr-s3-result-heading"><h3>{displayMode === 'module-winner' ? '最大のMOD' : displayMode === 'skill-winner' ? '最大のスキル' : SURTR_SKILL_COMPARISON_METRIC_LABELS[metric]}</h3>
      <div className="surtr-s3-result-actions"><button type="button" className="button secondary" disabled={copying || !series.length}
        onClick={() => void copyTable()}>{copying ? 'コピー中…' : copyState === true ? 'コピー済み' : copyState === false ? 'コピー失敗' : '表をコピー'}</button>
        <button type="button" className="button secondary" aria-haspopup="dialog" disabled={saving || !series.length || !resistances.length}
          onClick={openImage}>画像を保存</button></div>
    </div>
    <div className="surtr-skill-comparison-toolbar">
      <label>表示する表<select aria-label="表示する表" value={displayMode} onChange={event => setDisplayMode(event.target.value as SurtrSkillComparisonDisplayMode)}>
        <option value="numeric">数値の表</option><option value="module-winner">最大のMOD</option><option value="skill-winner">最大のスキル</option>
      </select></label>
      {!winner && <><label>表示する値<select aria-label="表示する値" value={metric} onChange={event => setMetric(event.target.value as SurtrSkillComparisonMetric)}>
        {(Object.keys(SURTR_SKILL_COMPARISON_METRIC_LABELS) as SurtrSkillComparisonMetric[]).map(value => <option key={value} value={value}>{SURTR_SKILL_COMPARISON_METRIC_LABELS[value]}</option>)}
      </select></label>
      <label>列の並び<select aria-label="列の並び" value={columnOrder} disabled={metric !== 'dps'} onChange={event => setColumnOrder(event.target.value as SurtrSkillComparisonColumnOrder)}>
        <option value="module">MOD別（S2・S3）</option><option value="skill">スキル別（MOD）</option>
      </select></label>
      <label>小数点以下<select aria-label="小数点以下" value={precision} onChange={event => setPrecision(Number(event.target.value))}>
        {[0, 1, 2, 3].map(value => <option key={value} value={value}>{value}桁</option>)}
      </select></label></>}
      <label>術耐性ランク<select aria-label="術耐性ランク" value={rankMode} onChange={event => setRankMode(event.target.value as SurtrSkillComparisonRankMode)}>
        <option value="none">なし</option><option value="merged">同じランクをまとめる</option>
      </select></label>
      {!winner ? <label>カラースケール<select aria-label="カラースケール" value={colorScale} onChange={event => setColorScale(event.target.value as SurtrSkillComparisonTableData['colorScale'])}>
        <option value="none">なし</option><option value="LINEAR">線形</option><option value="SQRT">平方根</option>
      </select></label> : <>
        <label>セルの色<select aria-label="セルの色" value={winnerColor} onChange={event => setWinnerColor(event.target.value as 'category' | 'none')}>
          <option value="category">{displayMode === 'module-winner' ? 'MODの色' : 'スキルの色'}</option><option value="none">なし</option>
        </select></label>
        <label className="surtr-s3-values-toggle"><input type="checkbox" checked={winnerGapShading}
          disabled={winnerColor === 'none' || insufficientCandidates} onChange={event => setWinnerGapShading(event.target.checked)} />差に応じて濃淡を変える</label>
      </>}
    </div>
    <span className="visually-hidden" role="status">{copyState === true ? '比較表をコピーしました。' : copyState === false ? '比較表をコピーできませんでした。' : ''}</span>
    <SurtrSkillComparisonTableContent {...data} onOpenDetail={onOpenDetail} />
    {feedback && feedback !== 'failed' && <p className="surtr-s3-status" role="status">{feedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    {exportImage && <ChartImageSaveDialog initialFilename={getSurtrSkillComparisonTableImageFilename(exportImage)}
      getDefaultFilename={value => getSurtrSkillComparisonTableImageFilename(exportImage, value)}
      aspect={aspect} aspectPresets={['16:9', '9:16']} aspectError={aspectError}
      onAspectChange={value => { setLayoutError(''); setAspect(value) }}
      aspectHint="指定なしでは表の内容に合わせます。比率を指定しても表全体を保存します。" helpMode="popover"
      canChooseLocation={!!picker} saving={saving} saveDisabled={!!layoutError} error={feedback === 'failed'}
      onClose={() => { if (!saveInProgress.current) { setImage(null); setFeedback(null); setLayoutError('') } }}
      onSave={(filename, value) => void saveImage(filename, value)}
      options={<>
        <ComparisonTableImageOptions layout={imageLayout} layouts={[{ value: 'current', label: '現在の配置' },
          { value: 'transpose', label: '術耐性を列に' }, { value: 'stacked', label: exportImage.displayMode === 'module-winner' ? 'スキルごとに上下' : 'MODごとに上下' }]}
          onLayoutChange={value => { setLayoutError(''); setImageLayout(value as SurtrSkillComparisonImageLayout) }}
          numberSize={typography.numberSize} onNumberSizeChange={value => { setLayoutError(''); setTypography(previous => ({ ...previous, numberSize: value })) }}
          titleSize={typography.titleSize} onTitleSizeChange={value => { setLayoutError(''); setTypography(previous => ({ ...previous, titleSize: value })) }}
          detailSize={typography.detailSize} onDetailSizeChange={value => { setLayoutError(''); setTypography(previous => ({ ...previous, detailSize: value })) }} disabled={saving} />
        <div className="chart-image-save-field"><label htmlFor={titleId}>タイトル</label><div className="surtr-skill-comparison-title-controls">
          <input id={titleId} type="text" value={exportImage.title} maxLength={CHART_IMAGE_LABEL_MAX_LENGTH} disabled={saving}
            onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault() }}
            onChange={event => { const title = event.target.value; setImageTitle(title); setImage(previous => previous && { ...previous, title }) }} />
          <button type="button" className="button secondary" disabled={saving || imageTitle === null}
            onClick={() => { setImageTitle(null); setImage(previous => previous && { ...previous, title: getSurtrSkillComparisonTableTitle(previous.metric, previous.displayMode) }) }}>自動に戻す</button>
        </div></div>
      </>}
      preview={<SurtrSkillComparisonTableImagePreview {...exportImage} aspectRatio={aspectError ? undefined : ratio}
        onLayoutError={reportLayoutError} onLayoutReady={reportLayoutReady} />} />}
  </section>
}
