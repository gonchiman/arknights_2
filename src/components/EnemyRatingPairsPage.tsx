import { useMemo, useState } from 'react'
import { getEnemyMainStoryScope } from '../lib/enemyAggregationData'
import { matchesEnemyFilters } from '../lib/enemyData'
import { ENEMY_HISTOGRAM_COUNT_MODES, getEnemySpawnCoverageLabel, type EnemyHistogramCountMode } from '../lib/enemyHistogramCounts'
import { formatEnemyLevelSelection, type EnemyAnalysisFiltersState } from '../lib/enemyLevelSelection'
import { formatEnemyNumericCondition, matchesEnemyNumericConditions, type EnemyNumericCondition } from '../lib/enemyNumericFilters'
import { buildEnemyRatingPairs } from '../lib/enemyRatingPairs'
import { STANDARD_PAGE_TITLES } from '../lib/navigation'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import { ElementLocationCopyButton } from './ElementLocationCopyButton'
import { EnemyAggregationSelector } from './EnemyAggregationSelector'
import { EnemyAggregationScopeSelector, ENEMY_MAIN_STORY_LABEL, type EnemyAggregationScope } from './EnemyAggregationScopeSelector'
import { EnemyAnalysisFilters } from './EnemyAnalysisFilters'
import { EnemyDataContent } from './EnemyPageShared'
import { EnemyRatingPairsChart, EnemyRatingPairsImageButton, getEnemyRatingPairsFocus } from './EnemyRatingPairsChart'
import { PageLayout, PageOutputHeader } from './PageLayout'
import { PageViewSwitch, viewLabel } from './PageViewSwitch'
import './EnemyAnalysis.css'
import './EnemyRatingPairsPage.css'

const PAGE = 'enemy-rating-pairs'
const CHART = 'ヒートマップ'
const GROUPINGS = [['rating', '全10段階'], ['threshold', 'A以下・A+以上']] as const
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })

export function EnemyRatingPairsPage() {
  const aggregation = useEnemyAggregation({ defaultToLatest: true })
  const { data } = aggregation
  const [scope, setScope] = useState<EnemyAggregationScope>('main')
  const [countMode, setCountMode] = useState<EnemyHistogramCountMode>('SPAWNS')
  const [grouping, setGrouping] = useState<typeof GROUPINGS[number][0]>('rating')
  const [filters, setFilters] = useState<EnemyAnalysisFiltersState>({ levelType: 'ALL' })
  const [conditions, setConditions] = useState<readonly EnemyNumericCondition[]>([])
  const mainStory = useMemo(() => data && scope === 'main' ? getEnemyMainStoryScope(data) : null, [data, scope])
  const source = mainStory ?? data
  const spawnUnavailable = mainStory?.spawnCountsAvailable === false
  const activeMode = countMode === 'SPAWNS' && spawnUnavailable ? 'MAPS' : countMode
  const countOption = ENEMY_HISTOGRAM_COUNT_MODES.find(option => option.key === activeMode)!
  const unit = activeMode === 'SPAWNS' ? '回' : countOption.unit
  const filterLabel = [formatEnemyLevelSelection(filters.levelType), ...conditions.map(formatEnemyNumericCondition)].filter(Boolean).join(' · ')
  const filteredRows = useMemo(() => (source?.rows ?? []).filter(enemy =>
    matchesEnemyFilters(enemy, { query: '', levelType: filters.levelType }) && matchesEnemyNumericConditions(enemy, conditions)),
  [source, filters.levelType, conditions])
  const distribution = useMemo(() => source && buildEnemyRatingPairs(filteredRows, source.counts, activeMode, grouping),
    [source, filteredRows, activeMode, grouping])
  const groupingLabel = viewLabel(GROUPINGS, grouping)
  const coverageLabel = source && activeMode === 'SPAWNS' ? getEnemySpawnCoverageLabel(source.counts.summary) : undefined
  const focus = distribution && grouping === 'threshold' ? getEnemyRatingPairsFocus(distribution, unit) : undefined
  const pageTitle = STANDARD_PAGE_TITLES[PAGE]

  return <PageLayout page={PAGE} className="enemy-analysis-route enemy-rating-pairs-page" settings={
    <section className="enemy-rating-pairs-settings" aria-label="集計条件">
      <PageOutputHeader segments={['集計条件']}><h2>集計条件</h2></PageOutputHeader>
      <div className="enemy-analysis-aggregation">
        <EnemyAggregationSelector state={aggregation} />
        <EnemyAggregationScopeSelector scope={scope} onChange={setScope} disabled={!data} />
        <label className="enemy-aggregation-selector"><span>集計方法</span>
          <select value={activeMode} onChange={event => setCountMode(event.target.value as EnemyHistogramCountMode)}>
            {ENEMY_HISTOGRAM_COUNT_MODES.map(({ key, axisLabel }) =>
              <option key={key} value={key} disabled={key === 'SPAWNS' && spawnUnavailable}>{axisLabel}</option>)}
          </select>
        </label>
      </div>
      {spawnUnavailable && <p role="status">この集計版ではメインストーリーの出現回数を利用できません。</p>}
    </section>
  }>
    <EnemyDataContent loading={aggregation.loading} error={aggregation.error} onRetry={aggregation.retry}>
      {source && distribution && <>
        <section className="enemy-rating-pairs-filters" aria-label="絞り込み">
          <details>
            <summary>絞り込み <span>{filterLabel}</span></summary>
            <EnemyAnalysisFilters filters={filters} onFiltersChange={setFilters} numericConditions={conditions}
              onNumericConditionsChange={setConditions} matchedCount={filteredRows.length} totalCount={source.rows.length}
              onReset={() => { setFilters({ levelType: 'ALL' }); setConditions([]) }} showHints={false} />
          </details>
          <ElementLocationCopyButton segments={[pageTitle, '絞り込み']} />
        </section>
        <PageOutputHeader segments={[CHART]} actions={distribution.total > 0 && <EnemyRatingPairsImageButton
          distribution={distribution} countLabel={countOption.axisLabel} unit={unit} versionId={aggregation.selectedId}
          scopeLabel={scope === 'main' ? ENEMY_MAIN_STORY_LABEL : '全体'} groupingLabel={groupingLabel}
          filterLabel={filterLabel} coverageLabel={coverageLabel} parentLocation={[pageTitle, CHART]} />}>
          <div className="enemy-rating-pairs-heading">
            <h2>{CHART}</h2>
            <PageViewSwitch views={GROUPINGS} selected={grouping} onChange={setGrouping} label="評価のまとめ方" />
          </div>
        </PageOutputHeader>
        <div className="enemy-rating-pairs-population" role="status">
          <span>有効 {NUMBER.format(distribution.total)}{unit}</span>
          <span>値なし {NUMBER.format(distribution.missing)}{unit}</span>
          {coverageLabel && <span>{coverageLabel}</span>}
        </div>
        {distribution.total > 0 ? <>
          <EnemyRatingPairsChart distribution={distribution} countLabel={countOption.axisLabel} unit={unit} />
          {focus && <p className="enemy-rating-pairs-focus">{focus}</p>}
        </> : <p role="status">集計条件に該当する防御力と術耐性の組み合わせはありません。</p>}
      </>}
    </EnemyDataContent>
  </PageLayout>
}
