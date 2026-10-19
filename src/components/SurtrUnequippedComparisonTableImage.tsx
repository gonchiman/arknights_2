import { getSurtrUnequippedTableImageFilename, getSurtrUnequippedTableImagePotentials, type SurtrUnequippedTableImageMetadata } from '../lib/surtrUnequippedTableImageFilename'
import { getSurtrComparisonTargets, getSurtrComparisonBaseLabel, getSurtrUnequippedBaselines } from '../lib/surtrUnequippedComparison'
import { getSurtrComparisonImageColorScaleMaximum, getSurtrComparisonImageStageLevels, getSurtrComparisonImageStageSnapshot,
  type SurtrComparisonImageLayout } from '../lib/surtrComparisonImageLayout'
import type { SurtrComparisonImageNumberSize } from '../lib/surtrComparisonImageNumberSize'
import { getSurtrComparisonTableTitle } from '../lib/surtrComparisonTableTitle'
import { buildSurtrComparisonWinnerData } from '../lib/surtrComparisonWinner'
import { buildSurtrRemnantComparisonColumns, buildSurtrRemnantWinnerData, type SurtrRemnantComparisonState } from '../lib/surtrRemnantComparison'
import { getUnequippedMetricLabel, SurtrComparisonTableSurface, type SurtrUnequippedComparisonTableData } from './SurtrUnequippedComparisonTableContent'
import { ComparisonTableImageFrame, ComparisonTableImagePreview } from './ComparisonTableImageFrame'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './SurtrS3Page.css'
import './SurtrDurationChart.css'
import './SurtrUnequippedComparisonTableImage.css'

export interface SurtrUnequippedComparisonTableImageSnapshot extends SurtrUnequippedComparisonTableData {
  metadata: SurtrUnequippedTableImageMetadata
  title?: string
  imageLayout?: SurtrComparisonImageLayout
  moduleLevel?: number
  numberSize?: SurtrComparisonImageNumberSize
  titleSize?: number
  detailSize?: number
}

interface ImageProps extends SurtrUnequippedComparisonTableImageSnapshot {
  aspectRatio?: number
  exporting?: boolean
  onLayout?: (size: { width: number; height: number }) => void
  onLayoutError?: (error: unknown) => void
}

function stageSnapshot(snapshot: SurtrUnequippedComparisonTableImageSnapshot): SurtrUnequippedComparisonTableImageSnapshot {
  if (snapshot.imageLayout !== 'split') return snapshot
  const level = snapshot.moduleLevel ?? getSurtrComparisonImageStageLevels(snapshot)[0]
  return level === undefined ? snapshot : getSurtrComparisonImageStageSnapshot(snapshot, level)
}

const initialWidthFor = (source: SurtrUnequippedComparisonTableImageSnapshot) => {
  const snapshot = stageSnapshot(source)
  if (snapshot.displayMode === 'winner') {
    const columns = (snapshot.remnantComparison !== undefined ? buildSurtrRemnantWinnerData(snapshot)
      : buildSurtrComparisonWinnerData(snapshot)).columnAxis.items.length
    return snapshot.imageLayout === 'transpose' ? Math.max(640, 240 + snapshot.resistances.length * 130)
      : Math.max(640, 120 + columns * 180)
  }
  if (snapshot.remnantComparison !== undefined) {
    if (snapshot.imageLayout === 'transpose') return Math.max(640, (snapshot.blockingComparison === undefined ? 320 : 480)
      + snapshot.resistances.length * (snapshot.layout === 'combined' ? 200 : 128))
    const columns = buildSurtrRemnantComparisonColumns(snapshot)
    const numericWidth = (group: typeof columns) => group.reduce((width, column) =>
      width + (snapshot.layout === 'combined' && !column.isBaseline ? 2 : 1) * 128, 0)
    const width = snapshot.imageLayout === 'stacked' && snapshot.blockingComparison !== undefined
      ? Math.max(...[false, true].map(blocking => numericWidth(columns.filter(column => column.blocking === blocking))))
      : numericWidth(columns)
    return Math.max(640, 80 + (snapshot.rankMode === 'merged' ? 64 : 0) + width)
  }
  const targets = getSurtrComparisonTargets(snapshot.series, snapshot.comparisonBase).length
  const baselines = snapshot.comparisonBase === undefined || snapshot.comparisonBase === 'unequipped'
    ? getSurtrUnequippedBaselines(snapshot.series, snapshot.baseline, snapshot.referenceSeries).length : 0
  if (snapshot.imageLayout === 'transpose') return Math.max(640, (snapshot.blockingComparison === undefined ? 220 : 380)
    + snapshot.resistances.length * (snapshot.layout === 'combined' ? 200 : 128))
  const conditions = snapshot.blockingComparison === undefined || snapshot.imageLayout === 'stacked' ? 1 : 2
  const columns = (snapshot.layout === 'combined' ? 1 + baselines + targets * 2 * conditions : 1 + targets * conditions)
    + (snapshot.rankMode === 'merged' ? 1 : 0)
  return Math.max(640, columns * 150)
}

