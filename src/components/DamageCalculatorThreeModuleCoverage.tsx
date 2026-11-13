import { useId, useMemo, useState } from 'react'
import {
  COVERAGE_STATUS_LABELS,
  type DamageCalculatorThreeCoverageRow,
} from '../lib/damageCalculatorThreeCoverage'
import {
  buildDamageCalculatorThreeModuleCoverage,
  filterDamageCalculatorThreeModuleCoverage,
  MODULE_COVERAGE_LEVELS,
  MODULE_COVERAGE_STATUSES,
  MODULE_COVERAGE_STATUS_LABELS,
  summarizeDamageCalculatorThreeModuleCoverage,
  type DamageCalculatorThreeModuleCoverageRow,
  type DamageCalculatorThreeModuleCoverageStage,
  type DamageCalculatorThreeModuleCoverageStatus,
} from '../lib/damageCalculatorThreeModuleCoverage'
import { getModuleEffectStructure } from '../lib/moduleEffectStructure'
import { createTalentStructureHash } from '../lib/routes'
import { CoverageStackedBars } from './CoverageStackedBars'
import { COVERAGE_COLORS } from './DamageCalculatorThreeCoverageSummary'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { StructureTable } from './StructureTable'
import './SkillStructurePage.css'
import './DamageCalculatorThreeModuleCoverage.css'

const PAGE_SIZE = 50
const STATUS_COLORS = { ...COVERAGE_COLORS, UNSTARTED: COVERAGE_COLORS.UNSUPPORTED }
const CHART_CATEGORIES = MODULE_COVERAGE_STATUSES.map(status => ({
  key: status,
  label: MODULE_COVERAGE_STATUS_LABELS[status],
  color: STATUS_COLORS[status],
}))
const formatCount = (count: number) => count.toLocaleString('ja-JP')

interface SelectedStage {
  row: DamageCalculatorThreeModuleCoverageRow
  stage: DamageCalculatorThreeModuleCoverageStage
}

