import { Fragment, useId, useMemo, useState } from 'react'
import { getDamageThreeAttributeEntries, type DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import { evaluateDamageThreeSkillRankRow } from '../lib/damageThreeSkillRankMatrix'
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
import './DamageCalculatorTwo.css'
import './EnemyAnalysis.css'
import './DamageThreeSkillAttributeMatrixPage.css'

const MODES = [['virtual', '主攻撃の属性変更'], ['actual', '実際のダメージ内訳']] as const
type Mode = typeof MODES[number][0]
const PAGE_SIZE = 15
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const OPERATOR_ORDER = new Intl.Collator('ja', { numeric: true })
const UNIT = { NORMAL: '1攻撃', NEXT_ATTACK: '強化攻撃1回', COUNTER: '反撃1回', SKILL_ACTION: '1発動' } as const

function formatValue(value: number | null) {
  return value === null ? '—' : NUMBER.format(value)
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
  const commonUnit = commonValue(filtered, entry => UNIT[entry.kind])
  const pages = Math.ceil(filtered.length / PAGE_SIZE)
  const activePage = Math.min(page, Math.max(0, pages - 1))
  const start = activePage * PAGE_SIZE
  const pageEntries = useMemo(() => filtered.slice(start, start + PAGE_SIZE), [filtered, start])
  const tabs = { idPrefix: tabId, activeTab: mode }
  return <PageLayout page="damage-three-skill-attribute-matrix" className="dc3-matrix" settings={<>
    <EnemyAggregationSelector state={aggregation} />
    <EnemyAggregationScopeSelector scope={scope} onChange={setScope} disabled={!data} />
    {distribution && <span className="dc3-matrix-population">出現回数 {NUMBER.format(distribution.total)}体</span>}
  </>}>
    <PageOutputTabs {...tabs} tabs={MODES} onChange={setMode} label="比較方法" format="表" />
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
            <div className="dc3-matrix-table-heading">
              <h2>{mode === 'virtual' ? '出現順位別の主攻撃ダメージ' : '出現順位別の直接ダメージ内訳'}</h2>
              <nav aria-label="スキル一覧のページ切り替え">
                <span aria-live="polite">{start + 1}–{start + pageEntries.length} / {filtered.length}件</span>
                {pages > 1 && <>
                  <button type="button" className="button secondary" disabled={activePage === 0}
                    onClick={() => setPage(activePage - 1)}>前へ</button>
                  <button type="button" className="button secondary" disabled={activePage + 1 >= pages}
                    onClick={() => setPage(activePage + 1)}>次へ</button>
                </>}
              </nav>
            </div>
            <SkillDamageTable entries={pageEntries} pairs={distribution.resistanceThresholds} mode={mode}
              showLevel={commonLevel === null} showUnit={commonUnit === null} />
          </>}
      </EnemyDataContent>
    </AnalysisTabPanel>
  </PageLayout>
}