/** Keep domain columns and conditions here; sizing, typography and preview are shared. */
function frameProps(source: SurtrUnequippedComparisonTableImageSnapshot) {
  const { metadata, title, imageLayout = 'current', moduleLevel, numberSize, titleSize, detailSize, ...data } = stageSnapshot(source)
  const winner = data.displayMode === 'winner'
  const defaultTitle = winner ? 'スルト S3 DPSが最大のMOD'
    : data.quantity === 'expected-damage' ? undefined : getSurtrComparisonTableTitle(data)
  const imageTitle = title?.trim() || (defaultTitle && `${defaultTitle}${data.remnantComparison !== undefined ? '（余燼なし・余燼中）' : ''}`)
  const stageTitle = imageLayout === 'split' && moduleLevel !== undefined ? `${imageTitle ?? '比較表'}・MOD Lv.${moduleLevel}` : imageTitle
  const footer = <div className="surtr-unequipped-table-image-conditions">
    {!winner && <span>{data.quantity === 'expected-damage' ? '総ダメージ期待値・' : ''}{getUnequippedMetricLabel(data.metric, data.comparisonBase, data.quantity)}・基準：{data.comparisonBase === 'previous' ? '1つ前の段階（Lv.1は未装備）' : getSurtrComparisonBaseLabel(data.comparisonBase ?? 'unequipped')}{data.comparisonBase?.startsWith('potential-') && '（同じMOD・段階）'}</span>}
    <span>S3 {metadata.skillLabel}・昇進2 Lv.{metadata.level}・信頼度{metadata.trust}・潜在{getSurtrUnequippedTableImagePotentials(metadata).join('・')}・{data.blockingComparison !== undefined ? '未ブロック／対象を自身でブロック' : metadata.blocking ? '対象を自身でブロック' : '未ブロック'}{data.quantity !== 'expected-damage' && `・${data.remnantComparison !== undefined ? '余燼なし／余燼中' : metadata.remnantActive ? '余燼中' : '余燼なし'}`}</span>
    {data.quantity === 'expected-damage' && metadata.remnantAssumptions && <span>残りCT一様・命中まで{metadata.remnantAssumptions.windup}s・CT{metadata.remnantAssumptions.ctCarry === 'time' ? '時間' : '割合'}維持・退場同時の命中{metadata.remnantAssumptions.includeRetreatHit ? 'を含む' : 'を除外'}</span>}
  </div>
  const sharedMaximum = getSurtrComparisonImageColorScaleMaximum(data)
  const children = imageLayout === 'stacked' && data.blockingComparison !== undefined
    ? [false, true].map(blocking => {
      const group = data.blockingComparison?.find(condition => condition.blocking === blocking)
      return <section key={String(blocking)}>
        <div className="surtr-unequipped-table-image-title">{blocking ? '対象を自身でブロック' : '未ブロック'}</div>
        <SurtrComparisonTableSurface {...data}
          series={data.series.map(item => group?.series.find(candidate => candidate.id === item.id) ?? { ...item, points: [] })}
          baseline={group?.baseline ?? { ...data.baseline, points: [] }} referenceSeries={group?.referenceSeries ?? []}
          remnantComparison={data.remnantComparison?.map(state => selectRemnantBlockingState(state, blocking))}
          blockingComparison={undefined} colorScaleMaximum={sharedMaximum} forImage />
      </section>
    }) : <SurtrComparisonTableSurface {...data} transpose={imageLayout === 'transpose'} forImage />
  return { initialWidth: initialWidthFor(source), title: stageTitle, footer, children,
    className: `surtr-unequipped-table-image surtr-unequipped-table-image-${imageLayout}`,
    ariaLabel: `スルト ${winner ? 'S3 DPSが最大のMOD' : `${data.quantity === 'expected-damage' ? '余燼の総ダメージ期待値' : 'S3'} ${getSurtrComparisonBaseLabel(data.comparisonBase ?? 'unequipped')}との比較表`}`,
    typography: { numberSize: numberSize ?? '100' as const, titleSize: titleSize ?? 14, detailSize: detailSize ?? 12 },
    layoutKey: JSON.stringify(source) }
}

