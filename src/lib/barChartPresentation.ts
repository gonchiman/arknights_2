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

/** Category alignment in a multi-series document does not erase numerical class meaning. */
export function getBarChartItemKind(document: Pick<BarChartDocument, 'xKind' | 'semantics'>): BarChartDocument['xKind'] {
  return document.semantics.itemKind ?? document.xKind
}

/** The data's declared meaning selects the rule; values and page names do not. */
export function getBarChartPresentation(kind: BarChartDocument['xKind'], _layout?: BarChartDocument['layout']): BarChartPresentation {
  const presentation = PRESENTATIONS[kind]
  if (!presentation) throw new Error('棒グラフの描画方式を確認できませんでした。')
  return presentation
}

/** One slot is plot width / all bins, including zero and unavailable values. */
export function getBarChartBarWidth(kind: BarChartDocument['xKind'], slotWidth: number, layout?: BarChartDocument['layout']): number {
  const presentation = getBarChartPresentation(kind, layout)
  const proportional = (Number.isFinite(slotWidth) ? Math.max(0, slotWidth) : 0) * presentation.widthRatio
  return presentation.maximumWidth === null ? proportional : Math.min(presentation.maximumWidth, proportional)
}

/** Presentation text and the actual geometry read the same immutable rule. */
export function getBarChartPresentationLabels(kind: BarChartDocument['xKind'], layout?: BarChartDocument['layout']) {
  const presentation = getBarChartPresentation(kind, layout)
  const percentage = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(presentation.widthRatio * 100)
  const orientation = layout === 'mirrored' ? '左右の横棒' : layout === 'stacked-percent' ? '100%積み上げ横棒' : ''
  return {
    type: orientation ? `${orientation}・${presentation.label}` : presentation.label,
    width: orientation ? `1項目の高さの${percentage}%` : `1項目幅の${percentage}%`,
    limit: presentation.maximumWidth === null ? null : `上限${presentation.maximumWidth}px（PNG拡大前）`,
  }
}
