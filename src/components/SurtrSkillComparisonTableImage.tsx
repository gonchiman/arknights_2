import type { ComparisonTableImageTypography } from '../lib/tableImageTypography'
import { ComparisonTableImageFrame, ComparisonTableImagePreview } from './ComparisonTableImageFrame'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import { getSurtrSkillComparisonColorMaximum, SurtrSkillComparisonTableContent,
  SURTR_SKILL_COMPARISON_METRIC_LABELS, type SurtrSkillComparisonTableData,
  type SurtrSkillComparisonDisplayMode,
  type SurtrSkillComparisonTableMetadata } from './SurtrSkillComparisonTableContent'

export type SurtrSkillComparisonImageLayout = 'current' | 'transpose' | 'stacked'
export interface SurtrSkillComparisonTableImageSnapshot extends SurtrSkillComparisonTableData {
  metadata: SurtrSkillComparisonTableMetadata
  title: string
  imageLayout: SurtrSkillComparisonImageLayout
  typography: ComparisonTableImageTypography
}

export function getSurtrSkillComparisonTableTitle(metric: SurtrSkillComparisonTableData['metric'],
  displayMode: SurtrSkillComparisonDisplayMode = 'numeric'): string {
  if (displayMode === 'module-winner') return 'スルト S2・S3 DPSが最大のMOD'
  if (displayMode === 'skill-winner') return 'スルト S2・S3 DPSが最大のスキル'
  return metric === 'dps' ? 'スルト S2・S3 DPS比較' : `スルト S2・S3 ${SURTR_SKILL_COMPARISON_METRIC_LABELS[metric]}`
}

export function getSurtrSkillComparisonTableImageFilename(snapshot: SurtrSkillComparisonTableImageSnapshot, aspectRatio?: number): string {
  const { metadata: m, resistances: r } = snapshot
  const modules = snapshot.series.map(item => item.label.replace(/MOD\s*/g, '').replace(/\s+/g, '')).join('-')
  const mode = snapshot.displayMode ?? 'numeric'
  const metric = mode === 'module-winner' ? '最大MOD' : mode === 'skill-winner' ? '最大スキル'
    : snapshot.metric === 'dps' ? 'DPS比較' : snapshot.metric === 'difference' ? 'DPS差' : snapshot.metric === 'ratio' ? '比率' : '増加率'
  const step = r.length > 1 ? r[1] - r[0] : 0
  const resistanceLabel = r.length > 8 ? r.every((value, index) => index === 0 || value - r[index - 1] === step)
    ? `${r[0]}-${r.at(-1)}刻み${step}` : `${r[0]}-${r.at(-1)}指定${r.length}点` : r.join('-')
  const appearance = mode === 'numeric' ? `${snapshot.precision}桁_${snapshot.rankMode}_${snapshot.colorScale}`
    : `${snapshot.rankMode}_${snapshot.winnerColor === 'none' ? '色なし' : mode === 'module-winner' ? 'MOD色' : 'スキル色'}_${snapshot.winnerGapShading && snapshot.winnerColor !== 'none' ? '差濃淡あり' : '差濃淡なし'}`
  return `スルト_S2-S3_${metric}_S2${m.s2LevelLabel}_S3${m.s3LevelLabel}_術耐性${resistanceLabel}_${modules}_E2Lv${m.level}-信頼${m.trust}-潜在${m.potential}_${m.blocking ? '対象を自身でブロック' : '未ブロック'}_敵${m.enemyCount}体_${m.remnantActive ? '余燼中' : '余燼なし'}_${snapshot.imageLayout}_${appearance}_比率${aspectRatio === undefined ? '自動' : String(aspectRatio).replace('.', '_')}.png`
}

function initialWidth(snapshot: SurtrSkillComparisonTableImageSnapshot): number {
  const mode = snapshot.displayMode ?? 'numeric'
  if (mode !== 'numeric') {
    if (snapshot.imageLayout === 'transpose') return Math.max(640, 160 + snapshot.resistances.length * 128)
    const columnCount = mode === 'module-winner' ? snapshot.imageLayout === 'stacked' || snapshot.winnerSkill ? 1 : 2
      : snapshot.imageLayout === 'stacked' ? 1 : snapshot.series.length
    return Math.max(640, 88 + (snapshot.rankMode === 'merged' ? 64 : 0) + columnCount * 180)
  }
  if (snapshot.imageLayout === 'transpose') return Math.max(640, (snapshot.metric === 'dps' ? 300 : 150) + snapshot.resistances.length * 120)
  const seriesCount = snapshot.imageLayout === 'stacked' ? 1 : snapshot.series.length
  return Math.max(640, 88 + (snapshot.rankMode === 'merged' ? 64 : 0) + seriesCount * (snapshot.metric === 'dps' ? 2 : 1) * 128)
}

