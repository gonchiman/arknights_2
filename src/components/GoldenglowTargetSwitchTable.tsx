import { Fragment, useCallback, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { buildGgTableRows, formatGgTableValue, getGgTableTargets, getGgTableTitle, getGgTableTsv, type GgTableData } from '../lib/goldenglowTargetSwitchTable'
import { getEnemyStatRating } from '../lib/enemyStatRatings'
import { getModuleComparisonColors } from '../lib/moduleColors'
import { getSurtrUnequippedColorScaleBackground, getSurtrUnequippedColorScaleMaximum } from '../lib/surtrUnequippedColorScale'
import { writeClipboardText } from '../lib/clipboard'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { CHART_IMAGE_LABEL_MAX_LENGTH } from '../lib/chartImageLabels'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { GoldenglowTargetSwitchTableImagePreview, getGoldenglowTargetSwitchTableImageFilename, saveGoldenglowTargetSwitchTableImage, type GoldenglowTargetSwitchTableImageSnapshot } from './GoldenglowTargetSwitchTableImage'
import './GoldenglowTargetSwitchTable.css'

export function getGoldenglowTargetSwitchTableComparisonLabel(data: GgTableData): string {
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
    if (!image || savingRef.current || layoutError || aspectError) return
    savingRef.current = true; setSaving(true); setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveGoldenglowTargetSwitchTableImage({ snapshot: image, filename, aspectRatio: ratio,
        writeBlob: destination.type === 'file' ? destination.write : undefined })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded'); setImage(null)
    } catch { setFeedback('failed') }
    finally { savingRef.current = false; setSaving(false) }
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
    {image && <ChartImageSaveDialog initialFilename={getGoldenglowTargetSwitchTableImageFilename(image)}
      getDefaultFilename={ratio => getGoldenglowTargetSwitchTableImageFilename(image, ratio)} aspect={aspect}
      onAspectChange={value => { setLayoutError(''); setAspect(value) }} aspectError={aspectError} helpMode="popover"
      aspectHint="指定なしでは表の内容に合わせます。比率を指定しても表全体を保存します。"
      canChooseLocation={!!picker} saving={saving} saveDisabled={!!layoutError} error={feedback === 'failed'}
      onClose={() => { if (!savingRef.current) { setImage(null); setFeedback(null); setLayoutError('') } }}
      onSave={(filename, ratio) => void saveImage(filename, ratio)}
      options={<div className="chart-image-save-field">
        <div className="gg-switch-table-title-heading"><label htmlFor={titleId}>タイトル</label><span>{manualTitle === null ? '自動' : '手動'}</span></div>
        <div className="gg-switch-table-title-controls">
          <input id={titleId} type="text" value={image.title ?? getGgTableTitle(image.data)} disabled={saving} maxLength={CHART_IMAGE_LABEL_MAX_LENGTH}
            autoComplete="off" onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault() }}
            onChange={event => { const title = event.target.value; setLayoutError(''); setManualTitle(title); setImage(current => current && { ...current, title }) }} />
          <button type="button" className="button secondary" disabled={saving || manualTitle === null} onClick={() => {
            setLayoutError(''); setManualTitle(null); setImage(current => current && { ...current, title: getGgTableTitle(current.data) })
          }}>自動に戻す</button>
        </div>
      </div>}
      preview={<GoldenglowTargetSwitchTableImagePreview key={`${image.title}:${aspect.preset}:${aspect.width}:${aspect.height}`}
        {...image} aspectRatio={aspectError ? undefined : aspectRatio} onLayoutError={reportLayoutError} onLayoutReady={reportLayoutReady} />} />}
  </section>
}

