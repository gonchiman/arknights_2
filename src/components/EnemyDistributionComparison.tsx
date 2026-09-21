import { useMemo, useRef, useState } from 'react'
import type { EnemyRecord } from '../types/enemy'
import { buildEnemyComparisonDistribution, createEnemyComparisonConditions, type EnemyComparisonYAxis } from '../lib/enemyDistributionComparison'
import { MAX_CUSTOM_LINEAR_BIN_COUNT, validateCustomLinearBinWidth, type HistogramScale } from '../lib/enemyStatistics'
import { EnemyComparisonConditions } from './EnemyComparisonConditions'
import { EnemyComparisonFigure, EnemyComparisonImage, EnemyComparisonImagePreview, type EnemyComparisonMetric, type EnemyComparisonSnapshot } from './EnemyComparisonChart'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { EnemyHistogramOverflowHelp } from './EnemyHistogramOverflowHelp'
import { getEnemyChartImageFilename, getEnemyChartImageLayout } from '../lib/enemyChartImage'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './EnemyDistributionComparison.css'

export function EnemyDistributionComparison({ rows, metric, active }: {
  rows: readonly EnemyRecord[]; metric: EnemyComparisonMetric; active: boolean
}) {
  const [conditions, setConditions] = useState(createEnemyComparisonConditions)
  const [scale, setScale] = useState<HistogramScale>('LINEAR')
  const [yAxis, setYAxis] = useState<EnemyComparisonYAxis>('PERCENT')
  const emptySettings = { metricKey: metric.key, width: '', upper: '', badWidth: false, badUpper: false }
  const [settings, setSettings] = useState(emptySettings)
  const [imageData, setImageData] = useState<EnemyComparisonSnapshot | null>(null)
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const savingRef = useRef(false)
  // Values with different units must not inherit the previous metric's bin settings.
  if (settings.metricKey !== metric.key) setSettings(emptySettings)
  const widthInput = settings.metricKey === metric.key ? settings.width : ''
  const upperInput = settings.metricKey === metric.key ? settings.upper : ''
  const options = { scale, preferredBinCount: metric.logBinCount, minimumLinearBinWidth: metric.minimumLinearBinWidth }
  const automatic = useMemo(() => buildEnemyComparisonDistribution(rows, conditions, metric.key, {
    scale: 'LINEAR', preferredBinCount: metric.logBinCount, minimumLinearBinWidth: metric.minimumLinearBinWidth,
  }), [rows, conditions, metric.key, metric.logBinCount, metric.minimumLinearBinWidth])
  const width = widthInput.trim() ? Number(widthInput) : null
  const upper = upperInput.trim() ? Number(upperInput) : null
  const autoWidth = automatic.histogram?.binWidth ?? metric.minimumLinearBinWidth
  const effectiveUpper = upper ?? (automatic.histogram?.hasOverflow
    ? automatic.histogram.normalRangeEnd : automatic.observedMaximum ?? 0)
  const validation = validateCustomLinearBinWidth(width ?? autoWidth, effectiveUpper)
  const badUpper = settings.badUpper || (upper !== null && (!Number.isFinite(upper) || upper <= 0))
  const badWidth = settings.badWidth || (width !== null && (!Number.isFinite(width) || width <= 0))
  const rangeOverflow = upper !== null && !Number.isFinite(upper + (width ?? autoWidth))
  const settingsError = scale !== 'LINEAR' ? null : badUpper ? '上限には0より大きい数値を入力してください'
    : badWidth ? '階級幅には0より大きい数値を入力してください'
    : rangeOverflow ? '上限または階級幅を小さくしてください'
    : (width !== null || upper !== null) && !validation.valid ? `通常階級は最大${MAX_CUSTOM_LINEAR_BIN_COUNT}階級です。階級幅を大きくするか、上限を小さくしてください` : null
  const distribution = useMemo(() => buildEnemyComparisonDistribution(rows, conditions, metric.key, {
    ...options, customLinearBinWidth: settingsError ? null : width, customLinearUpperBound: settingsError ? null : upper,
  }), [rows, conditions, metric.key, metric.logBinCount, metric.minimumLinearBinWidth, scale, width, upper, settingsError])
  const data = useMemo<EnemyComparisonSnapshot>(() => ({ distribution, metric, scale, yAxis }), [distribution, metric, scale, yAxis])
  const canSave = !settingsError && distribution.series.some((series) => series.condition.visible && series.count > 0)
  const picker = getChartImageSavePicker()
  const previewAspect = aspect.preset === 'auto' ? undefined : Number(aspect.width) / Number(aspect.height)
  const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 8 }).format(value)

  const saveImage = async (filename: string, aspectRatio?: number) => {
    if (!imageData || savingRef.current) return
    savingRef.current = true; setSaving(true); setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      const layout = getEnemyChartImageLayout({ kind: 'COMPARISON', aspectRatio })
      await saveComparisonChartImage({ chart: <EnemyComparisonImage data={imageData} aspectRatio={aspectRatio} />,
        width: layout.width, filename, writeBlob: destination.type === 'file' ? destination.write : undefined })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded'); setImageData(null)
    } catch { setFeedback('failed') } finally { savingRef.current = false; setSaving(false) }
  }

  return <div className="enemy-comparison" hidden={!active}>
    <EnemyComparisonConditions rows={rows} conditions={conditions} series={distribution.series} onChange={setConditions} />
    <div className="enemy-comparison-settings">
      <div className="enemy-comparison-axis-settings">
        <div><span>横軸</span><div className="enemy-chart-scale-switch" role="group" aria-label="比較の横軸目盛">
          {(['LINEAR', 'LOG'] as const).map((option) => <button type="button" key={option} aria-pressed={scale === option} className={scale === option ? 'active' : ''} onClick={() => setScale(option)}>{option === 'LINEAR' ? '線形' : '対数'}</button>)}
        </div></div>
        <div><span>縦軸</span><div className="enemy-chart-scale-switch" role="group" aria-label="比較の縦軸">
          {(['PERCENT', 'COUNT'] as const).map((option) => <button type="button" key={option} aria-pressed={yAxis === option} className={yAxis === option ? 'active' : ''} onClick={() => setYAxis(option)}>{option === 'PERCENT' ? '割合' : '敵数'}</button>)}
        </div></div>
        <button type="button" className="button secondary enemy-chart-save-button" aria-haspopup="dialog" disabled={!canSave || saving} onClick={() => {
          if (!canSave || savingRef.current) return
          // These immutable calculation results and condition objects form the export snapshot.
          setImageData(data); setFeedback(null)
        }}>{saving ? '画像を保存中…' : '画像を保存'}</button>
      </div>
      {scale === 'LINEAR' && <div className="enemy-comparison-bin-settings">
        <label><span>共通の階級幅</span><input type="number" min="0" step="any" placeholder="自動" value={widthInput}
          onInput={(event) => { const invalid = event.currentTarget.validity.badInput; setSettings((current) => ({ ...current, badWidth: invalid })) }}
          aria-label="共通の階級幅" aria-invalid={!!settingsError} onChange={(event) => setSettings({ ...settings, width: event.target.value, badWidth: event.target.validity.badInput })} />
          <small>{distribution.histogram?.binWidth != null ? `${width === null ? '自動' : '固定'}：${format(distribution.histogram.binWidth)}${metric.suffix}` : '—'}</small></label>
        <div className="enemy-comparison-upper"><div><label htmlFor="enemy-comparison-upper">通常階級の上限</label>
          <EnemyHistogramOverflowHelp isCustom={upper !== null} hasOverflow={distribution.series.some((series) => series.overflowCount > 0)} overflowDisplay="SEPARATE"
            upperBoundLabel={distribution.histogram ? `${format(distribution.histogram.normalRangeEnd)}${metric.suffix}` : null} />
        </div><input id="enemy-comparison-upper" type="number" min="0" step="any" placeholder="自動" value={upperInput}
          onInput={(event) => { const invalid = event.currentTarget.validity.badInput; setSettings((current) => ({ ...current, badUpper: invalid })) }}
          aria-invalid={!!settingsError} onChange={(event) => setSettings({ ...settings, upper: event.target.value, badUpper: event.target.validity.badInput })} />
          <small>{distribution.histogram ? `${upper === null ? '自動' : '固定'}：${format(distribution.histogram.normalRangeEnd)}${metric.suffix}超を別表示` : '—'}</small></div>
        <button type="button" disabled={!widthInput && !upperInput && !settings.badWidth && !settings.badUpper} onClick={() => setSettings(emptySettings)}>自動に戻す</button>
      </div>}
    </div>
    {settingsError ? <p className="enemy-comparison-error" role="alert">{settingsError}</p> : <EnemyComparisonFigure data={data} onToggle={(id) => setConditions((current) => current.map((condition) => condition.id === id ? { ...condition, visible: !condition.visible } : condition))} />}
    <p className="visually-hidden" role="status">{feedback === 'saved' ? 'PNG画像を保存しました。' : feedback === 'downloaded' ? 'PNG画像のダウンロードを開始しました。' : ''}</p>
    {imageData && <ChartImageSaveDialog initialFilename={getEnemyChartImageFilename({ kind: 'COMPARISON', metricLabel: imageData.metric.label,
      comparisonSettings: { seriesLabels: imageData.distribution.series.filter((series) => series.condition.visible).map((series) => series.label),
        yAxis: imageData.yAxis, scale: imageData.scale, binWidth: imageData.distribution.histogram?.binWidth ?? null,
        upperBound: imageData.distribution.histogram?.normalRangeEnd ?? null } })}
      aspect={aspect} onAspectChange={setAspect} canChooseLocation={!!picker} saving={saving} error={feedback === 'failed'} helpMode="popover"
      preview={<EnemyComparisonImagePreview key={`${previewAspect}`} data={imageData} aspectRatio={previewAspect} />}
      onClose={() => { if (!savingRef.current) { setImageData(null); setFeedback(null) } }} onSave={(filename, ratio) => void saveImage(filename, ratio)} />}
  </div>
}
