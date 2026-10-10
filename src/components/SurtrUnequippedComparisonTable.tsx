import { useCallback, useId, useRef, useState } from 'react'
import { getSurtrComparisonBaseLabel, getSurtrUnequippedComparisonTsv, type SurtrUnequippedMetric } from '../lib/surtrUnequippedComparison'
import { writeClipboardText } from '../lib/clipboard'
import { getChartImageSavePicker, selectChartArchiveDestination, selectChartImageDestination } from '../lib/chartImageDestination'
import { createStoredZipArchive } from '../lib/pngZipArchive'
import { getSurtrComparisonImageStageLevels, getSurtrComparisonImageStageSnapshot, type SurtrComparisonImageLayout } from '../lib/surtrComparisonImageLayout'
import type { SurtrComparisonImageNumberSize } from '../lib/surtrComparisonImageNumberSize'
import { getSurtrUnequippedTableImageFilename, type SurtrUnequippedTableImageMetadata } from '../lib/surtrUnequippedTableImageFilename'
import { CHART_IMAGE_LABEL_MAX_LENGTH } from '../lib/chartImageLabels'
import { getSurtrComparisonTableTitle } from '../lib/surtrComparisonTableTitle'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { getUnequippedMetricLabel, SurtrUnequippedComparisonTableContent, type SurtrUnequippedComparisonTableData } from './SurtrUnequippedComparisonTableContent'
import { SurtrUnequippedComparisonTableImagePreview, saveSurtrUnequippedComparisonTableImage,
  type SurtrUnequippedComparisonTableImageSnapshot } from './SurtrUnequippedComparisonTableImage'
import './SurtrComparisonImageOptions.css'