function frameProps(snapshot: SurtrSkillComparisonTableImageSnapshot) {
  const { metadata: m, title, imageLayout, typography, ...data } = snapshot
  const mode = snapshot.displayMode ?? 'numeric'
  const maximum = getSurtrSkillComparisonColorMaximum(snapshot)
  const footer = <div className="surtr-skill-comparison-conditions">
    <span>S2 {m.s2LevelLabel}・S3 {m.s3LevelLabel}・昇進2 Lv.{m.level}・信頼{m.trust}・潜在{m.potential}</span>
    <span>{m.blocking ? '対象を自身でブロック' : '未ブロック'}・敵{m.enemyCount}体・{m.remnantActive ? '余燼中' : '余燼なし'}・スキル発動中の理論DPS</span>
    <span>{mode === 'module-winner' ? 'S2・S3それぞれでDPSが最大のMOD'
      : mode === 'skill-winner' ? '各MODでDPSが最大のスキル'
      : data.metric === 'dps' ? '対象数を反映した合計DPS' : `${SURTR_SKILL_COMPARISON_METRIC_LABELS[data.metric]}・比較するスキル：S2・基準：S3`}</span>
    {mode !== 'numeric' && <span>比較：{data.series.map(item => item.label).join('・')}</span>}
  </div>
  return {
    initialWidth: initialWidth(snapshot), title, footer, typography,
    layoutKey: JSON.stringify(snapshot), className: 'surtr-skill-comparison-image',
    ariaLabel: 'スルト S2・S3比較表の画像',
    children: imageLayout === 'stacked' && mode === 'module-winner' ? ([2, 3] as const).map(skill =>
      <section className="surtr-skill-comparison-image-section" key={skill}>
        <h3>S{skill}</h3><SurtrSkillComparisonTableContent {...data} winnerSkill={skill} forImage />
      </section>) : imageLayout === 'stacked' ? data.series.map(item =>
      <section className="surtr-skill-comparison-image-section" key={item.id}>
        <h3>{item.label}</h3><SurtrSkillComparisonTableContent {...data} series={[item]} colorMaximum={maximum} forImage />
      </section>) : <SurtrSkillComparisonTableContent {...data} colorMaximum={maximum} transpose={imageLayout === 'transpose'} forImage />,
  }
}

interface ImageProps extends SurtrSkillComparisonTableImageSnapshot {
  aspectRatio?: number
  exporting?: boolean
  onLayout?: (size: { width: number; height: number }) => void
  onLayoutError?: (error: unknown) => void
}

export function SurtrSkillComparisonTableImage({ aspectRatio, exporting, onLayout, onLayoutError, ...snapshot }: ImageProps) {
  return <ComparisonTableImageFrame {...frameProps(snapshot)} aspectRatio={aspectRatio} exporting={exporting}
    onLayout={onLayout} onLayoutError={onLayoutError} />
}

export function SurtrSkillComparisonTableImagePreview({ aspectRatio, onLayoutError, onLayoutReady, ...snapshot }:
  Omit<ImageProps, 'exporting' | 'onLayout'> & { onLayoutReady?: () => void }) {
  return <ComparisonTableImagePreview {...frameProps(snapshot)} aspectRatio={aspectRatio}
    onLayoutError={onLayoutError} onLayoutReady={onLayoutReady} />
}

export async function saveSurtrSkillComparisonTableImage({ snapshot, filename, aspectRatio, writeBlob }: {
  snapshot: SurtrSkillComparisonTableImageSnapshot
  filename: string
  aspectRatio?: number
  writeBlob?: (blob: Blob) => Promise<void>
}) {
  if (!snapshot.series.length || !snapshot.resistances.length) throw new Error('保存する比較表がありません。')
  if (aspectRatio !== undefined && (!Number.isFinite(aspectRatio) || aspectRatio < 0.1 || aspectRatio > 10)) {
    throw new Error('表の縦横比は1:10〜10:1の範囲で指定してください。')
  }
  let layoutError: unknown = null
  try {
    await saveComparisonChartImage({ filename, width: initialWidth(snapshot), writeBlob,
      chart: <SurtrSkillComparisonTableImage {...snapshot} aspectRatio={aspectRatio} exporting
        onLayoutError={error => { layoutError = error }} /> })
    if (layoutError) throw layoutError
  } catch (error) { throw layoutError ?? error }
}
