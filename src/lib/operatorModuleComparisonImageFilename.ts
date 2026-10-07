import type { OperatorModuleComparisonColumn, OperatorModuleComparisonLayout } from './operatorModuleComparison.ts'
import { parseTableImageAspect, type TableImageAspect } from './tableImageAspect.ts'

export function getOperatorModuleComparisonImageFilename({
  operatorName, operatorId, level, columns, potentialRank = 1, aspect = null, layout = 'columns',
}: {
  operatorName: string
  operatorId: string
  level: number | null
  columns?: readonly OperatorModuleComparisonColumn[]
  potentialRank?: number
  aspect?: TableImageAspect | null
  layout?: OperatorModuleComparisonLayout
}): string {
  const name = operatorName.trim() || operatorId.trim() || 'オペレーター'
  const safeName = sanitizeFilenamePart(name) || sanitizeFilenamePart(operatorId) || 'operator'
  const selectionSuffix = columns === undefined
    ? level === null ? '' : `_Lv${level}`
    : `_${columns.map((column) => {
        if (column.id === 'none') return '未装備'
        const label = sanitizeFilenamePart(column.typeLabel?.trim() || column.name || column.id) || 'MOD'
        return `${label}${column.level === null ? '' : `Lv${column.level}`}`
      }).join('-') || '選択なし'}`
  const potentialSuffix = `_潜在${Math.max(1, Number.isFinite(potentialRank) ? Math.round(potentialRank) : 1)}`
  const ratio = aspect === null ? null : parseTableImageAspect(String(aspect.width), String(aspect.height))
  if (aspect !== null && ratio === null) throw new Error('画像の縦横比が正しくありません。')
  const aspectSuffix = ratio ? `_${ratio.width}x${ratio.height}` : ''
  const layoutSuffix = layout === 'rows' ? '_レベル行' : ''
  return `${safeName}_モジュール比較${selectionSuffix}${potentialSuffix}${aspectSuffix}${layoutSuffix}.png`
}

function sanitizeFilenamePart(value: string): string {
  return Array.from(value.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim())
    .slice(0, 80).join('').replace(/[. ]+$/g, '')
}
