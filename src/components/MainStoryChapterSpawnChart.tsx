import { useRef, useState } from 'react'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageRasterSize } from '../lib/chartImageRasterSize'
import type { MainStorySpawnChapterRow } from '../lib/mainStoryEnemySpawns'
import { parseTableImageAspect } from '../lib/tableImageAspect'
import { CategoryGroupedBarChart, type CategoryGroupedBarChartProps } from './CategoryGroupedBarChart'
import { CategoryGroupedBarImagePreview } from './CategoryGroupedBarImagePreview'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { getMainStoryChapterSpawnImageMetadata, type MainStoryChapterSpawnConditions } from './mainStoryChapterSpawnImage'
import { saveComparisonChartImage } from './saveComparisonChartImage'

const number = new Intl.NumberFormat('ja-JP')
const WIDTH = 1920
const ASPECT_PRESETS = ['16:9', '4:3', '1:1', '2:1', '9:16'] as const

export interface MainStoryChapterSpawnChartSnapshot {
  chartProps: CategoryGroupedBarChartProps
  filename: string
}

export function createMainStoryChapterSpawnChart({ rows, ...selection }:
  MainStoryChapterSpawnConditions & { rows: readonly MainStorySpawnChapterRow[] }): MainStoryChapterSpawnChartSnapshot {
  const { title, conditions, filenameConditions } = getMainStoryChapterSpawnImageMetadata(selection)
  const metric = '確認済み出現回数'
  return {
    chartProps: {
      title, metricLabel: metric, categoryAxisLabel: '章', valueAxisLabel: `${metric}（回）`,
      groups: rows.map(row => ({
        id: String(row.chapter), label: `${row.chapter}${row.partialStageCount > 0 ? '＊' : ''}`,
        bars: [{ id: 'spawns', label: metric, value: row.count, color: '#52768a' }],
      })),
      legend: [], showValues: true, showTooltips: false, integerTicks: true, minimumGroupWidth: 40,
      formatValue: number.format,
      conditionLabel: conditions.join('・'),
      footerNote: selection.partialStageCount > 0 ? '＊ 一部集計のステージを含む章では、出現回数は確認できた下限です。' : undefined,
    },
    filename: createChartImageFilename(title, ['グラフ', ...filenameConditions, `幅${WIDTH}px`]),
  }
}

export function MainStoryChapterSpawnChartImageDialog({ snapshot, onClose, parentLocation }: {
  snapshot: MainStoryChapterSpawnChartSnapshot
  onClose: () => void
  parentLocation?: readonly string[]
}) {
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: '16:9', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const saveInProgress = useRef(false)
  const picker = getChartImageSavePicker()
  const parsed = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const aspectRatio = parsed ? parsed.width / parsed.height : undefined
  const output = { width: WIDTH, aspectRatio }
  const layout = getChartImageLayout({ naturalChartHeight: 334, aspectRatio })
  let aspectError = aspect.preset !== 'auto' && !parsed ? '幅と高さは1〜100の整数、縦横比は1:10〜10:1で指定してください。' : undefined
  try { getChartImageRasterSize(layout, output) }
  catch { aspectError = 'この縦横比では画像の大きさが上限を超えます。' }

  async function save(filename: string, chooseLocation: boolean) {
    if (aspectError || saveInProgress.current) return
    saveInProgress.current = true
    setSaving(true)
    setError(false)
    try {
      const destination = await selectChartImageDestination(filename, chooseLocation ? picker : undefined)
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({
        chart: <CategoryGroupedBarChart {...snapshot.chartProps} imageOutput aspectRatio={aspectRatio} />,
        filename, width: layout.width, output, writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      onClose()
    } catch { setError(true) }
    finally { saveInProgress.current = false; setSaving(false) }
  }

  return <ChartImageSaveDialog parentLocation={parentLocation} initialFilename={snapshot.filename}
    getDefaultFilename={ratio => withChartImageAspect(snapshot.filename, ratio)}
    aspect={aspect} aspectPresets={ASPECT_PRESETS} aspectError={aspectError}
    onAspectChange={next => { setAspect(next); setError(false) }}
    canChooseLocation={Boolean(picker)} saving={saving} error={error} helpMode="popover"
    onClose={() => { if (!saveInProgress.current) onClose() }}
    onSave={filename => { void save(filename, true) }}
    additionalSaveAction={picker ? { label: 'ダウンロード', onSave: filename => { void save(filename, false) } } : undefined}
    preview={!aspectError && <CategoryGroupedBarImagePreview key={aspectRatio ?? 'auto'}
      chartProps={snapshot.chartProps} aspectRatio={aspectRatio} output={output} />} />
}