export function SurtrUnequippedComparisonTable({ selectedResistance, onOpenDetail, metadata, enableImageLayouts = false, ...data }: SurtrUnequippedComparisonTableData & {
  metadata: SurtrUnequippedTableImageMetadata
  selectedResistance: number | null
  enableImageLayouts?: boolean
  onOpenDetail: (resistance: number, seriesId: string | undefined, metric: SurtrUnequippedMetric | 'total', blocking?: boolean) => void
}) {
  const baseLabel = getSurtrComparisonBaseLabel(data.comparisonBase ?? 'unequipped')
  const metricLabel = getUnequippedMetricLabel(data.metric, data.comparisonBase, data.quantity)
  const tableText = getSurtrUnequippedComparisonTsv(data.series, data.baseline, data.resistances, data.precision, data.metric, data.layout, data.blockingComparison, data.rankMode, data.columnOrder, data.comparisonBase, data.referenceSeries, data.quantity)
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; ok: boolean } | null>(null)
  const [copying, setCopying] = useState(false)
  const copyState = copyFeedback?.text === tableText ? copyFeedback.ok : null
  const copyTable = async () => {
    if (copying) return
    setCopying(true)
    try { await writeClipboardText(tableText); setCopyFeedback({ text: tableText, ok: true }) }
    catch { setCopyFeedback({ text: tableText, ok: false }) }
    finally { setCopying(false) }
  }
  const [image, setImage] = useState<SurtrUnequippedComparisonTableImageSnapshot | null>(null)
  const [imageTitle, setImageTitle] = useState<string | null>(null)
  const imageTitleId = useId()
  const [imageLayout, setImageLayout] = useState<SurtrComparisonImageLayout>('current')
  const [numberSize, setNumberSize] = useState<SurtrComparisonImageNumberSize>('auto')
  const [moduleLevel, setModuleLevel] = useState(3)
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState('')
  const [feedback, setFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const [layoutError, setLayoutError] = useState('')
  const saveInProgress = useRef(false)
  const picker = getChartImageSavePicker()
  const aspectRatio = aspect.preset !== 'auto' && [aspect.width, aspect.height].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(aspect.width) / Number(aspect.height) : undefined
  const aspectError = aspectRatio !== undefined && (aspectRatio < 0.1 || aspectRatio > 10)
    ? '幅÷高さが0.1〜10になる縦横比を指定してください。' : undefined
  const reportLayoutError = useCallback((cause: unknown) => {
    setLayoutError(cause instanceof Error ? cause.message : '表のプレビューを表示できませんでした。')
  }, [])
  const reportLayoutReady = useCallback(() => setLayoutError(''), [])
  const stageLevels = image ? getSurtrComparisonImageStageLevels(image) : []
  const selectedLevel = stageLevels.includes(moduleLevel) ? moduleLevel : stageLevels.at(-1)
  const exportLayout = enableImageLayouts ? imageLayout : 'current'
  const exportSource = image && { ...image, numberSize: enableImageLayouts ? numberSize : undefined }
  const exportImage = exportSource && (exportLayout === 'split' && selectedLevel !== undefined
    ? getSurtrComparisonImageStageSnapshot(exportSource, selectedLevel)
    : { ...exportSource, imageLayout: exportLayout, moduleLevel: undefined })
  const openImage = () => {
    setFeedback(null); setLayoutError('')
    if (imageLayout === 'split' && !getSurtrComparisonImageStageLevels(data).length) setImageLayout('current')
    setImage(structuredClone({ ...data, metadata, title: data.quantity === 'expected-damage'
      ? undefined : imageTitle ?? getSurtrComparisonTableTitle(data) }))
  }
  const saveImage = async (filename: string, ratio?: number) => {
    if (!exportImage || saveInProgress.current || layoutError || aspectError) return
    saveInProgress.current = true; setSaving(true); setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveSurtrUnequippedComparisonTableImage({ snapshot: exportImage, filename, aspectRatio: ratio,
        writeBlob: destination.type === 'file' ? destination.write : undefined })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded'); setImage(null)
    } catch { setFeedback('failed') }
    finally { saveInProgress.current = false; setSaving(false) }
  }
  const saveAllStages = async (filename: string, ratio?: number) => {
    if (!exportSource || !exportImage || !stageLevels.length || saveInProgress.current || layoutError || aspectError) return
    saveInProgress.current = true; setSaving(true); setFeedback(null)
    // Preserve an edited name; automatic ZIP names describe all selected stages.
    const archiveName = (filename === getSurtrUnequippedTableImageFilename(exportImage, ratio)
      ? getSurtrUnequippedTableImageFilename({ ...exportSource, imageLayout: 'split' }, ratio)
      : filename).replace(/\.(png|zip)$/i, '') + '.zip'
    try {
      const destination = await selectChartArchiveDestination(archiveName, picker)
      if (destination.type === 'cancelled') return
      const files: { name: string; blob: Blob }[] = []
      for (const [index, level] of stageLevels.entries()) {
        setSaveProgress(`PNG ${index + 1}/${stageLevels.length}を作成中…`)
        const snapshot = getSurtrComparisonImageStageSnapshot(exportSource, level)
        const name = getSurtrUnequippedTableImageFilename(snapshot, ratio)
        await saveSurtrUnequippedComparisonTableImage({ snapshot, filename: name, aspectRatio: ratio,
          writeBlob: async blob => { files.push({ name, blob }) } })
      }
      setSaveProgress('ZIPを作成中…')
      const archive = await createStoredZipArchive(files)
      if (destination.type === 'file') await destination.write(archive)
      else downloadArchive(archive, archiveName)
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded'); setImage(null)
    } catch { setFeedback('failed') }
    finally { saveInProgress.current = false; setSaving(false); setSaveProgress('') }
  }

  return <section className="surtr-s3-table-section" aria-labelledby="surtr-s3-unequipped-table-title">
    <div className="surtr-s3-result-heading"><h3 id="surtr-s3-unequipped-table-title">{metricLabel}</h3>
      <div className="surtr-s3-result-actions">
        <button type="button" className="button secondary" aria-label={`${baseLabel}との比較表をコピー`} disabled={copying} onClick={() => void copyTable()}>
          {copying ? 'コピー中…' : copyState === true ? 'コピー済み' : copyState === false ? 'コピー失敗' : '表をコピー'}
        </button>
        <button type="button" className="button secondary" aria-label={`${baseLabel}との比較表を画像として保存`} aria-haspopup="dialog" disabled={saving} onClick={openImage}>画像を保存</button>
      </div>
    </div>
    <span className="visually-hidden" role="status">{copyState === true ? `${baseLabel}との比較表をコピーしました。` : copyState === false ? `${baseLabel}との比較表をコピーできませんでした。` : ''}</span>
    <SurtrUnequippedComparisonTableContent {...data} selectedResistance={selectedResistance} onOpenDetail={onOpenDetail} />
    {feedback && feedback !== 'failed' && <p className="surtr-s3-status" role="status">{feedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    {image && exportImage && <ChartImageSaveDialog initialFilename={getSurtrUnequippedTableImageFilename(exportImage)}
      getDefaultFilename={ratio => getSurtrUnequippedTableImageFilename(exportImage, ratio)} aspect={aspect}
      onAspectChange={value => { setLayoutError(''); setAspect(value) }} aspectError={aspectError} helpMode="popover"
      aspectHint="指定なしでは表の内容に合わせます。比率を指定しても表全体を保存します。"
      canChooseLocation={!!picker} saving={saving} saveDisabled={!!layoutError} error={feedback === 'failed'}
      onClose={() => { if (!saveInProgress.current) { setImage(null); setFeedback(null); setLayoutError('') } }} onSave={(filename, ratio) => void saveImage(filename, ratio)}
      additionalSaveAction={exportLayout === 'split' && stageLevels.length > 1
        ? { label: `全${stageLevels.length}枚をZIP保存`, onSave: (filename, ratio) => void saveAllStages(filename, ratio) } : undefined}
      options={<>
      {enableImageLayouts && <div className="surtr-comparison-image-options">
        <label className="chart-image-save-field"><span>画像の配置</span>
          <select value={imageLayout} disabled={saving} onChange={event => {
            setLayoutError(''); setImageLayout(event.target.value as SurtrComparisonImageLayout)
          }}>
            <option value="current">現在の配置</option>
            <option value="transpose">術耐性を列に</option>
            <option value="stacked" disabled={image.blockingComparison === undefined}>ブロック条件を上下に</option>
            <option value="split" disabled={!stageLevels.length}>段階ごとに分割</option>
          </select>
        </label>
        <label className="chart-image-save-field"><span>数値サイズ</span>
          <select value={numberSize} disabled={saving} onChange={event => {
            setLayoutError(''); setNumberSize(event.target.value as SurtrComparisonImageNumberSize)
          }}>
            <option value="auto">自動</option>
            <option value="100">100%</option>
            <option value="150">150%</option>
            <option value="200">200%</option>
          </select>
        </label>
        <p className="chart-image-save-hint">セル内に収まる範囲で数値を大きくします。自動では最大200%まで調整します。</p>
        {exportLayout === 'split' && <>
          <label className="chart-image-save-field"><span>出力する段階</span>
            <select value={selectedLevel} disabled={saving} onChange={event => {
              setLayoutError(''); setModuleLevel(Number(event.target.value))
            }}>{stageLevels.map(level => <option key={level} value={level}>Lv.{level}</option>)}</select>
          </label>
          <p className="chart-image-save-hint">選んだ段階をPNG保存できます。複数段階を選択している場合は、すべてのPNGをZIPにまとめて保存できます。</p>
        </>}
      </div>}
      {image.quantity !== 'expected-damage' && <div className="chart-image-save-field">
        <div className="surtr-comparison-image-title-heading">
          <label htmlFor={imageTitleId}>タイトル</label>
          <span aria-live="polite">{imageTitle === null ? '自動' : '手動'}</span>
        </div>
        <div className="surtr-comparison-image-title-controls">
        <input id={imageTitleId} type="text" value={image.title ?? getSurtrComparisonTableTitle(image)} disabled={saving}
          maxLength={CHART_IMAGE_LABEL_MAX_LENGTH} autoComplete="off"
          onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault() }}
          onChange={event => {
            const title = event.target.value
            setLayoutError('')
            setImageTitle(title); setImage(current => current && { ...current, title })
          }} />
        <button type="button" className="button secondary" aria-label="タイトルを自動に戻す"
          disabled={saving || imageTitle === null} onClick={() => {
            setLayoutError(''); setImageTitle(null)
            setImage(current => current && { ...current, title: getSurtrComparisonTableTitle(current) })
          }}>自動に戻す</button>
        </div>
      </div>}
      {saveProgress && <p className="chart-image-save-hint" role="status">{saveProgress}</p>}
      </>}
      preview={<SurtrUnequippedComparisonTableImagePreview key={`${exportLayout}:${selectedLevel}:${numberSize}:${image.title}:${aspect.preset}:${aspect.width}:${aspect.height}`} {...exportImage}
        aspectRatio={aspectError ? undefined : aspectRatio} onLayoutError={reportLayoutError} onLayoutReady={reportLayoutReady} />} />}
  </section>
}

function downloadArchive(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; anchor.hidden = true
  document.body.append(anchor)
  try { anchor.click() } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
