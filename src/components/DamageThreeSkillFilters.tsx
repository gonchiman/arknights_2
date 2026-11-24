import { DAMAGE_THREE_OUTPUT_KIND_LABELS } from '../lib/damageCalculatorThreeComparison'
import { DAMAGE_TYPE_LABELS, type DamageThreeSkillFilterValues } from '../lib/damageThreeSkillFilters'
import { PageOutputHeader } from './PageLayout'
import './SkillDirectory.css'
import './DamageThreeSkillFilters.css'

interface Props {
  filters: DamageThreeSkillFilterValues
  onChange: (filters: DamageThreeSkillFilterValues) => void
  onReset: () => void
  canReset: boolean
  professionOptions: readonly { value: string; label: string }[]
  allowAllKinds?: boolean
  lockKind?: boolean
  damageTypeLabel?: string
}

const TITLE = '絞り込み'

export function DamageThreeSkillFilters({ filters, onChange, onReset, canReset, professionOptions,
  allowAllKinds = false, lockKind = false, damageTypeLabel = '攻撃属性' }: Props) {
  return <section className="dc3-skill-filters">
    <PageOutputHeader segments={[TITLE]}>
      <div className="dc3-skill-filters-heading">
        <h2>{TITLE}</h2>
        <button type="button" className="filter-reset-button" disabled={!canReset} onClick={onReset}>条件をリセット</button>
      </div>
    </PageOutputHeader>
    <div className="skill-directory-filter-grid">
      <label><span>出力型</span><select aria-label="出力型" value={filters.kind} disabled={lockKind}
        onChange={event => onChange({ ...filters, kind: event.target.value as DamageThreeSkillFilterValues['kind'] })}>
        {allowAllKinds && <option value="ALL">すべて</option>}
        {Object.entries(DAMAGE_THREE_OUTPUT_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label><span>文字検索</span><input type="search" aria-label="文字検索" value={filters.query}
        placeholder="オペレーター名・スキル名・S番号" onChange={event => onChange({ ...filters, query: event.target.value })} /></label>
      <label><span>職業</span><select aria-label="職業" value={filters.profession}
        onChange={event => onChange({ ...filters, profession: event.target.value })}>
        <option value="ALL">すべて</option>
        {professionOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label><span>レアリティ</span><select aria-label="レアリティ" value={filters.rarity}
        onChange={event => onChange({ ...filters, rarity: event.target.value })}>
        <option value="ALL">すべて</option>
        {[6, 5, 4, 3, 2, 1].map(value => <option key={value} value={value}>★{value}</option>)}
      </select></label>
      <label><span>{damageTypeLabel}</span><select aria-label={damageTypeLabel} value={filters.damageType}
        onChange={event => onChange({ ...filters, damageType: event.target.value })}>
        <option value="ALL">すべて</option>
        {Object.entries(DAMAGE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
    </div>
  </section>
}
