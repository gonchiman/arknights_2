import { useCallback, useRef, useState } from 'react'
import { getSurtrUnequippedComparisonTsv, type SurtrUnequippedMetric } from '../lib/surtrUnequippedComparison'
import { writeClipboardText } from '../lib/clipboard'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { getSurtrUnequippedTableImageFilename, type SurtrUnequippedTableImageMetadata } from '../lib/surtrUnequippedTableImageFilename'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { getUnequippedMetricLabel, SurtrUnequippedComparisonTableContent, type SurtrUnequippedComparisonTableData } from './SurtrUnequippedComparisonTableContent'
import { SurtrUnequippedComparisonTableImagePreview, saveSurtrUnequippedComparisonTableImage,
  type SurtrUnequippedComparisonTableImageSnapshot } from './SurtrUnequippedComparisonTableImage'

export function SurtrUnequippedComparisonTable({ selectedResistance, onOpenDetail, metadata, ...data }: SurtrUnequippedComparisonTableData & {
  metadata: SurtrUnequippedTableImageMetadata
  selectedResistance: number | null
  onOpenDetail: (resistance: number, seriesId: string | undefined, metric: SurtrUnequippedMetric | 'total', blocking?: boolean) => void
}) {
  const baseLabel = data.comparisonBase === 'previous' ? '前段階' : '未装備'
  const metricLabel = getUnequippedMetricLabel(data.metric, data.comparisonBase)
  const tableText = getSurtrUnequippedComparisonTsv(data.series, data.baseline, data.resistances, data.precision, data.metric, data.layout, data.blockingComparison, data.rankMode, data.columnOrder, data.comparisonBase, data.referenceSeries)
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
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
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
  const openImage = () => {
    setFeedback(null); setLayoutError('')
    setImage(structuredClone({ ...data, metadata }))
  }
  const saveImage = async (filename: string, ratio?: number) => {
    if (!image || saveInProgress.current || layoutError || aspectError) return
    saveInProgress.current = true; setSaving(true); setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveSurtrUnequippedComparisonTableImage({ snapshot: image, filename, aspectRatio: ratio,
        writeBlob: destination.type === 'file' ? destination.write : undefined })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded'); setImage(null)
    } catch { setFeedback('failed') }
    finally { saveInProgress.current = false; setSaving(false) }
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
    {image && <ChartImageSaveDialog initialFilename={getSurtrUnequippedTableImageFilename(image)}
      getDefaultFilename={ratio => getSurtrUnequippedTableImageFilename(image, ratio)} aspect={aspect}
      onAspectChange={value => { setLayoutError(''); setAspect(value) }} aspectError={aspectError} helpMode="popover"
      aspectHint="指定なしでは表の内容に合わせます。比率を指定しても表全体を保存します。"
      canChooseLocation={!!picker} saving={saving} saveDisabled={!!layoutError} error={feedback === 'failed'}
      onClose={() => { if (!saveInProgress.current) { setImage(null); setFeedback(null); setLayoutError('') } }} onSave={(filename, ratio) => void saveImage(filename, ratio)}
      preview={<SurtrUnequippedComparisonTableImagePreview key={`${aspect.preset}:${aspect.width}:${aspect.height}`} {...image}
        aspectRatio={aspectError ? undefined : aspectRatio} onLayoutError={reportLayoutError} onLayoutReady={reportLayoutReady} />} />}
  </section>
}
