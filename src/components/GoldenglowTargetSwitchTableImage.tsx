import { getGgTableTargets, getGgTableTitle, getGgTableStageData, getGgTableColorScaleMaximum, getGgTableRankMode,
  type GgTableData, type GgTableImageLayout } from '../lib/goldenglowTargetSwitchTable'
import { createChartImageFilename, formatChartFilenameValues, withChartImageAspect } from '../lib/chartImageFilename'
import { DEFAULT_COMPARISON_TABLE_IMAGE_TYPOGRAPHY, type ComparisonTableImageTypography } from '../lib/tableImageTypography'
import { getGoldenglowTargetSwitchTableComparisonLabel } from './GoldenglowTargetSwitchTable'
import { GoldenglowTargetSwitchTableContent } from './GoldenglowTargetSwitchTableContent'
import { ComparisonTableImageFrame, ComparisonTableImagePreview } from './ComparisonTableImageFrame'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './GoldenglowTargetSwitchTableImage.css'

export interface GoldenglowTargetSwitchTableImageSnapshot {
  data: GgTableData
  conditions: string
  title?: string
  imageLayout?: GgTableImageLayout
  moduleLevel?: number
  typography?: ComparisonTableImageTypography
}
interface ImageProps extends GoldenglowTargetSwitchTableImageSnapshot {
  aspectRatio?: number
  exporting?: boolean
  onLayout?: (size: { width: number; height: number }) => void
  onLayoutError?: (cause: unknown) => void
}

export function getGoldenglowTargetSwitchTableImageStageSnapshot(snapshot: GoldenglowTargetSwitchTableImageSnapshot, level: number): GoldenglowTargetSwitchTableImageSnapshot {
  return { ...snapshot, imageLayout: 'split', moduleLevel: level, data: getGgTableStageData(snapshot.data, level) }
}

function stageData(snapshot: GoldenglowTargetSwitchTableImageSnapshot): GgTableData {
  return snapshot.imageLayout === 'split' && snapshot.moduleLevel !== undefined
    ? getGgTableStageData(snapshot.data, snapshot.moduleLevel) : snapshot.data
}

function initialWidthFor(snapshot: GoldenglowTargetSwitchTableImageSnapshot): number {
  const data = stageData(snapshot)
  if (snapshot.imageLayout === 'transpose') return Math.max(640, (data.layout === 'winner' ? 100 : 300) + data.resistances.length * 128)
  const targets = getGgTableTargets(data)
  const hpColumns = data.layout === 'winner' ? 1 : targets.reduce((count, build) => count + (data.layout === 'combined' && build.id !== 'none' ? 2 : 1), 0)
  return Math.max(640, 126 + (snapshot.imageLayout === 'stacked' ? 1 : data.hps.length) * hpColumns * 128)
}

export function getGoldenglowTargetSwitchTableImageFilename(snapshot: GoldenglowTargetSwitchTableImageSnapshot, aspectRatio?: number): string {
  const data = stageData(snapshot)
  const typography = snapshot.typography ?? DEFAULT_COMPARISON_TABLE_IMAGE_TYPOGRAPHY
  return withChartImageAspect(createChartImageFilename('ゴールデングロー_ターゲット切替3', [
    data.layout === 'winner' ? '最大のMOD' : data.layout === 'total' ? '総ダメージ' : data.layout === 'combined' ? '総ダメージと比較値' : '比較値',
    data.layout === 'winner' ? data.winnerColor === 'none' ? '色なし' : data.winnerGapShading && data.builds.length >= 2 ? 'MOD色_差濃淡0-30%以上' : 'MOD色'
      : data.metric === 'difference' ? '差' : data.metric === 'ratio' ? '基準比' : '増加率',
    data.layout === 'winner' ? '' : data.baseline.kind === 'previous' ? '前段階基準' : data.baseline.kind === 'selected'
      ? `${data.builds.find(build => build.id === data.baseline.id)?.label ?? data.series.find(series => series.id === data.baseline.id)?.label ?? '指定MOD'}基準` : '未装備基準',
    snapshot.imageLayout === 'transpose' ? '術耐性を列に' : snapshot.imageLayout === 'stacked' ? 'HPごと上下' : snapshot.imageLayout === 'split' ? `段階別${snapshot.moduleLevel === undefined ? '' : `Lv${snapshot.moduleLevel}`}` : '',
    `数値${typography.numberSize === 'auto' ? '自動' : `${typography.numberSize}%`}`, `タイトル${typography.titleSize}px-詳細${typography.detailSize}px`,
    `ランク${getGgTableRankMode(data) === 'none' ? 'なし' : getGgTableRankMode(data) === 'merged' ? '結合' : '併記'}`,
    data.builds.map(build => build.label).join('-'),
    `HP${formatChartFilenameValues(data.hps)}`, `術耐性${formatChartFilenameValues(data.resistances)}`,
    data.layout === 'winner' ? '' : `小数${data.precision}桁`, snapshot.conditions,
  ]), aspectRatio)
}

