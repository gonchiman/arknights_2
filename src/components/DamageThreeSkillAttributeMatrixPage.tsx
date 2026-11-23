import { Fragment, useId, useMemo, useState } from 'react'
import { getDamageThreeAttributeEntries, type DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import { evaluateDamageThreeSkillRankRow, getDamageDifference, type DamageThreeSkillRankMode } from '../lib/damageThreeSkillRankMatrix'
import { getEnemyMainStoryScope } from '../lib/enemyAggregationData'
import { buildEnemyDefenseResistanceBands, type EnemyResistanceThreshold } from '../lib/enemyDefenseResistance'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import type { SkillRecord } from '../types/skill'
import { AnalysisTabPanel } from './AnalysisTabs'
import { EnemyAggregationScopeSelector, type EnemyAggregationScope } from './EnemyAggregationScopeSelector'
import { EnemyAggregationSelector } from './EnemyAggregationSelector'
import { EnemyDataContent } from './EnemyPageShared'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { PageLayout, PageOutputTabs } from './PageLayout'
import { PageViewSwitch, TABLE_CHART_VIEWS, viewLabel, type TableChartView } from './PageViewSwitch'
import DamageThreeSkillRankStatisticsChart from './DamageThreeSkillRankStatisticsChart'
import DamageThreeSkillRankStatisticsTable, { STATISTIC_VIEWS, type StatisticView } from './DamageThreeSkillRankStatisticsTable'
import { useDamageThreeSkillRankStatistics } from './useDamageThreeSkillRankStatistics'
import { TableSortHeader } from './TableSortHeader'
import { useSkillDamageMatrixSort, type MatrixSort, type MatrixSortKey } from './useSkillDamageMatrixSort'
import './DamageCalculatorTwo.css'
import './EnemyAnalysis.css'
import './DamageThreeSkillAttributeMatrixPage.css'

const MODES = [['virtual', '主攻撃の属性変更'], ['actual', '実際のダメージ内訳'], ['statistics', '術耐性別の統計']] as const
type Mode = typeof MODES[number][0]
const ATTRIBUTE_LAYOUTS = [['columns', '横並び'], ['rows', '上下']] as const
type AttributeLayout = typeof ATTRIBUTE_LAYOUTS[number][0]
const PAGE_SIZE = 15
const DEFAULT_SORT: MatrixSort = { key: 'operator', direction: 'asc' }
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const SIGNED_DIFFERENCE = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const OPERATOR_ORDER = new Intl.Collator('ja', { numeric: true })
const UNIT = { NORMAL: '1攻撃', NEXT_ATTACK: '強化攻撃1回', COUNTER: '反撃1回', SKILL_ACTION: '1発動' } as const

function formatValue(value: number | null, formatter = NUMBER) {
  return value === null ? '—' : formatter.format(value)
}

function normalizeSearch(value: string) {
  return value.normalize('NFKC').toLowerCase()
}

function commonValue<T>(entries: readonly DamageThreeAttributeEntry[], select: (entry: DamageThreeAttributeEntry) => T) {
  if (!entries.length) return null
  const first = select(entries[0])
  return entries.every(entry => select(entry) === first) ? first : null
}

export default function DamageThreeSkillAttributeMatrixPage({ rows, loading }: { rows: SkillRecord[]; loading: boolean }) {
  const [scope, setScope] = useState<EnemyAggregationScope>('main')
  const [mode, setMode] = useState<Mode>('virtual')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<MatrixSort>(DEFAULT_SORT)
  const [layout, setLayout] = useState<AttributeLayout>('columns')
  const [showDifference, setShowDifference] = useState(false)
  const [statisticView, setStatisticView] = useState<StatisticView>('distribution')
  const [statisticFormat, setStatisticFormat] = useState<TableChartView>('table')
  const [selectedResistances, setSelectedResistances] = useState<number[]>([0, 50, 60])
  const tabId = useId()
  const aggregation = useEnemyAggregation({ defaultToLatest: true })
  const { data } = aggregation
  const mainStory = useMemo(() => scope === 'main' && data ? getEnemyMainStoryScope(data) : null, [scope, data])
  const unavailable = mainStory?.spawnCountsAvailable === false
  const scoped = mainStory ?? data
  const distribution = useMemo(() => scoped && !unavailable
    ? buildEnemyDefenseResistanceBands(scoped.rows, scoped.counts) : null, [scoped, unavailable])
  const entries = useMemo(() => getDamageThreeAttributeEntries(rows).sort((left, right) =>
    OPERATOR_ORDER.compare(left.skill.operatorName, right.skill.operatorName)
    || left.skill.skillIndex - right.skill.skillIndex || left.levelIndex - right.levelIndex), [rows])
  const filtered = useMemo(() => {
    const words = normalizeSearch(query).trim().split(/\s+/).filter(Boolean)
    if (!words.length) return entries
    return entries.filter(({ skill, stageLabel }) => {
      const text = normalizeSearch(`${skill.operatorName} S${skill.skillIndex} ${skill.skillName} ${stageLabel}`)
      return words.every(word => text.includes(word))
    })
  }, [query, entries])
  const commonLevel = commonValue(filtered, entry => entry.structure.basicInfo.skillLevel)
  const statsActive = mode === 'statistics'
  const canShowDifference = mode === 'virtual' && layout === 'columns'
  const commonUnit = statsActive ? '主攻撃1回' : commonValue(filtered, entry => UNIT[entry.kind])
  const statistics = useDamageThreeSkillRankStatistics(statsActive, filtered, distribution?.resistanceThresholds)
  const sortedEntries = useSkillDamageMatrixSort(filtered, mode === 'actual' ? 'actual' : 'virtual',
    distribution?.resistanceThresholds, statsActive ? DEFAULT_SORT : sort)
  const format = statsActive
    ? [viewLabel(STATISTIC_VIEWS, statisticView), viewLabel(TABLE_CHART_VIEWS, statisticFormat)]
    : `表（${viewLabel(ATTRIBUTE_LAYOUTS, layout)}）`
  const StatisticsOutput = statisticFormat === 'table' ? DamageThreeSkillRankStatisticsTable : DamageThreeSkillRankStatisticsChart
  const pages = Math.ceil(filtered.length / PAGE_SIZE)
  const activePage = Math.min(page, Math.max(0, pages - 1))
  const start = activePage * PAGE_SIZE
  const pageEntries = useMemo(() => sortedEntries?.slice(start, start + PAGE_SIZE) ?? [], [sortedEntries, start])
  const tabs = { idPrefix: tabId, activeTab: mode }
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
  function toggleResistance(value: number) {
    if (sort.resistance === value && selectedResistances.length > 1) resetSort()
    setSelectedResistances(previous => {
      if (!previous.includes(value)) return [...previous, value]
      return previous.length === 1 ? previous : previous.filter(resistance => resistance !== value)
    })
  }
  return <PageLayout page="damage-three-skill-attribute-matrix" className="dc3-matrix" settings={<>
    <EnemyAggregationSelector state={aggregation} />
    <EnemyAggregationScopeSelector scope={scope} onChange={setScope} disabled={!data} />
    {distribution && <span className="dc3-matrix-population">出現回数 {NUMBER.format(distribution.total)}体</span>}
  </>}>
    <PageOutputTabs {...tabs} tabs={MODES} onChange={next => {
      if (next !== mode && sort.resistance !== undefined) resetSort()
      setMode(next)
    }} label="比較方法" format={format} />
    <AnalysisTabPanel {...tabs} tab={mode}>
      <div className="dc3-matrix-controls">
        <label className="dc3-matrix-search">スキル検索
          <input type="search" value={query} placeholder="オペレーター名・スキル名・S番号"
            onChange={event => { setQuery(event.target.value); setPage(0) }} />
        </label>
        <div className="dc3-matrix-conditions" role="group" aria-label="共通条件">
          <span>敵1体</span><span>最大Lv</span><span>信頼100</span><span>潜在1</span><span>MODなし</span>
          {commonLevel && <span>{commonLevel}</span>}
          {commonUnit && <span>{commonUnit}あたり</span>}
        </div>
      </div>
      <EnemyDataContent loading={aggregation.loading} error={aggregation.error} onRetry={aggregation.retry}>
        {unavailable ? <p role="status">この集計版ではメインストーリーの出現回数を利用できません。</p>
          : !distribution?.total ? <p role="status">防御力と術耐性を対応させる出現データがありません。</p>
          : loading && !rows.length ? <p role="status">スキルを読み込んでいます…</p>
          : !rows.length ? <p role="alert">オペレーターデータを取得できません。</p>
          : !filtered.length ? <p role="status">該当するスキルはありません。</p>
          : <>
            <div className="dc3-matrix-display-options">
              {!statsActive && <fieldset className="dc3-matrix-option-group">
                <legend>表示する術耐性</legend>
                <div className="dc3-matrix-option-buttons">
                  {distribution.resistanceThresholds.map(({ resistance }) => {
                    const selected = selectedResistances.includes(resistance)
                    return <button key={resistance} type="button" className="button secondary"
                      aria-label={`術耐性 ${resistance}`} aria-pressed={selected}
                      disabled={selected && selectedResistances.length === 1}
                      onClick={() => toggleResistance(resistance)}>{resistance}</button>
                  })}
                  <button type="button" className="button secondary"
                    disabled={selectedResistances.length === distribution.resistanceThresholds.length}
                    onClick={() => setSelectedResistances(distribution.resistanceThresholds.map(pair => pair.resistance))}>
                    すべて表示
                  </button>
                </div>
              </fieldset>}
              <div className="dc3-matrix-option-group">
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
              </div>
              {canShowDifference && <label className="dc3-matrix-difference-toggle">
                <input type="checkbox" checked={showDifference} onChange={event => {
                  if (!event.target.checked && sort.key === 'difference') resetSort()
                  setShowDifference(event.target.checked)
                }} />
                ダメージ差を表示
              </label>}
              {statsActive && <div className="dc3-matrix-option-group">
                <span className="dc3-matrix-option-label">表示形式</span>
                <PageViewSwitch views={TABLE_CHART_VIEWS} selected={statisticFormat} onChange={setStatisticFormat} label="表示形式" />
              </div>}
            </div>
            {statsActive ? (
              statistics ? <StatisticsOutput rows={statistics} view={statisticView} />
                : <p role="status">主攻撃のダメージを集計中…</p>
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
              <SkillDamageTable entries={pageEntries} pairs={distribution.resistanceThresholds} mode={mode}
                sort={sort} onSort={changeSort}
                selectedResistances={selectedResistances} stacked={layout === 'rows'}
                showDifference={canShowDifference && showDifference}
                showLevel={commonLevel === null} showUnit={commonUnit === null} />
            </>}
          </>}
      </EnemyDataContent>
    </AnalysisTabPanel>
  </PageLayout>
}

function SkillDamageTable({ entries, pairs, mode, showLevel, showUnit, stacked, selectedResistances, showDifference, sort, onSort }: {
  entries: readonly DamageThreeAttributeEntry[]
  pairs: readonly EnemyResistanceThreshold[]
  mode: DamageThreeSkillRankMode
  showLevel: boolean
  showUnit: boolean
  stacked: boolean
  selectedResistances: readonly number[]
  showDifference: boolean
  sort: MatrixSort
  onSort: (key: MatrixSortKey, resistance?: number) => void
}) {
  const results = useMemo(() => entries.map(entry => ({ entry, ...evaluateDamageThreeSkillRankRow(entry, pairs, mode) })),
    [entries, pairs, mode])
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const errorRow = results.find(row => row.entry.key === errorKey && row.errors.length)
  const showStatus = results.some(row => row.hasUnsupportedTalentDamage || row.errors.length)
  const columns = pairs.map((pair, index) => ({ pair, index }))
    .filter(({ pair }) => selectedResistances.includes(pair.resistance))
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
      {columns.map(({ pair }) => <colgroup key={pair.resistance} span={columnsPerPair} />)}
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
          {columns.map(({ pair }) => <th key={pair.resistance} scope={stacked ? 'col' : 'colgroup'}
            colSpan={columnsPerPair} aria-label={`術耐性 ${pair.resistance}`}>
            {!stacked && '術耐性 '}{pair.resistance}
          </th>)}
        </tr>
        <tr>
          {stacked && <th scope="row" className="dc3-matrix-attribute">対応防御力</th>}
          {columns.map(({ pair }) => <th key={pair.resistance} scope={stacked ? 'col' : 'colgroup'}
            colSpan={columnsPerPair} aria-label={`対応防御力 ${formatValue(pair.defense)}`}>
            {!stacked && '対応防御力 '}{formatValue(pair.defense)}
          </th>)}
        </tr>
        {!stacked && <tr>{columns.map(({ pair }) => <Fragment key={pair.resistance}>
          {sortHeader('physical', physicalLabel, undefined, pair.resistance)}
          {sortHeader('arts', artsLabel, artsEndClass, pair.resistance)}
          {showDifference && sortHeader('difference', '物理化 − 術化', 'dc3-matrix-pair-end', pair.resistance)}
        </Fragment>)}</tr>}
      </thead>
      {results.map(({ entry, cells, errors, isExpectedValue, hasUnsupportedTalentDamage }) => {
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
                  {cells.some(cell => cell.physical !== null || cell.arts !== null) ? '一部計算不可' : '計算不可'}
                </button>
              : hasUnsupportedTalentDamage ? '一部未対応' : '—'}</td>}
            {stacked && <th scope="row" className="dc3-matrix-attribute">{physicalLabel}</th>}
            {columns.map(({ pair, index }) => <Fragment key={pair.resistance}>
              <td className="dc3-matrix-damage">{formatValue(cells[index].physical)}</td>
              {!stacked && <td className={`dc3-matrix-damage ${artsEndClass}`}>{formatValue(cells[index].arts)}</td>}
              {showDifference && <td className="dc3-matrix-damage dc3-matrix-pair-end">{formatValue(getDamageDifference(cells[index]), SIGNED_DIFFERENCE)}</td>}
            </Fragment>)}
          </tr>
          {stacked && <tr>
            <th scope="row" className="dc3-matrix-attribute">{artsLabel}</th>
            {columns.map(({ pair, index }) => <td key={pair.resistance} className="dc3-matrix-damage">{formatValue(cells[index].arts)}</td>)}
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
