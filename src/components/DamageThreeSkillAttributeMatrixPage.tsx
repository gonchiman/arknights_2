import { useId, useMemo, useState } from 'react'
import { getOrderedDamageThreeAttributeEntries, type DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import { evaluateDamageThreeSkillRankRow, getDamageDifference, type DamageThreeSkillRankMode, type SkillRankEffectPolicy } from '../lib/damageThreeSkillRankMatrix'
import type { AdvantageUnit } from '../lib/damageThreeSkillRankStatistics'
import { ADVANTAGE_POLICIES, ADVANTAGE_UNITS, NO_CORRESPONDENCE_DATA } from '../lib/damageThreeAdvantageChart'
import { filterDamageThreeSkillEntries, getDamageThreeProfessionOptions, type DamageThreeSkillFilterValues } from '../lib/damageThreeSkillFilters'
import { getEnemyMainStoryScope } from '../lib/enemyAggregationData'
import { buildEnemySpawnPopulation, type EnemyOutlierScope } from '../lib/damageThreeEnemySpawnAdvantage'
import { projectEnemyOperatorVoteSummaries } from '../lib/damageThreeEnemySpawnVotesProjection'
import { projectEnemyAttackQuartiles } from '../lib/damageThreeEnemyAttackQuartiles'
import { STANDARD_PAGE_TITLES } from '../lib/navigation'
import { buildEnemyDefenseResistanceBands, type EnemyResistanceThreshold } from '../lib/enemyDefenseResistance'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import type { SkillRecord } from '../types/skill'
import { AnalysisTabPanel } from './AnalysisTabs'
import { createDamageThreeStatisticsChartImage } from './createDamageThreeStatisticsChartImage'
import { createDamageThreeEnemyAdvantageImage, type EnemyAdvantageImage } from './createDamageThreeEnemyAdvantageImage'
import { ENEMY_ANALYSES, ENEMY_ATTACK_QUARTILES_TITLE, ENEMY_COMPARISON_TITLE, getEnemyAnalysisSegments, type EnemyAnalysis } from './enemyComparisonViews'
import {
  ENEMY_ADVANTAGE_BREAKDOWNS, ENEMY_OUTLIER_SCOPES, formatEnemyOutlierFences,
  getEnemyAdvantageDisplayRows, getVisibleEnemyAdvantageRows, type EnemyAdvantageBreakdown,
} from './enemyAdvantageBreakdown'
import { ComparisonTableImageDialog } from './ComparisonTableImageDialog'
import { DamageCalculatorThreeAttributeChartImageDialog } from './DamageCalculatorThreeAttributeChartImageDialog'
import { DamageThreeEnemyAdvantageChart, DamageThreeEnemyAdvantageTable, DamageThreeEnemyAttackQuartileTable, DamageThreeEnemyMeanDamageTable, EnemyAdvantageCategorySelector, ENEMY_MEAN_DAMAGE_TITLE } from './DamageThreeEnemyAdvantageViews'
import { DamageThreeEnemyMeanDamageChart } from './DamageThreeEnemyMeanDamageChart'
import { DamageThreeOperatorVotes, SkillVoteBreakdown, useOperatorVoteSelection } from './DamageThreeOperatorVotes'
import { DamageThreeVoteList, type VoteListGroup } from './DamageThreeVoteList'
import { DamageThreeSkillPhysicalRateHistogram } from './DamageThreeSkillPhysicalRateHistogram'
import { useDamageThreeEnemySpawnAdvantage, useEnemySpawnDefaultSummary, useLiveEnemyOperatorVoteSummaries } from './useDamageThreeEnemySpawnAdvantage'
import { DamageThreeSkillFilters } from './DamageThreeSkillFilters'
import { EnemyAggregationScopeSelector, type EnemyAggregationScope } from './EnemyAggregationScopeSelector'
import { EnemyAggregationSelector } from './EnemyAggregationSelector'
import { EnemyDataContent } from './EnemyPageShared'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { OutputImageSaveButton } from './OutputImageSaveButton'
import { PageLayout, PageOutputHeader, PageOutputTabs } from './PageLayout'
import { PageViewSwitch, TABLE_CHART_VIEWS, viewLabel, type TableChartView } from './PageViewSwitch'
import DamageThreeSkillRankStatisticsChart from './DamageThreeSkillRankStatisticsChart'
import DamageThreeSkillRankStatisticsTable, { STATISTIC_VIEWS, type StatisticView } from './DamageThreeSkillRankStatisticsTable'
import { useDamageThreeSkillRankStatistics } from './useDamageThreeSkillRankStatistics'
import { useOriginalDamageTypeFilter } from './useOriginalDamageTypeFilter'
import { TableSortHeader } from './TableSortHeader'
import { useSkillDamageMatrixSort, type MatrixSort, type MatrixSortKey } from './useSkillDamageMatrixSort'
import './DamageCalculatorTwo.css'
import './EnemyAnalysis.css'
import './DamageThreeSkillAttributeMatrixPage.css'

const PAGE_ID = 'damage-three-skill-attribute-matrix'
const MODES = [['virtual', '主攻撃の属性変更'], ['actual', '実際のダメージ内訳'], ['statistics', '術耐性別の統計'], ['enemies', ENEMY_COMPARISON_TITLE]] as const
type Mode = typeof MODES[number][0]
const ATTRIBUTE_LAYOUTS = [['columns', '横並び'], ['rows', '上下']] as const
const COMPARISON_CONDITIONS = '比較条件'
const ATTRIBUTE_EFFECTS_LABEL = '属性変更・統計の属性限定効果'
type AttributeLayout = typeof ATTRIBUTE_LAYOUTS[number][0]
const PAGE_SIZE = 15
const DEFAULT_FILTERS: DamageThreeSkillFilterValues = { kind: 'ALL', query: '', profession: 'ALL', rarity: 'ALL', damageType: 'ALL' }
const EMPTY_ENTRIES: readonly DamageThreeAttributeEntry[] = []
const DEFAULT_SORT: MatrixSort = { key: 'operator', direction: 'asc' }
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const SIGNED_DIFFERENCE = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const UNIT = { NORMAL: '1攻撃', NEXT_ATTACK: '強化攻撃1回', COUNTER: '反撃1回', SKILL_ACTION: '1発動' } as const

function formatValue(value: number | null, formatter = NUMBER) {
  return value === null ? '—' : formatter.format(value)
}

function commonValue<T>(entries: readonly DamageThreeAttributeEntry[], select: (entry: DamageThreeAttributeEntry) => T) {
  if (!entries.length) return null
  const first = select(entries[0])
  return entries.every(entry => select(entry) === first) ? first : null
}

function ResistanceSelector({ pairs, value, onChange }: {
  pairs: readonly EnemyResistanceThreshold[]
  value: number
  onChange: (resistance: number) => void
}) {
  const name = useId()
  return <fieldset className="dc3-matrix-option-group enemy-chart-visibility">
    <legend>表示する術耐性</legend>
    <div>
      {pairs.map(({ resistance }) => <label key={resistance} className={value === resistance ? 'active' : ''}>
        <input type="radio" name={name} value={resistance} checked={value === resistance}
          aria-label={`術耐性 ${resistance}`} onChange={() => onChange(resistance)} />
        {resistance}
      </label>)}
    </div>
  </fieldset>
}

export default function DamageThreeSkillAttributeMatrixPage({ rows, loading }: { rows: SkillRecord[]; loading: boolean }) {
  const [scope, setScope] = useState<EnemyAggregationScope>('main')
  const [mode, setMode] = useState<Mode>('virtual')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<MatrixSort>(DEFAULT_SORT)
  const [layout, setLayout] = useState<AttributeLayout>('columns')
  const [showDifference, setShowDifference] = useState(false)
  const [comparisonPolicy, setComparisonPolicy] = useState<typeof ADVANTAGE_POLICIES[number][0]>('excludeAttributeEffects')
  const [actualApplyPenetration, setActualApplyPenetration] = useState(true)
  const [statisticView, setStatisticView] = useState<StatisticView>('distribution')
  const [advantageUnit, setAdvantageUnit] = useState<AdvantageUnit>('skill')
  const [statisticFormat, setStatisticFormat] = useState<TableChartView>('table')
  const [enemyAnalysis, setEnemyAnalysis] = useState<EnemyAnalysis>('advantage')
  const [advantageBreakdown, setAdvantageBreakdown] = useState<EnemyAdvantageBreakdown>('all')
  const [outlierScope, setOutlierScope] = useState<EnemyOutlierScope>('all')
  const advantageView = useState<TableChartView>('chart')
  const outlierView = useState<TableChartView>('table')
  const meanDamageView = useState<TableChartView>('table')
  const [enemyFormat, setEnemyFormat] = enemyAnalysis === 'meanDamage' ? meanDamageView
    : advantageBreakdown === 'outlier' ? outlierView : advantageView
  const operatorVoteSelection = useOperatorVoteSelection()
  const [voteListGroup, setVoteListGroup] = useState<VoteListGroup>('operator')
  const [hiddenCategoriesByBreakdown, setHiddenCategoriesByBreakdown] = useState<Partial<Record<EnemyAdvantageBreakdown, string[]>>>({})
  const [showMeanDamageBands, setShowMeanDamageBands] = useState(false)
  const [imageSnapshot, setImageSnapshot] = useState<(EnemyAdvantageImage & { location: string[] }) | null>(null)
  const [selectedResistance, setSelectedResistance] = useState(0)
  const [histogramResistance, setHistogramResistance] = useState(60)
  const tabId = useId()
  const aggregation = useEnemyAggregation({ defaultToLatest: true })
  const { data } = aggregation
  const mainStory = useMemo(() => scope === 'main' && data ? getEnemyMainStoryScope(data) : null, [scope, data])
  const unavailable = mainStory?.spawnCountsAvailable === false
  const scoped = mainStory ?? data
  const distribution = useMemo(() => scoped && !unavailable
    ? buildEnemyDefenseResistanceBands(scoped.rows, scoped.counts) : null, [scoped, unavailable])
  const selectedPair = distribution?.resistanceThresholds.find(pair => pair.resistance === selectedResistance)
  const entries = useMemo(() => getOrderedDamageThreeAttributeEntries(rows), [rows])
  const statsActive = mode === 'statistics'
  const enemyActive = mode === 'enemies'
  const enemyOverviewActive = enemyActive && enemyAnalysis === 'advantage'
  const quartilesActive = enemyActive && enemyAnalysis === 'attackQuartiles'
  const outliersActive = enemyOverviewActive && advantageBreakdown === 'outlier'
  const enemyMeanActive = enemyActive && enemyAnalysis === 'meanDamage'
  const operatorVotesActive = enemyActive && enemyAnalysis === 'operatorVotes'
  const anyStatistics = statsActive || enemyActive
  const enemyPopulation = useMemo(() => scoped && !unavailable
    ? buildEnemySpawnPopulation(scoped.rows, scoped.counts) : null, [scoped, unavailable])
  const distributionActive = statsActive && statisticView === 'distribution'
  const activeFilters = useMemo<DamageThreeSkillFilterValues>(() =>
    distributionActive ? { ...filters, kind: 'NORMAL' } : filters, [filters, distributionActive])
  const professionOptions = useMemo(() => getDamageThreeProfessionOptions(entries), [entries])
  const candidates = useMemo(() => filterDamageThreeSkillEntries(entries, activeFilters), [entries, activeFilters])
  const matching = useOriginalDamageTypeFilter(candidates, filters.damageType)
  const filtered = matching ?? EMPTY_ENTRIES
  const commonLevel = commonValue(filtered, entry => entry.structure.basicInfo.skillLevel)
  const canReset = (!distributionActive && filters.kind !== 'ALL') || filters.query !== '' || filters.profession !== 'ALL'
    || filters.rarity !== 'ALL' || filters.damageType !== 'ALL'
  const canShowDifference = mode === 'virtual' && layout === 'columns'
  const commonUnit = distributionActive ? '主攻撃1回' : commonValue(filtered, entry => UNIT[entry.kind])
  const actualPolicy = actualApplyPenetration ? 'apply' : 'excludePenetration'
  const effectPolicy = mode === 'actual' ? actualPolicy : comparisonPolicy
  const statistics = useDamageThreeSkillRankStatistics(statsActive, filtered, distribution?.resistanceThresholds, comparisonPolicy)
  const enemyReady = enemyActive && !loading && !!enemyPopulation && matching !== null && (filtered.length > 0 || outliersActive)
  const defaultEligible = enemyReady && scope === 'main' && (!canReset || operatorVotesActive || quartilesActive)
    && comparisonPolicy === 'excludeAttributeEffects'
  const defaultSummary = useEnemySpawnDefaultSummary(defaultEligible, rows, aggregation.version)
  const liveEnemyStats = useDamageThreeEnemySpawnAdvantage(enemyReady && !operatorVotesActive && defaultSummary === null, filtered, enemyPopulation, comparisonPolicy)
  const savedVoteList = useMemo(() => operatorVotesActive && defaultSummary && defaultSummary !== 'checking'
    ? projectEnemyOperatorVoteSummaries(defaultSummary.operatorVotes, entries, filtered) : null,
    [operatorVotesActive, defaultSummary, entries, filtered])
  const liveVoteList = useLiveEnemyOperatorVoteSummaries(enemyReady && operatorVotesActive && defaultSummary !== 'checking' && savedVoteList === null,
    filtered, enemyPopulation, comparisonPolicy)
  const voteList = defaultSummary === 'checking' ? null : savedVoteList ?? liveVoteList
  const enemyStats = defaultSummary === 'checking' ? null : defaultSummary ?? liveEnemyStats
  const attackQuartiles = useMemo(() => {
    if (!quartilesActive) return undefined
    if (canReset && defaultSummary && defaultSummary !== 'checking')
      return projectEnemyAttackQuartiles(defaultSummary.attackQuartileStages, filtered)
    return enemyStats?.attackQuartiles
  }, [quartilesActive, canReset, defaultSummary, enemyStats, filtered])
  const advantageRows = enemyOverviewActive && enemyStats
    ? getEnemyAdvantageDisplayRows(enemyStats, advantageBreakdown, activeFilters.profession, activeFilters.rarity, outlierScope) : []
  const hiddenChartCategories = hiddenCategoriesByBreakdown[advantageBreakdown] ?? []
  const visibleAdvantageRows = getVisibleEnemyAdvantageRows(advantageRows, hiddenChartCategories)
  const meanDamageRows = enemyStats && enemyMeanActive ? (showMeanDamageBands ? enemyStats.rows : enemyStats.rows.slice(0, 1)) : []
  const imageConditions = { aggregationVersion: aggregation.selectedId, scope, comparisonPolicy, filters: activeFilters }
  const rankImage = statsActive && statisticFormat === 'chart' && statistics
    ? createDamageThreeStatisticsChartImage({
        rows: statistics, view: statisticView, resistance: histogramResistance, advantageUnit,
        ...imageConditions,
      })
    : null
  const currentImage: EnemyAdvantageImage | null = enemyActive && enemyStats && enemyAnalysis !== 'operatorVotes'
    ? createDamageThreeEnemyAdvantageImage({
        statistics: enemyStats, format: enemyAnalysis === 'advantage' ? enemyFormat : enemyAnalysis,
        breakdown: advantageBreakdown, outlierScope, hiddenChartCategories, attackQuartiles, showBands: showMeanDamageBands, advantageUnit, meanDamageFormat: enemyFormat,
        ...imageConditions,
      })
    : rankImage && { view: 'chart', snapshot: rankImage }
  const sortedEntries = useSkillDamageMatrixSort(filtered, mode === 'actual' ? 'actual' : 'virtual',
    distribution?.resistanceThresholds, anyStatistics ? DEFAULT_SORT : sort, effectPolicy)
  const format = enemyActive ? getEnemyAnalysisSegments(enemyAnalysis, enemyFormat)
    : statsActive ? [viewLabel(STATISTIC_VIEWS, statisticView), viewLabel(TABLE_CHART_VIEWS, statisticFormat)]
    : [`表（${viewLabel(ATTRIBUTE_LAYOUTS, layout)}）`]
  const pages = Math.ceil(filtered.length / PAGE_SIZE)
  const activePage = Math.min(page, Math.max(0, pages - 1))
  const start = activePage * PAGE_SIZE
  const pageEntries = useMemo(() => sortedEntries?.slice(start, start + PAGE_SIZE) ?? [], [sortedEntries, start])
  const tabs = { idPrefix: tabId, activeTab: mode }
  function changeFilters(next: DamageThreeSkillFilterValues) {
    setFilters(distributionActive ? { ...next, kind: filters.kind } : next)
    setPage(0)
  }
  function changeSort(key: MatrixSortKey, resistance?: number) {
    const sameColumn = key === sort.key && resistance === sort.resistance
    const descending = sameColumn ? sort.direction === 'asc' : resistance !== undefined
    setSort({ key, resistance, direction: descending ? 'desc' : 'asc' })
    setPage(0)
  }
  function resetSort() {
    setSort(DEFAULT_SORT)
    setPage(0)
  }
  function changeResistance(value: number) {
    setSelectedResistance(value)
    if (sort.resistance !== undefined) {
      setSort({ ...sort, resistance: value })
      setPage(0)
    }
  }
  return <PageLayout page={PAGE_ID} className="dc3-matrix" settings={<>
    <EnemyAggregationSelector state={aggregation} />
    <EnemyAggregationScopeSelector scope={scope} onChange={setScope} disabled={!data} />
    {distribution && <span className="dc3-matrix-population">出現回数 {NUMBER.format(distribution.total)}体</span>}
  </>}>
    <DamageThreeSkillFilters filters={activeFilters} professionOptions={professionOptions} onChange={changeFilters}
      allowAllKinds lockKind={distributionActive} damageTypeLabel="元の攻撃属性" canReset={canReset}
      onReset={() => changeFilters(DEFAULT_FILTERS)} />
    <section className="dc3-matrix-comparison-settings" aria-label={COMPARISON_CONDITIONS}>
      <PageOutputHeader segments={[COMPARISON_CONDITIONS]}><h2>{COMPARISON_CONDITIONS}</h2></PageOutputHeader>
      <div className="dc3-matrix-option-group dc3-matrix-comparison-policy">
        <span>{ATTRIBUTE_EFFECTS_LABEL}</span>
        <PageViewSwitch views={ADVANTAGE_POLICIES} selected={comparisonPolicy} label={ATTRIBUTE_EFFECTS_LABEL} onChange={next => {
          setComparisonPolicy(next)
          if (mode === 'virtual' && sort.resistance !== undefined) setPage(0)
        }} />
      </div>
    </section>
    <PageOutputTabs {...tabs} tabs={MODES} onChange={next => {
      if (next !== mode && sort.resistance !== undefined) resetSort()
      setMode(next)
    }} label="比較方法" format={format}
      actions={currentImage && <OutputImageSaveButton onClick={() => setImageSnapshot({
        ...currentImage, location: [STANDARD_PAGE_TITLES[PAGE_ID], viewLabel(MODES, mode), ...format],
      })} />} />
    <AnalysisTabPanel {...tabs} tab={mode}>
      <div className="dc3-matrix-conditions" role="group" aria-label="共通条件">
        <span>敵1体</span><span>最大Lv</span><span>信頼100</span><span>潜在1</span><span>MODなし</span>
        {commonLevel && <span>{commonLevel}</span>}
        {commonUnit && <span>{commonUnit}あたり</span>}
        {mode === 'actual' && <label className="dc3-matrix-toggle">
          <input type="checkbox" checked={actualApplyPenetration} onChange={event => {
            setActualApplyPenetration(event.target.checked)
            if (sort.resistance !== undefined) setPage(0)
          }} />
          防御力・術耐性無視を適用
        </label>}
      </div>
      {enemyActive && <div className="dc3-matrix-option-group dc3-matrix-enemy-analysis">
        <span className="dc3-matrix-option-label">分析内容</span>
        <PageViewSwitch views={ENEMY_ANALYSES} selected={enemyAnalysis} onChange={setEnemyAnalysis} label="分析内容" />
      </div>}
      <EnemyDataContent loading={aggregation.loading} error={aggregation.error} onRetry={aggregation.retry}>
        {unavailable ? <p role="status">この集計版ではメインストーリーの出現回数を利用できません。</p>
          : !distribution?.total ? <p role="status">{enemyActive ? '防御力と術耐性がそろった出現敵はありません。' : NO_CORRESPONDENCE_DATA}</p>
          : loading && !rows.length ? <p role="status">スキルを読み込んでいます…</p>
          : !rows.length ? <p role="alert">オペレーターデータを取得できません。</p>
          : matching === null ? <p role="status">元の攻撃属性で絞り込み中…</p>
          : !anyStatistics && !filtered.length ? <p role="status">該当するスキルはありません。</p>
          : <>
            <div className="dc3-matrix-display-options">
              {!anyStatistics && <ResistanceSelector pairs={distribution.resistanceThresholds}
                value={selectedResistance} onChange={changeResistance} />}
              {!enemyActive && <div className="dc3-matrix-option-group">
                {statsActive ? <>
                  <span className="dc3-matrix-option-label">統計の表示</span>
                  <PageViewSwitch views={STATISTIC_VIEWS} selected={statisticView} onChange={setStatisticView} label="統計の表示" />
                </> : <>
                  <span className="dc3-matrix-option-label">属性の並べ方</span>
                  <PageViewSwitch views={ATTRIBUTE_LAYOUTS} selected={layout} onChange={next => {
                    if (next === 'rows' && sort.resistance !== undefined) resetSort()
                    setLayout(next)
                  }} label="属性の並べ方" />
                </>}
              </div>}
              {canShowDifference && <label className="dc3-matrix-toggle">
                <input type="checkbox" checked={showDifference} onChange={event => {
                  if (!event.target.checked && sort.key === 'difference') resetSort()
                  setShowDifference(event.target.checked)
                }} />
                ダメージ差を表示
              </label>}
              {(enemyOverviewActive || enemyMeanActive) && <div className="dc3-matrix-option-group">
                <span className="dc3-matrix-option-label">表示形式</span>
                <PageViewSwitch views={TABLE_CHART_VIEWS} selected={enemyFormat} onChange={setEnemyFormat} label="表示形式" />
              </div>}
              {(enemyOverviewActive || (statsActive && statisticView === 'advantage')) && <div className="dc3-matrix-option-group">
                <span className="dc3-matrix-option-label">集計単位</span>
                <PageViewSwitch views={ADVANTAGE_UNITS} selected={advantageUnit} onChange={setAdvantageUnit} label="集計単位" />
              </div>}
              {statsActive && <div className="dc3-matrix-option-group">
                <span className="dc3-matrix-option-label">表示形式</span>
                <PageViewSwitch views={TABLE_CHART_VIEWS} selected={statisticFormat} onChange={setStatisticFormat} label="表示形式" />
              </div>}
              {enemyOverviewActive && <div className="dc3-matrix-option-group dc3-matrix-breakdown">
                <span className="dc3-matrix-option-label">内訳</span>
                <PageViewSwitch views={ENEMY_ADVANTAGE_BREAKDOWNS} selected={advantageBreakdown} onChange={setAdvantageBreakdown} label="内訳" />
              </div>}
              {outliersActive && <div className="dc3-matrix-option-group">
                <span className="dc3-matrix-option-label">対象敵</span>
                <PageViewSwitch views={ENEMY_OUTLIER_SCOPES} selected={outlierScope} onChange={setOutlierScope} label="対象敵" />
              </div>}
              {enemyOverviewActive && enemyFormat === 'chart' && advantageBreakdown !== 'all' && advantageRows.length > 0 &&
                <EnemyAdvantageCategorySelector rows={advantageRows} hidden={hiddenChartCategories}
                  onChange={hidden => setHiddenCategoriesByBreakdown(current => ({ ...current, [advantageBreakdown]: hidden }))} />}
              {enemyMeanActive && <label className="dc3-matrix-toggle">
                <input type="checkbox" checked={showMeanDamageBands} onChange={event => setShowMeanDamageBands(event.target.checked)} />
                防御力帯別の内訳
              </label>}
              {statsActive && statisticView === 'distribution' && statisticFormat === 'chart' &&
                <ResistanceSelector pairs={distribution.resistanceThresholds}
                  value={histogramResistance} onChange={setHistogramResistance} />}
            </div>
            {enemyActive ? (
              operatorVotesActive && enemyPopulation ? <DamageThreeVoteList
                    group={voteListGroup} onGroupChange={setVoteListGroup}
                    operators={filtered.length ? voteList : []} imageConditions={imageConditions} spawnCount={enemyPopulation.spawnCount}
                    renderDetail={(operator, skill, close) => skill
                      ? <SkillVoteBreakdown operatorName={operator.operatorName} skill={skill} entries={filtered}
                          population={enemyPopulation} imageConditions={imageConditions} selection={operatorVoteSelection} onClose={close} />
                      : <DamageThreeOperatorVotes operator={operator} entries={filtered} population={enemyPopulation}
                          imageConditions={imageConditions} selection={operatorVoteSelection} />} />
                : !filtered.length && !outliersActive ? <p role="status">該当するスキルはありません。</p>
                : !enemyPopulation || !enemyStats ? <p role="status">出現敵ごとの主攻撃ダメージを集計中…</p>
                : quartilesActive && attackQuartiles ? <>
                    <div className="dc3-matrix-conditions">
                      <span>集計対象 {NUMBER.format(attackQuartiles.includedStageCount)}段階</span>
                      <span>単一の最終攻撃力を特定できず除外 {NUMBER.format(attackQuartiles.excludedStageCount)}段階</span>
                    </div>
                    {attackQuartiles.includedStageCount > 0
                      ? <div className="damage-two-table-wrap" role="region" aria-label={ENEMY_ATTACK_QUARTILES_TITLE} tabIndex={0}>
                          <DamageThreeEnemyAttackQuartileTable rows={attackQuartiles.rows} />
                        </div>
                      : <p role="status">集計対象の段階はありません。</p>}
                  </>
                : !enemyStats.skillCount && !outliersActive ? <p role="status">物理・術の両方を比較できるスキルはありません。</p>
                : <>
                    {enemyMeanActive && <div className="dc3-matrix-table-heading"><h2>{ENEMY_MEAN_DAMAGE_TITLE}</h2></div>}
                    {outliersActive ? <div className="dc3-matrix-conditions">
                      {formatEnemyOutlierFences(enemyStats.outliers)}
                      {enemyFormat === 'chart' && <span>対象敵の出現回数 {NUMBER.format(enemyStats.outliers[outlierScope][0].spawnCount)}回</span>}
                      <span>全敵で有効 {advantageUnit === 'skill'
                        ? `${NUMBER.format(enemyStats.skillCount)}スキル` : `${NUMBER.format(enemyStats.stageCount)}段階`}</span>
                    </div> : <div className="dc3-matrix-conditions">
                      <span>対象敵 {NUMBER.format(enemyPopulation.enemyCount)}種類</span>
                      <span>有効スキル数 {NUMBER.format(enemyStats.skillCount)}</span>
                      {enemyOverviewActive && <span>有効段階数 {NUMBER.format(enemyStats.stageCount)}</span>}
                    </div>}
                    {enemyAnalysis === 'histogram' ? <DamageThreeSkillPhysicalRateHistogram bins={enemyStats.skillPhysicalRateBins} />
                      : enemyOverviewActive && enemyFormat === 'chart' ? <DamageThreeEnemyAdvantageChart rows={visibleAdvantageRows} unit={advantageUnit} breakdown={advantageBreakdown} />
                      : enemyMeanActive && enemyFormat === 'chart' ? <DamageThreeEnemyMeanDamageChart rows={meanDamageRows} />
                      : <div className="damage-two-table-wrap" role="region" aria-label={enemyMeanActive ? ENEMY_MEAN_DAMAGE_TITLE : viewLabel(ENEMY_ANALYSES, 'advantage')} tabIndex={0}>
                          {enemyMeanActive ? <DamageThreeEnemyMeanDamageTable rows={meanDamageRows} />
                            : <DamageThreeEnemyAdvantageTable rows={advantageRows} unit={advantageUnit} breakdown={advantageBreakdown} />}
                        </div>}
                  </>
            ) : statsActive ? (
              !filtered.length ? <p role="status">該当するスキルはありません。</p>
                : !statistics ? <p role="status">主攻撃のダメージを集計中…</p>
                : statisticFormat === 'chart'
                  ? <DamageThreeSkillRankStatisticsChart rows={statistics} view={statisticView}
                      advantageUnit={advantageUnit} resistance={histogramResistance} />
                  : <DamageThreeSkillRankStatisticsTable rows={statistics} view={statisticView} advantageUnit={advantageUnit} />
            ) : <>
              <div className="dc3-matrix-table-heading">
                <h2>{mode === 'virtual' ? '出現順位別の主攻撃ダメージ' : '出現順位別の直接ダメージ内訳'}</h2>
                <nav aria-label="スキル一覧のページ切り替え">
                  <span aria-live="polite">{sortedEntries
                    ? `${start + 1}–${start + pageEntries.length} / ${filtered.length}件` : '並べ替え中…'}</span>
                  {pages > 1 && <>
                    <button type="button" className="button secondary" disabled={!sortedEntries || activePage === 0}
                      onClick={() => setPage(activePage - 1)}>前へ</button>
                    <button type="button" className="button secondary" disabled={!sortedEntries || activePage + 1 >= pages}
                      onClick={() => setPage(activePage + 1)}>次へ</button>
                  </>}
                </nav>
              </div>
              {selectedPair && <SkillDamageTable entries={pageEntries} pair={selectedPair} mode={mode}
                effectPolicy={effectPolicy}
                sort={sort} onSort={changeSort} stacked={layout === 'rows'}
                showDifference={canShowDifference && showDifference}
                showLevel={commonLevel === null} showUnit={commonUnit === null} />}
            </>}
          </>}
      </EnemyDataContent>
    </AnalysisTabPanel>
    {imageSnapshot?.view === 'chart' && <DamageCalculatorThreeAttributeChartImageDialog snapshot={imageSnapshot.snapshot} alternateLayout={imageSnapshot.alternateLayout}
      parentLocation={imageSnapshot.location} onClose={() => setImageSnapshot(null)} />}
    {imageSnapshot?.view === 'table' && <ComparisonTableImageDialog snapshot={imageSnapshot.snapshot}
      parentLocation={imageSnapshot.location} onClose={() => setImageSnapshot(null)} />}
  </PageLayout>
}

function SkillDamageTable({ entries, pair, mode, effectPolicy, showLevel, showUnit, stacked, showDifference, sort, onSort }: {
  entries: readonly DamageThreeAttributeEntry[]
  pair: EnemyResistanceThreshold
  mode: DamageThreeSkillRankMode
  effectPolicy: SkillRankEffectPolicy
  showLevel: boolean
  showUnit: boolean
  stacked: boolean
  showDifference: boolean
  sort: MatrixSort
  onSort: (key: MatrixSortKey, resistance?: number) => void
}) {
  const results = useMemo(() => entries.map(entry => ({ entry, ...evaluateDamageThreeSkillRankRow(entry, [pair], mode, effectPolicy) })),
    [entries, pair, mode, effectPolicy])
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const errorRow = results.find(row => row.entry.key === errorKey && row.errors.length)
  const showStatus = results.some(row => row.hasUnsupportedTalentDamage || row.errors.length)
  const headerRows = stacked ? 2 : 3
  const rowsPerSkill = stacked ? 2 : 1
  const columnsPerPair = stacked ? 1 : 2 + Number(showDifference)
  const artsEndClass = showDifference ? '' : 'dc3-matrix-pair-end'
  const physicalLabel = mode === 'virtual' ? '物理化' : '物理'
  const artsLabel = mode === 'virtual' ? '術化' : '術'
  const label = mode === 'virtual' ? '主攻撃を物理・術に変更したダメージ' : '直接ダメージの物理・術内訳'
  function sortHeader(key: MatrixSortKey, title: string, className?: string, resistance?: number) {
    const prefix = resistance === undefined ? '' : `術耐性 ${resistance}・`
    return <TableSortHeader label={title} ariaLabel={`${prefix}${title}で並べ替え`} className={className}
      rowSpan={resistance === undefined ? headerRows : undefined} sortKey={key}
      sort={sort.resistance === resistance ? sort : null} onSort={() => onSort(key, resistance)} />
  }
  return <div className="damage-two-table-wrap dc3-matrix-scroll" tabIndex={0} role="region" aria-label={label}>
    <table className={`damage-two-table dc3-matrix-table${stacked ? ' dc3-matrix-stacked' : ''}`} aria-label={label}>
      <colgroup span={5 + Number(showLevel) + Number(showUnit) + Number(showStatus) + Number(stacked)} />
      <colgroup span={columnsPerPair} />
      <thead>
        <tr>
          {sortHeader('operator', 'オペレーター', 'dc3-matrix-operator')}
          {sortHeader('skillIndex', 'S番号', 'dc3-matrix-number')}
          {sortHeader('stage', '段階', 'dc3-matrix-stage')}
          {sortHeader('skillName', 'スキル名', 'dc3-matrix-name')}
          {showLevel && <th scope="col" rowSpan={headerRows} className="dc3-matrix-metadata">スキルLv</th>}
          {showUnit && <th scope="col" rowSpan={headerRows} className="dc3-matrix-metadata">単位</th>}
          <th scope="col" rowSpan={headerRows} className="dc3-matrix-metadata">算出方法</th>
          {showStatus && <th scope="col" rowSpan={headerRows} className="dc3-matrix-metadata">計算状態</th>}
          {stacked && <th scope="row" className="dc3-matrix-attribute">術耐性</th>}
          <th scope={stacked ? 'col' : 'colgroup'}
            colSpan={columnsPerPair} aria-label={`術耐性 ${pair.resistance}`}>
            {!stacked && '術耐性 '}{pair.resistance}
          </th>
        </tr>
        <tr>
          {stacked && <th scope="row" className="dc3-matrix-attribute">対応防御力</th>}
          <th scope={stacked ? 'col' : 'colgroup'}
            colSpan={columnsPerPair} aria-label={`対応防御力 ${formatValue(pair.defense)}`}>
            {!stacked && '対応防御力 '}{formatValue(pair.defense)}
          </th>
        </tr>
        {!stacked && <tr>
          {sortHeader('physical', physicalLabel, undefined, pair.resistance)}
          {sortHeader('arts', artsLabel, artsEndClass, pair.resistance)}
          {showDifference && sortHeader('difference', '物理化 − 術化', 'dc3-matrix-pair-end', pair.resistance)}
        </tr>}
      </thead>
      {results.map(({ entry, cells: [cell], errors, isExpectedValue, hasUnsupportedTalentDamage }) => {
        const stages = entry.structure.guardRecipe?.stages ?? entry.structure.effectStructure.stages
        return <tbody key={entry.key}>
          <tr>
            <th scope={stacked ? 'rowgroup' : 'row'} rowSpan={rowsPerSkill} className="dc3-matrix-operator">{entry.skill.operatorName}</th>
            <td rowSpan={rowsPerSkill} className="dc3-matrix-number">S{entry.skill.skillIndex}</td>
            <td rowSpan={rowsPerSkill} className="dc3-matrix-stage">{stages.length > 1 ? entry.stageLabel : '—'}</td>
            <td rowSpan={rowsPerSkill} className="dc3-matrix-name">{entry.skill.skillName}</td>
            {showLevel && <td rowSpan={rowsPerSkill} className="dc3-matrix-metadata">{entry.structure.basicInfo.skillLevel}</td>}
            {showUnit && <td rowSpan={rowsPerSkill} className="dc3-matrix-metadata">{UNIT[entry.kind]}</td>}
            <td rowSpan={rowsPerSkill} className="dc3-matrix-metadata">{isExpectedValue ? '期待値' : '—'}</td>
            {showStatus && <td rowSpan={rowsPerSkill} className="dc3-matrix-metadata">{errors.length > 0
              ? <button type="button" className="text-button dc3-matrix-status-button" aria-haspopup="dialog" onClick={() => setErrorKey(entry.key)}>
                  {cell.physical !== null || cell.arts !== null ? '一部計算不可' : '計算不可'}
                </button>
              : hasUnsupportedTalentDamage ? '一部未対応' : '—'}</td>}
            {stacked && <th scope="row" className="dc3-matrix-attribute">{physicalLabel}</th>}
            <td className="dc3-matrix-damage">{formatValue(cell.physical)}</td>
            {!stacked && <td className={`dc3-matrix-damage ${artsEndClass}`}>{formatValue(cell.arts)}</td>}
            {showDifference && <td className="dc3-matrix-damage dc3-matrix-pair-end">{formatValue(getDamageDifference(cell), SIGNED_DIFFERENCE)}</td>}
          </tr>
          {stacked && <tr>
            <th scope="row" className="dc3-matrix-attribute">{artsLabel}</th>
            <td className="dc3-matrix-damage">{formatValue(cell.arts)}</td>
          </tr>}
        </tbody>
      })}
    </table>
    {errorRow && <GoldenglowDetailModal title={`${errorRow.entry.skill.operatorName} S${errorRow.entry.skill.skillIndex} の計算状態`}
      closeLabel="計算状態を閉じる" onClose={() => setErrorKey(null)}>
      {errorRow.errors.map(message => <p key={message}>{message}</p>)}
      {errorRow.hasUnsupportedTalentDamage && <p>素質によるダメージの一部は未対応です。</p>}
    </GoldenglowDetailModal>}
  </div>
}