function SkillDamageTable({ entries, pairs, mode, showLevel, showUnit }: {
  entries: readonly DamageThreeAttributeEntry[]
  pairs: readonly EnemyResistanceThreshold[]
  mode: Mode
  showLevel: boolean
  showUnit: boolean
}) {
  const results = useMemo(() => entries.map(entry => ({ entry, ...evaluateDamageThreeSkillRankRow(entry, pairs, mode) })),
    [entries, pairs, mode])
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const errorRow = results.find(row => row.entry.key === errorKey && row.errors.length)
  const showStatus = results.some(row => row.hasUnsupportedTalentDamage || row.errors.length)
  const label = mode === 'virtual' ? '主攻撃を物理・術に変更したダメージ' : '直接ダメージの物理・術内訳'
  return <div className="damage-two-table-wrap dc3-matrix-scroll" tabIndex={0} role="region" aria-label={label}>
    <table className="damage-two-table dc3-matrix-table" aria-label={label}>
      <colgroup span={5 + Number(showLevel) + Number(showUnit) + Number(showStatus)} />
      {pairs.map(pair => <colgroup key={pair.resistance} span={2} />)}
      <thead>
        <tr>
          <th scope="col" rowSpan={3} className="dc3-matrix-operator">オペレーター</th>
          <th scope="col" rowSpan={3} className="dc3-matrix-number">S番号</th>
          <th scope="col" rowSpan={3} className="dc3-matrix-stage">段階</th>
          <th scope="col" rowSpan={3} className="dc3-matrix-name">スキル名</th>
          {showLevel && <th scope="col" rowSpan={3} className="dc3-matrix-metadata">スキルLv</th>}
          {showUnit && <th scope="col" rowSpan={3} className="dc3-matrix-metadata">単位</th>}
          <th scope="col" rowSpan={3} className="dc3-matrix-metadata">算出方法</th>
          {showStatus && <th scope="col" rowSpan={3} className="dc3-matrix-metadata">計算状態</th>}
          {pairs.map(pair => <th key={pair.resistance} scope="colgroup" colSpan={2}>術耐性 {pair.resistance}</th>)}
        </tr>
        <tr>{pairs.map(pair => <th key={pair.resistance} scope="colgroup" colSpan={2}>対応防御力 {formatValue(pair.defense)}</th>)}</tr>
        <tr>{pairs.map(pair => <Fragment key={pair.resistance}>
          <th scope="col">{mode === 'virtual' ? '物理化' : '物理'}</th>
          <th scope="col" className="dc3-matrix-pair-end">{mode === 'virtual' ? '術化' : '術'}</th>
        </Fragment>)}</tr>
      </thead>
      <tbody>{results.map(({ entry, cells, errors, isExpectedValue, hasUnsupportedTalentDamage }) => {
        const stages = entry.structure.guardRecipe?.stages ?? entry.structure.effectStructure.stages
        return <tr key={entry.key}>
          <th scope="row" className="dc3-matrix-operator">{entry.skill.operatorName}</th>
          <td className="dc3-matrix-number">S{entry.skill.skillIndex}</td>
          <td className="dc3-matrix-stage">{stages.length > 1 ? entry.stageLabel : '—'}</td>
          <td className="dc3-matrix-name">{entry.skill.skillName}</td>
          {showLevel && <td className="dc3-matrix-metadata">{entry.structure.basicInfo.skillLevel}</td>}
          {showUnit && <td className="dc3-matrix-metadata">{UNIT[entry.kind]}</td>}
          <td className="dc3-matrix-metadata">{isExpectedValue ? '期待値' : '—'}</td>
          {showStatus && <td className="dc3-matrix-metadata">{errors.length > 0
            ? <button type="button" className="text-button dc3-matrix-status-button" aria-haspopup="dialog" onClick={() => setErrorKey(entry.key)}>
                {cells.some(cell => cell.physical !== null || cell.arts !== null) ? '一部計算不可' : '計算不可'}
              </button>
            : hasUnsupportedTalentDamage ? '一部未対応' : '—'}</td>}
          {cells.map(({ physical, arts }, i) => <Fragment key={pairs[i].resistance}>
            <td className="dc3-matrix-damage">{formatValue(physical)}</td>
            <td className="dc3-matrix-damage dc3-matrix-pair-end">{formatValue(arts)}</td>
          </Fragment>)}
        </tr>
      })}</tbody>
    </table>
    {errorRow && <GoldenglowDetailModal title={`${errorRow.entry.skill.operatorName} S${errorRow.entry.skill.skillIndex} の計算状態`}
      closeLabel="計算状態を閉じる" onClose={() => setErrorKey(null)}>
      {errorRow.errors.map(message => <p key={message}>{message}</p>)}
      {errorRow.hasUnsupportedTalentDamage && <p>素質によるダメージの一部は未対応です。</p>}
    </GoldenglowDetailModal>}
  </div>
}
