import { useId, useMemo, useState } from 'react'
import {
  buildAttributeEffectCatalog,
  filterAttributeEffectCatalog,
  summarizeAttributeEffects,
  type AttributeEffectCatalogFilters,
  type AttributeEffectRow,
} from '../lib/attributeEffectCatalog'
import type { OperatorTalentRecord, SkillRecord } from '../types/skill'
import { ATTRIBUTE_EFFECT_CATALOG_VERSIONS } from '../lib/attributeEffectCatalogVersions'
import { compareAttributeEffectCatalogVersions } from '../lib/attributeEffectCatalogDiff'
import { AnalysisTabPanel } from './AnalysisTabs'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { PageLayout, PageOutputHeader, PageOutputTabs } from './PageLayout'
import './SkillDirectory.css'
import './DamageThreeSkillFilters.css'
import './DamageCalculatorTwo.css'
import './AttributeEffectCatalogPage.css'

const ATTRIBUTE_LABELS = { physical: '物理', arts: '術' } as const
const HEADINGS = ['オペレーター', '出典', '名称', '対象属性', '効果', '効果量', '適用条件']
const DEFAULT_FILTERS: AttributeEffectCatalogFilters = { attribute: 'all', source: 'all', query: '' }
const TABS = [['summary', '効果別'], ['details', '素質・スキル別'], ['changes', '前版との差分']] as const
const ATTRIBUTES = ['physical', 'arts'] as const
const LATEST = ATTRIBUTE_EFFECT_CATALOG_VERSIONS[0]
type Tab = typeof TABS[number][0]
type Selection = Pick<AttributeEffectRow, 'effect' | 'attribute'>

