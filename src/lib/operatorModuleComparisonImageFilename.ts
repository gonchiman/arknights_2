import { parseTableImageAspect, type TableImageAspect } from './tableImageAspect.ts'

export function getOperatorModuleComparisonImageFilename({
  operatorName, operatorId, level, aspect = null,
}: {
  operatorName: string
  operatorId: string
  level: number | null
  aspect?: TableImageAspect | null
}): string {
  const name = operatorName.trim() || operatorId.trim() || 'オペレーター'
  const safeName = sanitizeFilenamePart(name) || sanitizeFilenamePart(operatorId) || 'operator'
  const levelSuffix = level === null ? '' : `_Lv${level}`
  const ratio = aspect === null ? null : parseTableImageAspect(String(aspect.width), String(aspect.height))
  if (aspect !== null && ratio === null) throw new Error('画像の縦横比が正しくありません。')
  const aspectSuffix = ratio ? `_${ratio.width}x${ratio.height}` : ''
  return `${safeName}_モジュール比較${levelSuffix}${aspectSuffix}.png`
}

function sanitizeFilenamePart(value: string): string {
  return Array.from(value.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim())
    .slice(0, 80).join('').replace(/[. ]+$/g, '')
}
