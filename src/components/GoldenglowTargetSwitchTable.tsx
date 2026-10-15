import { GoldenglowTargetSwitchTableContent } from './GoldenglowTargetSwitchTableContent'
export { GoldenglowTargetSwitchTableContent } from './GoldenglowTargetSwitchTableContent'
import { useCallback, useId, useRef, useState } from 'react'
import { getGgTableTargets, getGgTableTitle, getGgTableTsv, getGgTableImageStageLevels, type GgTableData, type GgTableImageLayout } from '../lib/goldenglowTargetSwitchTable'
import { writeClipboardText } from '../lib/clipboard'
import { getChartImageSavePicker, selectChartImageDestination, selectChartArchiveDestination } from '../lib/chartImageDestination'
import { createStoredZipArchive } from '../lib/pngZipArchive'
import { DEFAULT_COMPARISON_TABLE_IMAGE_TYPOGRAPHY } from '../lib/tableImageTypography'
import { CHART_IMAGE_LABEL_MAX_LENGTH } from '../lib/chartImageLabels'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ComparisonTableImageOptions } from './ComparisonTableImageOptions'
import { GoldenglowTargetSwitchTableImagePreview, getGoldenglowTargetSwitchTableImageFilename, getGoldenglowTargetSwitchTableImageStageSnapshot, saveGoldenglowTargetSwitchTableImage, type GoldenglowTargetSwitchTableImageSnapshot } from './GoldenglowTargetSwitchTableImage'
import './GoldenglowTargetSwitchTable.css'

export function getGoldenglowTargetSwitchTableComparisonLabel(data: GgTableData): string {
  if (data.layout === 'winner') return '総ダメージ期待値が最大のMOD'
  if (data.layout === 'total') return '総ダメージ期待値'
  const baselineLabel = data.baseline.kind === 'previous' ? '1つ前の段階（Lv.1は未装備）'
    : data.baseline.kind === 'selected' ? data.builds.find(build => build.id === data.baseline.id)?.label
      ?? data.series.find(series => series.id === data.baseline.id)?.label ?? '指定MOD' : '未装備'
  return data.metric === 'difference' ? `${baselineLabel}との総ダメージ差`
    : data.metric === 'ratio' ? `基準比（${baselineLabel}＝100%）` : `${baselineLabel}からの増加率（%）`
}

