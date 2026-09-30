import { useLayoutEffect, useRef } from 'react'
import { ENEMY_RATING_STATS, type EnemyRatingStat } from '../lib/enemyStatRatings'
import { getTableImageDimensions, parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import { EnemyRatingReferenceTable } from './EnemyRatingReferenceTable'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './saveEnemyRatingReferenceImage.css'

function getSelectedStats(stats: readonly EnemyRatingStat[]) {
  return ENEMY_RATING_STATS.filter(({ key }) => stats.includes(key))
}

function getImageWidth(statCount: number): number {
  return [432, 672, 912, 1072][Math.max(1, statCount) - 1]
}

export function EnemyRatingReferenceImage({ stats, aspect = null, exporting = false, onLayout, onLayoutError }: {
  stats: readonly EnemyRatingStat[]
  aspect?: TableImageAspect | null
  exporting?: boolean
  onLayout?: (size: { width: number; height: number }) => void
  onLayoutError?: (error: unknown) => void
}) {
  const imageRef = useRef<HTMLDivElement>(null)
  const selectedStats = getSelectedStats(stats)
  const initialWidth = getImageWidth(selectedStats.length)
  const statKey = selectedStats.map(({ key }) => key).join(':')
  const aspectWidth = aspect?.width
  const aspectHeight = aspect?.height
  useLayoutEffect(() => {
    const image = imageRef.current
    const table = image?.querySelector('table')
    if (!image || !table) return
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      image.style.display = ''
      try {
        const size = getTableImageDimensions({
          initialWidth,
          aspect: aspectWidth !== undefined && aspectHeight !== undefined ? { width: aspectWidth, height: aspectHeight } : null,
          measureHeight: (width) => {
            image.style.width = `${width}px`
            table.style.height = 'auto'
            // Layout dimensions exclude the preview's visual scaling.
            return table.offsetHeight
          },
        })
        image.style.width = `${size.width}px`
        table.style.height = `${size.height}px`
        if (table.offsetWidth !== size.width || table.offsetHeight !== size.height || table.scrollWidth > size.width) {
          throw new Error('指定した縦横比に表を調整できませんでした。')
        }
        if (exporting && image.parentElement) image.parentElement.style.width = `${size.width}px`
        onLayout?.(size)
      } catch (error) {
        image.style.display = 'none'
        onLayoutError?.(error)
      }
    }
    measure()
    void document.fonts.ready.then(measure)
    return () => { cancelled = true }
  }, [statKey, initialWidth, aspectWidth, aspectHeight, exporting, onLayout, onLayoutError])
  if (selectedStats.length === 0) return null

  return <div ref={imageRef} className="enemy-rating-reference-image" style={{ width: initialWidth }}>
    <EnemyRatingReferenceTable stats={selectedStats.map(({ key }) => key)} showStatLabels />
  </div>
}

export async function saveEnemyRatingReferenceImage({ stats, aspect = null, filename, writeBlob }: {
  stats: readonly EnemyRatingStat[]
  aspect?: TableImageAspect | null
  filename: string
  writeBlob?: (blob: Blob) => Promise<void>
}): Promise<void> {
  const selectedStats = getSelectedStats(stats)
  if (selectedStats.length === 0) throw new Error('保存する項目を選択してください。')
  const ratio = aspect === null ? null : parseTableImageAspect(String(aspect.width), String(aspect.height))
  if (aspect !== null && ratio === null) throw new Error('画像の縦横比が正しくありません。')
  let layoutError: unknown = null
  await document.fonts.ready

  try {
    await saveComparisonChartImage({
      chart: <EnemyRatingReferenceImage stats={selectedStats.map(({ key }) => key)} aspect={ratio} exporting
        onLayoutError={(error) => { layoutError = error }} />,
      filename,
      width: getImageWidth(selectedStats.length),
      writeBlob,
    })
  } catch (error) {
    throw layoutError ?? error
  }
}