export function SurtrUnequippedComparisonTableImage({ aspectRatio, exporting, onLayout, onLayoutError, ...source }: ImageProps) {
  return <ComparisonTableImageFrame {...frameProps(source)} aspectRatio={aspectRatio} exporting={exporting}
    onLayout={onLayout} onLayoutError={onLayoutError} />
}

export function SurtrUnequippedComparisonTableImagePreview({ onLayoutReady, aspectRatio, onLayoutError, ...source }: Omit<ImageProps, 'onLayout' | 'exporting'> & {
  onLayoutReady?: () => void
}) {
  return <ComparisonTableImagePreview {...frameProps(source)} aspectRatio={aspectRatio} onLayoutError={onLayoutError} onLayoutReady={onLayoutReady} />
}

export async function saveSurtrUnequippedComparisonTableImage({ snapshot, filename, aspectRatio, writeBlob }: {
  snapshot: SurtrUnequippedComparisonTableImageSnapshot
  filename?: string
  aspectRatio?: number
  writeBlob?: (blob: Blob) => Promise<void>
}): Promise<void> {
  if (aspectRatio !== undefined && (!Number.isFinite(aspectRatio) || aspectRatio < 0.1 || aspectRatio > 10)) {
    throw new Error('表の縦横比は1:10〜10:1の範囲で指定してください。')
  }
  const prepared = stageSnapshot(snapshot)
  if ((prepared.displayMode === 'winner' ? !(prepared.remnantComparison !== undefined ? buildSurtrRemnantWinnerData(prepared)
    : buildSurtrComparisonWinnerData(prepared)).columnAxis.items.length
    : getSurtrComparisonTargets(prepared.series, prepared.comparisonBase).length === 0) || !snapshot.resistances.length) {
    throw new Error('保存する比較表がありません。')
  }
  let layoutError: unknown = null
  await document.fonts.ready
  try {
    await saveComparisonChartImage({
      chart: <SurtrUnequippedComparisonTableImage {...snapshot} aspectRatio={aspectRatio} exporting onLayoutError={error => { layoutError = error }} />,
      filename: filename ?? getSurtrUnequippedTableImageFilename(snapshot, aspectRatio), width: initialWidthFor(snapshot), writeBlob,
    })
  } catch (error) { throw layoutError ?? error }
}

/** Every state keeps its own raw values and references when stacking block conditions. */
function selectRemnantBlockingState(state: SurtrRemnantComparisonState, blocking: boolean): SurtrRemnantComparisonState {
  const group = state.blockingComparison?.find(condition => condition.blocking === blocking)
  return { ...state,
    series: state.series.map(item => group?.series.find(candidate => candidate.id === item.id) ?? { ...item, points: [] }),
    baseline: group?.baseline ?? { ...state.baseline, points: [] }, referenceSeries: group?.referenceSeries ?? [],
    blockingComparison: undefined,
  }
}
