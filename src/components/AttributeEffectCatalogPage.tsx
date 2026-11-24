import { useMemo, useState } from 'react'
import {
  buildAttributeEffectCatalog,
  filterAttributeEffectCatalog,
  type AttributeEffectCatalogFilters,
} from '../lib/attributeEffectCatalog'
import type { SkillRecord } from '../types/skill'
import { PageLayout, PageOutputHeader } from './PageLayout'
import './SkillDirectory.css'
import './DamageThreeSkillFilters.css'
import './DamageCalculatorTwo.css'
import './AttributeEffectCatalogPage.css'

const ATTRIBUTE_LABELS = { physical: '物理', arts: '術' } as const
const HEADINGS = ['オペレーター', '出典', '名称', '対象属性', '効果', '効果量', '適用条件']
const DEFAULT_FILTERS: AttributeEffectCatalogFilters = { attribute: 'all', source: 'all', query: '' }

export function AttributeEffectCatalogPage({ rows, loading }: { rows: SkillRecord[]; loading: boolean }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const catalog = useMemo(() => buildAttributeEffectCatalog(rows), [rows])
  const effects = useMemo(() => filterAttributeEffectCatalog(catalog, filters), [catalog, filters])
  const canReset = filters.attribute !== 'all' || filters.source !== 'all' || filters.query !== ''

  return <PageLayout page="attribute-effects" className="attribute-catalog" settings={
    <section className="dc3-skill-filters" aria-label="絞り込み">
      <PageOutputHeader segments={['絞り込み']}>
        <div className="dc3-skill-filters-heading">
          <h2>絞り込み</h2>
          <button type="button" className="filter-reset-button" disabled={!canReset}
            onClick={() => setFilters(DEFAULT_FILTERS)}>条件をリセット</button>
        </div>
      </PageOutputHeader>
      <div className="skill-directory-filter-grid">
        <label><span>対象属性</span>
          <select aria-label="対象属性" value={filters.attribute}
            onChange={event => setFilters({ ...filters, attribute: event.target.value as AttributeEffectCatalogFilters['attribute'] })}>
            <option value="all">すべて</option>
            <option value="physical">{ATTRIBUTE_LABELS.physical}</option>
            <option value="arts">{ATTRIBUTE_LABELS.arts}</option>
          </select>
        </label>
        <label><span>出典</span>
          <select aria-label="出典" value={filters.source}
            onChange={event => setFilters({ ...filters, source: event.target.value as AttributeEffectCatalogFilters['source'] })}>
            <option value="all">すべて</option>
            <option value="talent">素質</option>
            <option value="skill">スキル</option>
          </select>
        </label>
        <label><span>オペレーター・名称</span>
          <input type="search" value={filters.query} autoComplete="off"
            onChange={event => setFilters({ ...filters, query: event.target.value })} />
        </label>
      </div>
    </section>
  }>
    <section aria-label="効果一覧" className="attribute-catalog-results" aria-busy={loading}>
      <PageOutputHeader segments={['表']}>
        <div className="attribute-catalog-summary">
          <h2>効果一覧</h2>
          <span aria-live="polite">{loading ? '読み込み中…' : `確認済み ${effects.length.toLocaleString('ja-JP')}件`}</span>
        </div>
      </PageOutputHeader>
      <div className="damage-two-table-wrap" role="region" aria-label="属性限定効果の表" tabIndex={0}>
        <table className="damage-two-table attribute-catalog-table" aria-label="属性限定効果一覧">
          <thead><tr>{HEADINGS.map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
          <tbody>
            {!loading && effects.map(row => <tr key={row.id}>
              <th scope="row">{row.operatorName}</th>
              <td>{row.sourceLabel}</td>
              <td><a href={row.href}>{row.name}</a></td>
              <td>{ATTRIBUTE_LABELS[row.attribute]}</td>
              <td>{row.effect}</td>
              <td className="attribute-catalog-amount">{row.amount}</td>
              <td>{row.condition}</td>
            </tr>)}
            {!loading && effects.length === 0 && <tr><td colSpan={HEADINGS.length}>該当する効果はありません。</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="attribute-catalog-baseline">最大昇進・潜在1・モジュールなし・スキル最大ランク</p>
    </section>
  </PageLayout>
}