function imageContent(snapshot: GoldenglowTargetSwitchTableImageSnapshot) {
  const data = stageData(snapshot)
  const maximum = getGgTableColorScaleMaximum(data)
  return snapshot.imageLayout === 'stacked' ? data.hps.map(hp => <section key={hp} className="gg-switch-table-image-hp-panel">
    <h3>敵HP {hp.toLocaleString('ja-JP')}</h3>
    <GoldenglowTargetSwitchTableContent data={{ ...data, hps: [hp], colorScaleMaximum: maximum }} forImage />
  </section>) : <GoldenglowTargetSwitchTableContent data={data} transpose={snapshot.imageLayout === 'transpose'} forImage />
}

function frameProps(snapshot: GoldenglowTargetSwitchTableImageSnapshot) {
  const data = stageData(snapshot)
  const title = snapshot.title ?? getGgTableTitle(data)
  return { initialWidth: initialWidthFor(snapshot), typography: snapshot.typography, className: 'gg-switch-table-image',
    title: snapshot.imageLayout === 'split' && snapshot.moduleLevel !== undefined ? `${title}・MOD Lv.${snapshot.moduleLevel}` : title,
    footer: <div className="gg-switch-table-image-conditions"><span>{getGoldenglowTargetSwitchTableComparisonLabel(data)}</span><span>{snapshot.conditions}</span></div>,
    layoutKey: JSON.stringify(snapshot) }
}

export function GoldenglowTargetSwitchTableImage({ aspectRatio, exporting, onLayout, onLayoutError, ...snapshot }: ImageProps) {
  return <div className="gg-switch-table-image-shell"><ComparisonTableImageFrame {...frameProps(snapshot)} aspectRatio={aspectRatio}
    exporting={exporting} onLayout={onLayout} onLayoutError={onLayoutError}>{imageContent(snapshot)}</ComparisonTableImageFrame></div>
}

export function GoldenglowTargetSwitchTableImagePreview({ aspectRatio, onLayoutError, onLayoutReady, ...snapshot }: Omit<ImageProps, 'exporting' | 'onLayout'> & { onLayoutReady?: () => void }) {
  return <div className="gg-switch-table-image-shell"><ComparisonTableImagePreview {...frameProps(snapshot)} aspectRatio={aspectRatio}
    onLayoutError={onLayoutError} onLayoutReady={onLayoutReady}>{imageContent(snapshot)}</ComparisonTableImagePreview></div>
}

export async function saveGoldenglowTargetSwitchTableImage({ snapshot, filename, aspectRatio, writeBlob }: {
  snapshot: GoldenglowTargetSwitchTableImageSnapshot; filename?: string; aspectRatio?: number; writeBlob?: (blob: Blob) => Promise<void>
}): Promise<void> {
  const data = stageData(snapshot)
  if (!getGgTableTargets(data).length || !data.hps.length || !data.resistances.length) throw new Error('保存する比較表がありません。')
  let layoutError: unknown = null
  await document.fonts.ready
  try {
    await saveComparisonChartImage({ chart: <GoldenglowTargetSwitchTableImage {...snapshot} aspectRatio={aspectRatio} exporting onLayoutError={cause => { layoutError = cause }} />,
      filename: filename ?? getGoldenglowTargetSwitchTableImageFilename(snapshot, aspectRatio), width: initialWidthFor(snapshot), writeBlob })
  } catch (cause) { throw layoutError ?? cause }
}