/** Shared content keeps the on-page table, preview and saved PNG identical. */
export function GoldenglowTargetSwitchTableContent({ data, title, footer }: { data: GgTableData; title?: string; footer?: ReactNode }) {
  const targets = useMemo(() => getGgTableTargets(data), [data])
  const rows = useMemo(() => buildGgTableRows(data), [data])
  const colors = useMemo(() => {
    const palette = getModuleComparisonColors(data.builds, { shadeBy: 'moduleLevel' })
    return new Map(data.builds.map((build, index) => [build.id, palette[index]]))
  }, [data.builds])
  const combined = data.layout === 'combined'
  const columnsFor = (build: (typeof targets)[number]) => combined && build.id !== 'none' ? 2 : 1
  const hpColumns = targets.reduce((count, build) => count + columnsFor(build), 0)
  const columns = (data.showRanks ? 2 : 1) + data.hps.length * hpColumns
  const headerRows = 2 + (data.showRanks ? 1 : 0) + (combined ? 1 : 0)
  const maximum = useMemo(() => getSurtrUnequippedColorScaleMaximum(rows.flatMap(row => row.cells.map(cell => cell.comparison)), data.metric), [rows, data.metric])
  const metricLabel = data.metric === 'difference' ? '総ダメージ差' : data.metric === 'ratio' ? '基準比（%）' : '増加率（%）'
  const style = { '--gg-switch-table-min-width': `${(data.showRanks ? 126 : 76) + data.hps.length * hpColumns * 100}px` } as CSSProperties
  return <div className="gg-switch-table-wrap"><table className="gg-switch-table-content" style={style} aria-label={getGgTableTitle(data)}>
    <colgroup>{data.showRanks && <col className="gg-switch-table-rank-column" />}<col className="gg-switch-table-resistance-column" /></colgroup>
    {data.hps.map(hp => <colgroup key={hp}>{targets.flatMap(build => Array.from({ length: columnsFor(build) }, (_, index) => <col key={`${build.id}:${index}`} />))}</colgroup>)}
    <thead>
      {title !== undefined && <tr className="gg-switch-table-image-title-row"><th colSpan={columns}>{title}</th></tr>}
      <tr>{data.showRanks && <th scope="col" rowSpan={headerRows} className="gg-switch-table-rank-cell">術耐性<br />ランク</th>}
        <th scope="col" rowSpan={headerRows}>術耐性</th>
        {data.hps.map(hp => <th key={hp} scope="colgroup" colSpan={hpColumns}>{data.showRanks ? <span title={`HPランク ${getEnemyStatRating('maxHp', hp) ?? '不明'}`}>HPランク {getEnemyStatRating('maxHp', hp) ?? '—'}</span> : `敵HP ${hp.toLocaleString('ja-JP')}`}</th>)}
      </tr>
      {data.showRanks && <tr>{data.hps.map(hp => <th key={hp} scope="colgroup" colSpan={hpColumns}>敵HP {hp.toLocaleString('ja-JP')}</th>)}</tr>}
      <tr>{data.hps.flatMap(hp => targets.map(build => <th key={`${hp}:${build.id}`} scope={columnsFor(build) > 1 ? 'colgroup' : 'col'} colSpan={columnsFor(build)} rowSpan={combined && build.id === 'none' ? 2 : 1}>
        <span className="gg-switch-table-module-label"><i aria-hidden="true" style={{ backgroundColor: colors.get(build.id) }} />{build.label}</span>
      </th>))}</tr>
      {combined && <tr>{data.hps.flatMap(hp => targets.filter(build => build.id !== 'none').map(build => <Fragment key={`${hp}:${build.id}`}><th scope="col">総ダメージ</th><th scope="col">{metricLabel}</th></Fragment>))}</tr>}
    </thead>
    <tbody>{rows.map(row => <tr key={row.resistance}>
      {data.showRanks && <th scope="row" className="gg-switch-table-rank-cell" title={row.rank?.label}>{row.rank?.rating ?? '—'}</th>}
      <th scope="row">{row.resistance}</th>
      {row.cells.map(cell => {
        const build = targets.find(target => target.id === cell.buildId)
        const rawOnly = data.layout === 'total' || combined && build?.id === 'none'
        const background = data.colorScale !== 'NONE' && !rawOnly
          ? getSurtrUnequippedColorScaleBackground(cell.comparison, data.metric, maximum, data.colorScale) : undefined
        return <Fragment key={`${cell.hp}:${cell.buildId}`}>
          {combined && !rawOnly && <td data-build-id={cell.buildId} data-hp={cell.hp} data-metric="total">{formatGgTableValue(cell.total, 'total', data.precision)}</td>}
          <td data-build-id={cell.buildId} data-hp={cell.hp} data-metric={rawOnly ? 'total' : data.metric}
            style={background ? { backgroundColor: background } : undefined}>{formatGgTableValue(rawOnly ? cell.total : cell.comparison, rawOnly ? 'total' : data.metric, data.precision)}</td>
        </Fragment>
      })}
    </tr>)}</tbody>
    {footer && <tfoot><tr><td colSpan={columns}>{footer}</td></tr></tfoot>}
  </table></div>
}