export function DamageCalculatorThreeModuleCoverage({ rows }: {
  rows: readonly DamageCalculatorThreeCoverageRow[]
}) {
  const chartTitleId = useId()
  const [query, setQuery] = useState('')
  const [moduleType, setModuleType] = useState('ALL')
  const [status, setStatus] = useState<DamageCalculatorThreeModuleCoverageStatus | 'ALL'>('ALL')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<SelectedStage | null>(null)
  const moduleRows = useMemo(() => buildDamageCalculatorThreeModuleCoverage(rows), [rows])
  const moduleTypes = useMemo(() => [...new Set(moduleRows.map(row => row.moduleType))]
    .sort((left, right) => left.localeCompare(right, 'ja')), [moduleRows])
  const summary = useMemo(() => summarizeDamageCalculatorThreeModuleCoverage(moduleRows), [moduleRows])
  const filteredRows = useMemo(() => filterDamageCalculatorThreeModuleCoverage(moduleRows, {
    query, moduleType, status,
  }), [moduleRows, query, moduleType, status])
  const pageCount = Math.ceil(filteredRows.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const start = currentPage * PAGE_SIZE
  const visibleRows = filteredRows.slice(start, start + PAGE_SIZE)
  const displayRange = visibleRows.length ? `${formatCount(start + 1)}–${formatCount(start + visibleRows.length)}` : '0'

  return <section className="skill-directory-panel damage-three-module-coverage" aria-label="MOD対応一覧">
    <section className="damage-three-coverage-summary" aria-labelledby={chartTitleId}>
      <header className="filters-heading damage-three-coverage-summary-heading">
        <h2 id={chartTitleId}>全候補の対応状況</h2>
        <span>{formatCount(summary.rowCount)}組 · {formatCount(summary.stageCount)}段階</span>
      </header>
      {summary.stageCount === 0
        ? <p className="damage-three-coverage-summary-empty">集計対象のMODがありません</p>
        : <div className="damage-three-coverage-summary-body">
          <CoverageStackedBars categories={CHART_CATEGORIES} showCountPercent={false}
            rows={summary.levels.map(({ level, total, counts }) => ({
              key: `module-level-${level}`,
              label: `Lv.${level}`,
              total,
              unit: '件',
              buckets: CHART_CATEGORIES.map(category => ({ ...category, count: counts[category.key] })),
            }))} />
        </div>}
    </section>

    <div className="skill-directory-filters damage-three-module-filters">
      <div className="skill-directory-filter-grid damage-three-module-filter-grid">
        <label className="skill-directory-search">
          <span>文字検索</span>
          <input type="search" value={query} placeholder="オペレーター名・スキル名・S番号"
            onChange={event => { setQuery(event.target.value); setPage(0) }} />
        </label>
        <label>
          <span>MOD</span>
          <select value={moduleType} onChange={event => { setModuleType(event.target.value); setPage(0) }}>
            <option value="ALL">すべて</option>
            {moduleTypes.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          <span>段階の状態</span>
          <select value={status} onChange={event => {
            setStatus(event.target.value as DamageCalculatorThreeModuleCoverageStatus | 'ALL')
            setPage(0)
          }}>
            <option value="ALL">すべて</option>
            {MODULE_COVERAGE_STATUSES.map(value => <option key={value} value={value}>
              {MODULE_COVERAGE_STATUS_LABELS[value]}
            </option>)}
          </select>
        </label>
      </div>
    </div>

    <div className="result-meta damage-three-module-meta">
      <span role="status">{displayRange} / {formatCount(filteredRows.length)}組</span>
      {pageCount > 1 && <nav className="damage-three-module-pagination" aria-label="MOD対応一覧のページ切り替え">
        <button type="button" className="button secondary" disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}>前へ</button>
        <span>{currentPage + 1} / {pageCount}</span>
        <button type="button" className="button secondary" disabled={currentPage + 1 >= pageCount}
          onClick={() => setPage(currentPage + 1)}>次へ</button>
      </nav>}
    </div>

    {visibleRows.length ? <div className="table-wrap skill-coarse-table-wrap"
      role="region" aria-label="MOD対応一覧のスクロール領域" tabIndex={0}>
      <table className="skill-coarse-table damage-three-module-table">
        <caption className="visually-hidden">スキルとMODの段階別対応状況</caption>
        <thead><tr>
          <th scope="col">オペレーター</th>
          <th scope="col">スキル</th>
          <th scope="col">MOD</th>
          {MODULE_COVERAGE_LEVELS.map(level => <th key={level} scope="col">Lv.{level}</th>)}
        </tr></thead>
        <tbody>{visibleRows.map(row => <tr key={row.id}>
          <th scope="row">{row.skill.operatorName}</th>
          <td>S{row.skill.skillIndex} {row.skill.skillName}</td>
          <td>{row.moduleType}</td>
          {MODULE_COVERAGE_LEVELS.map(level => {
            const stage = row.stages.find(item => item.level === level)
            if (!stage) return <td key={level}>—</td>
            const statusLabel = MODULE_COVERAGE_STATUS_LABELS[stage.status]
            return <td key={level}>
              <button type="button" className="button secondary damage-three-module-stage" aria-haspopup="dialog"
                aria-label={`${row.skill.operatorName} S${row.skill.skillIndex} MOD ${row.moduleType} Lv.${level} ${statusLabel}の詳細`}
                onClick={event => {
                  event.currentTarget.focus({ preventScroll: true })
                  setSelected({ row, stage })
                }}>{statusLabel}</button>
            </td>
          })}
        </tr>)}</tbody>
      </table>
    </div> : <div className="operator-empty-state">条件に一致する候補はありません</div>}

    {selected && <ModuleStageDialog selected={selected}
      onStageChange={stage => setSelected({ row: selected.row, stage })}
      onClose={() => setSelected(null)} />}
  </section>
}

function ModuleStageDialog({ selected: { row, stage }, onStageChange, onClose }: {
  selected: SelectedStage
  onStageChange: (stage: DamageCalculatorThreeModuleCoverageStage) => void
  onClose: () => void
}) {
  const { available, rows: effects, otherChanges } = getModuleEffectStructure(row.skill, row.module, stage.level)
  const linkedTalents = new Map(effects.flatMap(effect => effect.talentIndex === undefined
    ? [] : [[effect.talentIndex, effect.talentName] as const]))

  return <GoldenglowDetailModal
    title={`${row.skill.operatorName} S${row.skill.skillIndex} · MOD ${row.moduleType} Lv.${stage.level}`}
    closeLabel="MOD段階の詳細を閉じる" onClose={onClose} className="damage-three-module-dialog">
    {row.stages.length > 1 && <div className="skill-directory-filter-grid damage-three-module-detail-picker">
      <label>
        <span>MOD段階</span>
        <select value={stage.level} onChange={event => {
          const next = row.stages.find(candidate => String(candidate.level) === event.target.value)
          if (next) onStageChange(next)
        }}>
          {row.stages.map(candidate => <option key={candidate.level} value={candidate.level}>Lv.{candidate.level}</option>)}
        </select>
      </label>
    </div>}
    <dl className="damage-three-module-detail">
      <dt>MOD名</dt><dd>{row.moduleName}</dd>
      <dt>DC3対応状況</dt><dd>{MODULE_COVERAGE_STATUS_LABELS[stage.status]}</dd>
      <dt>未装備の総合</dt><dd>{COVERAGE_STATUS_LABELS[row.baselineStatus]}</dd>
      {!available && <><dt>MOD効果</dt><dd>データなし</dd></>}
    </dl>
    {effects.length > 0 && <section className="damage-three-module-effects">
      <h3 className="skill-structure-subheading">MOD効果の構造</h3>
      <StructureTable caption="MOD効果の構造" headers={['区分', '項目', '条件', '効果']}
        className="damage-three-module-effects-table">
        {effects.map(effect => <tr key={effect.id}>
          <td>{effect.category}</td><th scope="row">{effect.item}</th>
          <td>{effect.condition}</td><td className="damage-three-module-effect-value">{effect.value}</td>
        </tr>)}
      </StructureTable>
      {linkedTalents.size > 0 && <div className="damage-three-module-talent-links">
        {[...linkedTalents].map(([talentIndex, talentName]) => <a key={talentIndex} className="skill-structure-effect-link"
          href={createTalentStructureHash({
            operatorId: row.skill.operatorId, talentIndex, moduleId: row.moduleId, moduleLevel: stage.level,
          })}>{talentName ? `${talentName}の素質構造を見る` : `素質${talentIndex + 1}の構造を見る`}</a>)}
      </div>}
    </section>}
    {otherChanges.length > 0 && <section className="damage-three-module-original-effects">
      <h3 className="skill-structure-subheading">MOD効果の説明</h3>
      <ul>{otherChanges.map(({ label, description }, index) => <li key={index}>
        <strong>{label}</strong> {description}
      </li>)}</ul>
    </section>}
  </GoldenglowDetailModal>
}