export function GoldenglowTargetSwitchTable({ data, conditions, disabled = false }: {
  data: GgTableData
  conditions: string
  disabled?: boolean
}) {
  const headingId = useId()
  const titleId = useId()
  const text = getGgTableTsv(data)
  const hasTargets = getGgTableTargets(data).length > 0 && data.hps.length > 0 && data.resistances.length > 0
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; ok: boolean } | null>(null)
  const [copying, setCopying] = useState(false)
  const copyState = copyFeedback?.text === text ? copyFeedback.ok : null
  const [image, setImage] = useState<GoldenglowTargetSwitchTableImageSnapshot | null>(null)
  const [manualTitle, setManualTitle] = useState<string | null>(null)
  const [imageLayout, setImageLayout] = useState<GgTableImageLayout>('current')
  const [typography, setTypography] = useState(DEFAULT_COMPARISON_TABLE_IMAGE_TYPOGRAPHY)
  const [moduleLevel, setModuleLevel] = useState(3)
  const [saveProgress, setSaveProgress] = useState('')
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [feedback, setFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const [layoutError, setLayoutError] = useState('')
  const picker = getChartImageSavePicker()
  const aspectRatio = aspect.preset !== 'auto' && [aspect.width, aspect.height].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(aspect.width) / Number(aspect.height) : undefined
  const aspectError = aspectRatio !== undefined && (aspectRatio < 0.1 || aspectRatio > 10)
    ? '幅÷高さが0.1〜10になる縦横比を指定してください。' : undefined
  const reportLayoutError = useCallback((cause: unknown) => setLayoutError(cause instanceof Error ? cause.message : '表のプレビューを表示できませんでした。'), [])
  const reportLayoutReady = useCallback(() => setLayoutError(''), [])
  const stageLevels = image ? getGgTableImageStageLevels(image.data) : []
  const selectedLevel = stageLevels.includes(moduleLevel) ? moduleLevel : stageLevels.at(-1)
  const exportLayout = imageLayout === 'split' && !stageLevels.length ? 'current' : imageLayout
  const exportSource = image && { ...image, imageLayout: exportLayout, typography }
  const exportImage = exportSource && (exportLayout === 'split' && selectedLevel !== undefined
    ? getGoldenglowTargetSwitchTableImageStageSnapshot(exportSource, selectedLevel) : exportSource)
  const copyTable = async () => {
    if (copying || disabled || !hasTargets) return
    setCopying(true)
    try { await writeClipboardText(text); setCopyFeedback({ text, ok: true }) }
    catch { setCopyFeedback({ text, ok: false }) }
    finally { setCopying(false) }
  }
  const openImage = () => {
    setFeedback(null); setLayoutError('')
    setImage(structuredClone({ data, conditions, title: manualTitle ?? getGgTableTitle(data) }))
  }
  const saveImage = async (filename: string, ratio?: number) => {
    if (!exportImage || savingRef.current || layoutError || aspectError) return
    savingRef.current = true; setSaving(true); setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveGoldenglowTargetSwitchTableImage({ snapshot: exportImage, filename, aspectRatio: ratio,
        writeBlob: destination.type === 'file' ? destination.write : undefined })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded'); setImage(null)
    } catch { setFeedback('failed') }
    finally { savingRef.current = false; setSaving(false) }
  }
  const saveAllStages = async (filename: string, ratio?: number) => {
    if (!exportSource || !exportImage || !stageLevels.length || savingRef.current || layoutError || aspectError) return
    savingRef.current = true; setSaving(true); setFeedback(null)
    const archiveName = (filename === getGoldenglowTargetSwitchTableImageFilename(exportImage, ratio)
      ? getGoldenglowTargetSwitchTableImageFilename({ ...exportSource, moduleLevel: undefined }, ratio) : filename).replace(/\.(png|zip)$/i, '') + '.zip'
    try {
      const destination = await selectChartArchiveDestination(archiveName, picker)
      if (destination.type === 'cancelled') return
      const files: { name: string; blob: Blob }[] = []
      for (const [index, level] of stageLevels.entries()) {
        setSaveProgress(`PNG ${index + 1}/${stageLevels.length}を作成中…`)
        const snapshot = getGoldenglowTargetSwitchTableImageStageSnapshot(exportSource, level)
        const name = getGoldenglowTargetSwitchTableImageFilename(snapshot, ratio)
        await saveGoldenglowTargetSwitchTableImage({ snapshot, filename: name, aspectRatio: ratio,
          writeBlob: async blob => { files.push({ name, blob }) } })
      }
      setSaveProgress('ZIPを作成中…')
      const archive = await createStoredZipArchive(files)
      if (destination.type === 'file') await destination.write(archive)
      else {
        const url = URL.createObjectURL(archive)
        const link = document.createElement('a')
        link.href = url; link.download = archiveName; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded'); setImage(null)
    } catch { setFeedback('failed') }
    finally { savingRef.current = false; setSaving(false); setSaveProgress('') }
  }
  return <section className="gg-switch-table-section" aria-labelledby={headingId}>
    <div className="gg-switch-table-heading"><h3 id={headingId}>{getGoldenglowTargetSwitchTableComparisonLabel(data)}</h3>
      <div className="gg-switch-table-actions">
        <button type="button" className="button secondary" disabled={disabled || !hasTargets || copying} onClick={() => void copyTable()}>
          {copying ? 'コピー中…' : copyState === true ? 'コピー済み' : copyState === false ? 'コピー失敗' : '表をコピー'}
        </button>
        <button type="button" className="button secondary" aria-haspopup="dialog" disabled={disabled || !hasTargets || saving} onClick={openImage}>画像を保存</button>
      </div>
    </div>
    <span className="visually-hidden" role="status">{copyState === true ? '比較表をコピーしました。' : copyState === false ? '比較表をコピーできませんでした。' : ''}</span>
    {hasTargets ? <GoldenglowTargetSwitchTableContent data={data} /> : <p className="gg-switch-table-status" role="status">比較するMODを選択するか、総ダメージ表示に変更してください。</p>}
    {feedback && feedback !== 'failed' && <p className="gg-switch-table-status" role="status">{feedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    {image && exportImage && <ChartImageSaveDialog initialFilename={getGoldenglowTargetSwitchTableImageFilename(exportImage)}
      getDefaultFilename={ratio => getGoldenglowTargetSwitchTableImageFilename(exportImage, ratio)} aspect={aspect}
      onAspectChange={value => { setLayoutError(''); setAspect(value) }} aspectError={aspectError} helpMode="popover"
      aspectHint="指定なしでは表の内容に合わせます。比率を指定しても表全体を保存します。"
      canChooseLocation={!!picker} saving={saving} saveDisabled={!!layoutError} error={feedback === 'failed'}
      onClose={() => { if (!savingRef.current) { setImage(null); setFeedback(null); setLayoutError('') } }}
      onSave={(filename, ratio) => void saveImage(filename, ratio)}
      additionalSaveAction={exportLayout === 'split' && stageLevels.length > 1
        ? { label: `全${stageLevels.length}枚をZIP保存`, onSave: (filename, ratio) => void saveAllStages(filename, ratio) } : undefined}
      options={<><ComparisonTableImageOptions layout={imageLayout} onLayoutChange={value => { setLayoutError(''); setImageLayout(value as GgTableImageLayout) }}
        layouts={[{ value: 'current', label: '現在の配置' }, { value: 'transpose', label: '術耐性を列に' },
          { value: 'stacked', label: 'HPごとに上下に' }, { value: 'split', label: '段階ごとに分割', disabled: !stageLevels.length }]}
        numberSize={typography.numberSize} onNumberSizeChange={numberSize => { setLayoutError(''); setTypography(previous => ({ ...previous, numberSize })) }}
        titleSize={typography.titleSize} onTitleSizeChange={titleSize => { setLayoutError(''); setTypography(previous => ({ ...previous, titleSize })) }}
        detailSize={typography.detailSize} onDetailSizeChange={detailSize => { setLayoutError(''); setTypography(previous => ({ ...previous, detailSize })) }} disabled={saving} />
      {exportLayout === 'split' && <label className="chart-image-save-field"><span>出力する段階</span>
        <select aria-label="出力する段階" value={selectedLevel} disabled={saving} onChange={event => { setLayoutError(''); setModuleLevel(Number(event.target.value)) }}>
          {stageLevels.map(level => <option key={level} value={level}>Lv.{level}</option>)}</select></label>}
      <div className="chart-image-save-field">
        <div className="gg-switch-table-title-heading"><label htmlFor={titleId}>タイトル</label><span>{manualTitle === null ? '自動' : '手動'}</span></div>
        <div className="gg-switch-table-title-controls">
          <input id={titleId} type="text" value={image.title ?? getGgTableTitle(image.data)} disabled={saving} maxLength={CHART_IMAGE_LABEL_MAX_LENGTH}
            autoComplete="off" onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault() }}
            onChange={event => { const title = event.target.value; setLayoutError(''); setManualTitle(title); setImage(current => current && { ...current, title }) }} />
          <button type="button" className="button secondary" disabled={saving || manualTitle === null} onClick={() => {
            setLayoutError(''); setManualTitle(null); setImage(current => current && { ...current, title: getGgTableTitle(current.data) })
          }}>自動に戻す</button>
        </div>
      </div>{saveProgress && <p className="chart-image-save-hint" role="status">{saveProgress}</p>}</>}
      preview={<GoldenglowTargetSwitchTableImagePreview key={`${image.title}:${exportLayout}:${selectedLevel}:${JSON.stringify(typography)}:${aspect.preset}:${aspect.width}:${aspect.height}`}
        {...exportImage} aspectRatio={aspectError ? undefined : aspectRatio} onLayoutError={reportLayoutError} onLayoutReady={reportLayoutReady} />} />}
  </section>
}
