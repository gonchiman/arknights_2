import { useCallback, useRef, useState } from 'react'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { CHART_IMAGE_MAX_SIDE, getChartImageRasterSize } from '../lib/chartImageRasterSize'
import type { EnemyResistanceThreshold } from '../lib/enemyDefenseResistance'
import { parseTableImageAspect } from '../lib/tableImageAspect'
import { ChartImageFrame, type ChartImageFrameProps } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import type { ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import { ComparisonTableImageFrame, ComparisonTableImagePreview } from './ComparisonTableImageFrame'
import { ChartFrameImagePreview } from './DamageCalculatorThreeAttributeChartImageDialog'
import { ENEMY_RESISTANCE_COMBINED_CHART_HEIGHT, EnemyResistanceCombinedImage } from './EnemyResistanceCombinedImage'
import {
  ENEMY_RESISTANCE_THRESHOLD_AXIS_TITLE, EnemyResistanceThresholdScatter, type EnemyResistanceChartType,
} from './EnemyResistanceThresholdScatter'
import { saveComparisonChartImage } from './saveComparisonChartImage'

const MODES = [
  ['table', '表'], ['scatter', '散布図'], ['bar', '棒グラフ'], ['combined', '散布図＋表'], ['bar-combined', '棒グラフ＋表'],
] as const
type ImageMode = typeof MODES[number][0]
type ImageSize = { width: number; height: number }
const TABLE_WIDTH = 720
const FIXED_OUTPUT_WIDTH = 1920
export const ENEMY_RESISTANCE_ASPECT_PRESETS = ['16:9', '4:3', '1:1', '2:1', '9:16'] as const
export const ENEMY_RESISTANCE_SCATTER_TITLE = '防御力と術耐性の対応（散布図）'
export const ENEMY_RESISTANCE_BAR_TITLE = '防御力と術耐性の対応（棒グラフ）'
const AUTO_ASPECT: ChartImageAspectSettings = { preset: 'auto', width: '16', height: '9' }
const COMBINED_ASPECT: ChartImageAspectSettings = { ...AUTO_ASPECT, preset: '16:9' }
const SIZE_ERROR = 'この縦横比ではグラフと表を画像に収められません。縦横比を変更してください。'
const LAYOUT_ERROR = 'グラフと表の配置を確認できませんでした。'

export interface EnemyResistanceScatterSnapshot {
  rows: readonly EnemyResistanceThreshold[]
  chartConditions: readonly string[]
  chartFilenameParts: readonly string[]
}

export interface EnemyResistanceImageSnapshot extends EnemyResistanceScatterSnapshot {
  initialMode: 'table' | EnemyResistanceChartType
  table: ComparisonTableImageSnapshot
  rankColumns: readonly string[]
}

export function getEnemyResistanceScatterFrame(snapshot: EnemyResistanceScatterSnapshot, aspectRatio?: number,
  chartType: EnemyResistanceChartType = 'scatter'): ChartImageFrameProps {
  return {
    title: chartType === 'bar' ? ENEMY_RESISTANCE_BAR_TITLE : ENEMY_RESISTANCE_SCATTER_TITLE,
    conditions: snapshot.chartConditions.join('・'),
    axisTitle: ENEMY_RESISTANCE_THRESHOLD_AXIS_TITLE,
    naturalChartHeight: 334,
    aspectRatio,
    children: ({ height }) => <EnemyResistanceThresholdScatter rows={snapshot.rows} chartType={chartType} imageHeight={height} />,
  }
}

export function EnemyResistanceImageDialog({ snapshot, onClose }: {
  snapshot: EnemyResistanceImageSnapshot
  onClose: () => void
}) {
  const [mode, setMode] = useState<ImageMode>(snapshot.initialMode)
  const [aspects, setAspects] = useState<Partial<Record<ImageMode, ChartImageAspectSettings>>>({})
  const [fixOutputWidth, setFixOutputWidth] = useState(false)
  const [fit, setFit] = useState<{ key: string; error: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<boolean | string>(false)
  const saveInProgress = useRef(false)
  const tableOnly = mode === 'table'
  const combined = mode === 'combined' || mode === 'bar-combined'
  const chartType: EnemyResistanceChartType = mode === 'bar' || mode === 'bar-combined' ? 'bar' : 'scatter'
  const aspect = aspects[mode] ?? (combined ? COMBINED_ASPECT : AUTO_ASPECT)
  const exactAspect = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const aspectRatio = exactAspect ? exactAspect.width / exactAspect.height : undefined
  const output = fixOutputWidth ? { width: FIXED_OUTPUT_WIDTH, aspectRatio } : undefined
  const layoutKey = `${mode}:${aspectRatio ?? 'auto'}:${output?.width ?? 'auto'}`
  const layoutError = fit?.key === layoutKey ? fit.error : ''
  const layoutReady = (!tableOnly && !combined) || (fit?.key === layoutKey && !fit.error)
  const onLayoutReady = useCallback(() => {
    setFit(previous => previous?.key === layoutKey && !previous.error ? previous : { key: layoutKey, error: '' })
  }, [layoutKey])
  const onLayoutError = useCallback((cause: unknown) => {
    const error = cause instanceof Error ? cause.message : LAYOUT_ERROR
    setFit(previous => previous?.key === layoutKey && previous.error === error ? previous : { key: layoutKey, error })
  }, [layoutKey])
  const picker = getChartImageSavePicker()
  const chartTitle = chartType === 'bar' ? ENEMY_RESISTANCE_BAR_TITLE : ENEMY_RESISTANCE_SCATTER_TITLE
  const title = tableOnly ? snapshot.table.title : combined ? '防御力と術耐性の対応' : chartTitle
  const filenameParts = [
    ...(tableOnly ? snapshot.table.filenameConditions ?? snapshot.table.conditions : snapshot.chartFilenameParts),
    ...(combined ? [chartType === 'bar' ? '棒グラフ＋表' : '散布図＋表'] : []),
    ...(output ? [`幅${output.width}px`] : []),
    ...(combined ? snapshot.rankColumns : []),
  ]
  const filename = createChartImageFilename(title, filenameParts)
  const tableFrame = {
    initialWidth: output ? output.width / 2 : TABLE_WIDTH,
    ariaLabel: snapshot.table.title,
    title: snapshot.table.title,
    footer: snapshot.table.conditions.join(' · '),
    aspectRatio,
    children: snapshot.table.table,
  }
  const chartFrame: ChartImageFrameProps = combined ? {
    title,
    conditions: snapshot.chartConditions.join('・'),
    naturalChartHeight: ENEMY_RESISTANCE_COMBINED_CHART_HEIGHT,
    aspectRatio,
    exactAspect: exactAspect ?? undefined,
    children: ({ width, height }) => <EnemyResistanceCombinedImage width={width} height={height} rows={snapshot.rows}
      chartType={chartType} table={snapshot.table.table} onLayout={onLayoutReady} onLayoutError={onLayoutError} />,
  } : getEnemyResistanceScatterFrame(snapshot, aspectRatio, chartType)
  const chartSize = getChartImageLayout(chartFrame)
  const aspectError = aspect.preset !== 'auto' && !exactAspect
    ? '幅と高さは1〜100の整数、縦横比は1:10〜10:1で指定してください。'
    : output && Math.round(output.width / (aspectRatio ?? chartSize.width / chartSize.height)) > CHART_IMAGE_MAX_SIDE
      ? '出力幅1,920 pxでは保存できる高さを超えます。縦横比を変更してください。'
      : combined && !output && !canRenderAtDoubleSize(chartSize) ? SIZE_ERROR : undefined

  async function saveImage(selectedFilename: string, chooseLocation: boolean) {
    if (!layoutReady || aspectError || saveInProgress.current) return
    saveInProgress.current = true
    setSaving(true)
    setSaveError(false)
    let exportReady = !tableOnly && !combined
    let exportError: unknown
    let exportSize: ImageSize | undefined
    const markReady = () => { exportReady = true; exportError = undefined }
    const markError = (cause: unknown) => { exportReady = false; exportError = cause }

    try {
      const destination = await selectChartImageDestination(selectedFilename, chooseLocation ? picker : undefined)
      if (destination.type === 'cancelled') return
      const exportFrame = combined ? {
        ...chartFrame,
        onLayout: (size: ImageSize) => { exportSize = size },
        children: ({ width, height }: ImageSize) => <EnemyResistanceCombinedImage width={width} height={height}
          rows={snapshot.rows} chartType={chartType} table={snapshot.table.table} onLayout={markReady} onLayoutError={markError} />,
      } : chartFrame
      await saveComparisonChartImage({
        chart: tableOnly
          ? <ComparisonTableImageFrame {...tableFrame} exporting onLayout={markReady} onLayoutError={markError} />
          : <ChartImageFrame {...exportFrame} />,
        filename: selectedFilename,
        width: tableOnly ? tableFrame.initialWidth : chartSize.width,
        output,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
        validateLayout: size => {
          if (!exportReady) throw exportError instanceof Error ? exportError : new Error(LAYOUT_ERROR)
          if (!combined) return
          if (!output && !canRenderAtDoubleSize(size)) throw new Error(SIZE_ERROR)
          if (size.width !== exportSize?.width || size.height !== exportSize.height) throw new Error(LAYOUT_ERROR)
        },
      })
      onClose()
    } catch (cause) {
      setSaveError(cause instanceof Error && (combined || exportError) ? cause.message : true)
    } finally {
      saveInProgress.current = false
      setSaving(false)
    }
  }

  return <ChartImageSaveDialog initialFilename={filename} getDefaultFilename={ratio => withChartImageAspect(filename, ratio)}
    aspect={aspect} aspectPresets={ENEMY_RESISTANCE_ASPECT_PRESETS} aspectError={aspectError}
    onAspectChange={next => { setAspects(previous => ({ ...previous, [mode]: next })); setSaveError(false) }}
    canChooseLocation={Boolean(picker)} saving={saving} saveDisabled={!layoutReady} error={saveError || layoutError}
    helpMode="popover" onClose={onClose} onSave={selectedFilename => { void saveImage(selectedFilename, true) }}
    additionalSaveAction={picker ? {
      label: 'ダウンロード',
      onSave: selectedFilename => { void saveImage(selectedFilename, false) },
    } : undefined}
    options={<><label className="chart-image-save-field">
      <span>出力内容</span>
      <select value={mode} disabled={saving} onChange={event => {
        const next = MODES.find(([value]) => value === event.target.value)?.[0]
        if (next) { setMode(next); setFit(null); setSaveError(false) }
      }}>
        {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <div className="enemy-defense-resistance-rank-controls">
      <label>
        <input type="checkbox" checked={fixOutputWidth} disabled={saving} onChange={event => {
          setFixOutputWidth(event.target.checked)
          setSaveError(false)
        }} />
        出力幅を1,920 pxに固定
      </label>
    </div>
    </>}
    preview={!aspectError && (tableOnly
      ? <ComparisonTableImagePreview key={layoutKey} {...tableFrame}
        onLayoutReady={onLayoutReady} onLayoutError={onLayoutError} output={output} />
      : <ChartFrameImagePreview key={layoutKey} {...chartFrame} output={output} />)}
  />
}

function canRenderAtDoubleSize(size: ImageSize) {
  const raster = getChartImageRasterSize(size)
  return raster.width === 2 * size.width && raster.height === 2 * size.height
}