export function AttributeEffectCatalogPage({ rows, operators, loading }: { rows: SkillRecord[]; operators: OperatorTalentRecord[]; loading: boolean }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [version, setVersion] = useState<string>(LATEST.version)
  const [tab, setTab] = useState<Tab>('summary')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [sourceDetail, setSourceDetail] = useState<AttributeEffectRow | null>(null)
  const tabs = { idPrefix: useId(), activeTab: tab }
  const live = useMemo(() => buildAttributeEffectCatalog(rows, operators), [rows, operators])
  const hasUnreleased = useMemo(() => !loading && operators.length > 0
    && compareAttributeEffectCatalogVersions(LATEST.rows, live).length > 0, [live, loading, operators])
  const isLive = version === 'live' && hasUnreleased
  const selectedIndex = Math.max(0, ATTRIBUTE_EFFECT_CATALOG_VERSIONS.findIndex(item => item.version === version))
  const release = ATTRIBUTE_EFFECT_CATALOG_VERSIONS[selectedIndex]
  const catalog = isLive ? live : release.rows
  const previous = isLive ? LATEST : ATTRIBUTE_EFFECT_CATALOG_VERSIONS[selectedIndex + 1]
  const selectedLabel = isLive ? '現在のデータ' : release.version
  const effects = useMemo(() => filterAttributeEffectCatalog(catalog, filters), [catalog, filters])
  const changes = useMemo(() => {
    if (!previous) return []
    return compareAttributeEffectCatalogVersions(previous.rows, catalog).filter(({ row, previous: before }) =>
      filterAttributeEffectCatalog(before ? [row, before] : [row], filters).length > 0)
  }, [catalog, previous, filters])
  const summary = useMemo(() => summarizeAttributeEffects(effects), [effects])
  const details = selection
    ? effects.filter(row => row.effect === selection.effect && row.attribute === selection.attribute)
    : effects
  const canReset = filters.attribute !== 'all' || filters.source !== 'all' || filters.query !== '' || selection !== null

  function changeFilters(next: AttributeEffectCatalogFilters) {
    setFilters(next)
    setSelection(null)
  }

  function showDetails(next: Selection | null) {
    setSelection(next)
    setTab('details')
    document.getElementById(`${tabs.idPrefix}-tab-details`)?.focus()
  }

  return <PageLayout page="attribute-effects" className="attribute-catalog" settings={
    <section className="dc3-skill-filters" aria-label="絞り込み">
      <PageOutputHeader segments={['絞り込み']}>
        <div className="dc3-skill-filters-heading">
          <h2>絞り込み</h2>
          <button type="button" className="filter-reset-button" disabled={!canReset}
            onClick={() => changeFilters(DEFAULT_FILTERS)}>条件をリセット</button>
        </div>
      </PageOutputHeader>
      <div className="skill-directory-filter-grid">
        <label><span>掲載版</span>
          <select value={isLive ? 'live' : release.version} onChange={event => {
            setVersion(event.target.value)
            setSelection(null)
            setSourceDetail(null)
          }}>
            {ATTRIBUTE_EFFECT_CATALOG_VERSIONS.map(item =>
              <option key={item.version} value={item.version}>{item.version}{item === LATEST ? '（最新版）' : ''}</option>)}
            {hasUnreleased && <option value="live">現在のデータ（未収録）</option>}
          </select>
        </label>
        <label><span>対象属性</span>
          <select aria-label="対象属性" value={filters.attribute}
            onChange={event => changeFilters({ ...filters, attribute: event.target.value as AttributeEffectCatalogFilters['attribute'] })}>
            <option value="all">すべて</option>
            <option value="physical">{ATTRIBUTE_LABELS.physical}</option>
            <option value="arts">{ATTRIBUTE_LABELS.arts}</option>
          </select>
        </label>
        <label><span>出典</span>
          <select aria-label="出典" value={filters.source}
            onChange={event => changeFilters({ ...filters, source: event.target.value as AttributeEffectCatalogFilters['source'] })}>
            <option value="all">すべて</option>
            <option value="talent">素質</option>
            <option value="skill">スキル</option>
          </select>
        </label>
        <label><span>オペレーター・名称</span>
          <input type="search" value={filters.query} autoComplete="off"
            onChange={event => changeFilters({ ...filters, query: event.target.value })} />
        </label>
      </div>
    </section>
  }>
    <PageOutputTabs {...tabs} tabs={TABS} label="一覧の切り替え" onChange={next => {
      if (next !== tab) {
        setSelection(null)
        setTab(next)
      }
    }} />
    <AnalysisTabPanel {...tabs} tab="summary">
      <div className="attribute-catalog-results">
        <div className="attribute-catalog-summary" role="status">
          {summary.length}種類・{effects.length.toLocaleString('ja-JP')}件
        </div>
        <div className="damage-two-table-wrap" role="region" aria-label="効果別の表" tabIndex={0}>
          <table className="damage-two-table attribute-catalog-counts" aria-label="効果別の登録件数">
            <thead><tr><th scope="col">効果</th>{ATTRIBUTES.map(attribute =>
              <th key={attribute} scope="col">{ATTRIBUTE_LABELS[attribute]}（件）</th>)}</tr></thead>
            <tbody>
              {summary.map(row => <tr key={row.effect}>
                <th scope="row">{row.effect}</th>
                {ATTRIBUTES.map(attribute => <td key={attribute}>
                  {row[attribute] > 0 ? <button type="button" className="attribute-catalog-count"
                    aria-label={`${row.effect}・${ATTRIBUTE_LABELS[attribute]}の${row[attribute]}件を表示`}
                    onClick={() => showDetails({ effect: row.effect, attribute })}>{row[attribute]}</button> : 0}
                </td>)}
              </tr>)}
              {!summary.length && <tr><td colSpan={3}>該当する効果はありません。</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AnalysisTabPanel>
    <AnalysisTabPanel {...tabs} tab="details">
      <div className="attribute-catalog-results">
        <div className="attribute-catalog-summary">
          <span role="status">{selection && `${selection.effect}・${ATTRIBUTE_LABELS[selection.attribute]}　`}
            確認済み {details.length.toLocaleString('ja-JP')}件</span>
          {selection && <button type="button" className="filter-reset-button" onClick={() => showDetails(null)}>選択を解除</button>}
        </div>
        <CatalogTable entries={details.map(row => ({ row }))} onSource={setSourceDetail} />
      </div>
    </AnalysisTabPanel>
    <AnalysisTabPanel {...tabs} tab="changes">
      <div className="attribute-catalog-results">
        <header className="attribute-catalog-release-header">
          <div className="attribute-catalog-release-heading">
            <h2>{previous && `${previous.version} → `}{selectedLabel} の更新内容</h2>
            {previous && <span className="attribute-catalog-summary" role="status">
              {canReset && '絞り込み後　'}追加 {changes.filter(item => item.kind === 'added').length}件
              ・変更 {changes.filter(item => item.kind === 'changed').length}件
              ・削除 {changes.filter(item => item.kind === 'removed').length}件
            </span>}
          </div>
          {!isLive && <p className="attribute-catalog-release-summary">{release.summary}</p>}
        </header>
        {previous && <CatalogTable showChanges entries={changes.flatMap(({ kind, row, previous: before }) => {
          if (kind === 'changed') return [{ row: before, label: '変更前' }, { row, label: '変更後' }]
          return [{ row, label: kind === 'added' ? '追加' : '削除' }]
        })} onSource={setSourceDetail} />}
      </div>
    </AnalysisTabPanel>
    <p className="attribute-catalog-baseline">最大昇進・潜在1・モジュールなし・スキル最大ランク</p>
    {sourceDetail && <GoldenglowDetailModal title={`${sourceDetail.operatorName} · ${sourceDetail.name}`}
      closeLabel="効果の原文を閉じる" onClose={() => setSourceDetail(null)}>
      {sourceDetail.description}
    </GoldenglowDetailModal>}
  </PageLayout>
}

function CatalogTable({ entries, showChanges = false, onSource }: {
  entries: { row: AttributeEffectRow; label?: string }[]
  showChanges?: boolean
  onSource: (row: AttributeEffectRow) => void
}) {
  const title = showChanges ? '属性限定効果の変更一覧' : '属性限定効果一覧'
  return <div className="damage-two-table-wrap" role="region" aria-label={title + 'の表'} tabIndex={0}>
    <table className="damage-two-table attribute-catalog-table" aria-label={title}>
      <thead><tr>{HEADINGS.map(heading => <th key={heading} scope="col">{heading}</th>)}
        {showChanges && <th scope="col">変更区分</th>}</tr></thead>
      <tbody>
        {entries.map(({ row, label }) => <tr key={row.id + (label ?? '')}>
          <th scope="row">{row.operatorName}</th>
          <td>{row.sourceLabel}</td>
          <td>{row.href === null
            ? <button type="button" className="attribute-catalog-source" aria-haspopup="dialog" onClick={() => onSource(row)}>{row.name}</button>
            : <a href={row.href}>{row.name}</a>}</td>
          <td>{ATTRIBUTE_LABELS[row.attribute]}</td>
          <td>{row.effect}</td>
          <td className="attribute-catalog-amount">{row.amount}</td>
          <td className="attribute-catalog-condition">{row.condition}</td>
          {showChanges && <td>{label}</td>}
        </tr>)}
        {!entries.length && <tr><td colSpan={HEADINGS.length + Number(showChanges)}>
          {showChanges ? '該当する変更はありません。' : '該当する効果はありません。'}
        </td></tr>}
      </tbody>
    </table>
  </div>
}
