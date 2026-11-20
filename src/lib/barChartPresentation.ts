import type { BarChartDocument } from './barChartDocument.ts'

interface BarChartPresentation {
  readonly label: string
  readonly widthRatio: number
  /** CSS/SVG coordinates, before PNG scaling. */
  readonly maximumWidth: number | null
}

const PRESENTATIONS = Object.freeze({
  interval: Object.freeze({ label: '区間型', widthRatio: .96, maximumWidth: null }),
  point: Object.freeze({ label: '点型', widthRatio: .6, maximumWidth: 48 }),
  category: Object.freeze({ label: 'カテゴリ型', widthRatio: .6, maximumWidth: 48 }),
}) satisfies Readonly<Record<BarChartDocument['xKind'], BarChartPresentation>>

/** The data's declared meaning selects the rule; values and page names do not. */
export function getBarChartPresentation(kind: BarChartDocument['xKind']): BarChartPresentation {
  const presentation = PRESENTATIONS[kind]
  if (!presentation) throw new Error('棒グラフの描画方式を確認できませんでした。')
  return presentation
}

/** One slot is plot width / all bins, including zero and unavailable values. */
export function getBarChartBarWidth(kind: BarChartDocument['xKind'], slotWidth: number): number {
  const presentation = getBarChartPresentation(kind)
  const proportional = (Number.isFinite(slotWidth) ? Math.max(0, slotWidth) : 0) * presentation.widthRatio
  return presentation.maximumWidth === null ? proportional : Math.min(presentation.maximumWidth, proportional)
}

/** Presentation text and the actual geometry read the same immutable rule. */
export function getBarChartPresentationLabels(kind: BarChartDocument['xKind']) {
  const presentation = getBarChartPresentation(kind)
  const percentage = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(presentation.widthRatio * 100)
  return {
    type: presentation.label,
    width: `1項目幅の${percentage}%`,
    limit: presentation.maximumWidth === null ? null : `上限${presentation.maximumWidth}px（PNG拡大前）`,
  }
}
