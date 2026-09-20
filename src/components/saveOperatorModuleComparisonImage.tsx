import { useLayoutEffect, useRef } from 'react'
import type { OperatorModuleComparison } from '../lib/operatorModuleComparison'
import { getOperatorModuleComparisonImageFilename } from '../lib/operatorModuleComparisonImageFilename'
import { getTableImageDimensions, parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import { OperatorModuleComparisonTable } from './OperatorModuleComparisonTable'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './OperatorModuleComparison.css'
import './saveOperatorModuleComparisonImage.css'

interface OperatorModuleComparisonImageOptions {
  comparison: OperatorModuleComparison
  operatorName: string
  operatorId: string
  aspect?: TableImageAspect | null
  filename?: string
  writeBlob?: (blob: Blob) => Promise<void>
}

export async function saveOperatorModuleComparisonImage({
  comparison, operatorName, operatorId, aspect = null, filename, writeBlob,
}: OperatorModuleComparisonImageOptions): Promise<void> {
  const ratio = aspect === null ? null : parseTableImageAspect(String(aspect.width), String(aspect.height))
  if (aspect !== null && ratio === null) throw new Error('画像の縦横比が正しくありません。')
  const imageFilename = filename ?? getOperatorModuleComparisonImageFilename({
    operatorName, operatorId, level: comparison.level, potentialRank: comparison.potentialRank, aspect: ratio,
  })
  const initialWidth = Math.max(960, 90 + comparison.columns.length * 280)
  let layoutError: unknown = null
  if (ratio) await document.fonts.ready
  try {
    await saveComparisonChartImage({
      filename: imageFilename,
      writeBlob,
      width: initialWidth,
      chart: <ModuleComparisonImage comparison={comparison} aspect={ratio} initialWidth={initialWidth}
        onLayoutError={(error) => { layoutError = error }} />,
    })
  } catch (error) {
    throw layoutError ?? error
  }
}

function ModuleComparisonImage({ comparison, aspect, initialWidth, onLayoutError }: {
  comparison: OperatorModuleComparison
  aspect: TableImageAspect | null
  initialWidth: number
  onLayoutError: (error: unknown) => void
}) {
  const imageRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!aspect) return
    const image = imageRef.current
    const table = image?.querySelector('table')
    if (!image || !table) return
    try {
      const { width, height } = getTableImageDimensions({
        initialWidth,
        aspect,
        measureHeight: (candidateWidth) => {
          image.style.width = `${candidateWidth}px`
          table.style.height = 'auto'
          return table.getBoundingClientRect().height
        },
      })
      image.style.width = `${width}px`
      table.style.height = `${height}px`
      // The capture surface follows this exact width, including when a very
      // tall ratio needs less width than the normal automatic export.
      const surface = image.parentElement
      if (surface) surface.style.width = `${width}px`
      const bounds = table.getBoundingClientRect()
      if (Math.abs(bounds.width - width) > 0.5 || Math.abs(bounds.height - height) > 0.5) {
        throw new Error('指定した縦横比に表を調整できませんでした。')
      }
    } catch (error) {
      onLayoutError(error)
      // A zero-sized export is rejected by the shared renderer before a PNG
      // is created; the caller then reports the useful layout error above.
      image.style.display = 'none'
    }
  }, [aspect, initialWidth, onLayoutError])
  return <div ref={imageRef} className="operator-module-comparison operator-module-comparison-image">
    <OperatorModuleComparisonTable comparison={comparison} interactive={false} showLegend />
  </div>
}
