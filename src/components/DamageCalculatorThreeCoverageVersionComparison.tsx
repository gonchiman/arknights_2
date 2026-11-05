import { Fragment, useMemo, useState, type CSSProperties } from 'react'
import { COVERAGE_STATUS_LABELS, COVERAGE_STATUS_OPTIONS } from '../lib/damageCalculatorThreeCoverage'
import {
  compareCoverageVersionRows, getCoverageChangeLabel, summarizeCoverageVersions,
  type CoverageComparisonFilters,
} from '../lib/damageCalculatorThreeCoverageComparison'
import {
  canonicalCoverageJson, type CoverageChange, type CoverageSnapshot, type CoverageVersionInfo,
} from '../lib/damageCalculatorThreeCoverageHistory'
import { COVERAGE_SUMMARY_SECTIONS } from '../lib/damageCalculatorThreeCoverageSummary'
import { getProfessionLabel, PROFESSION_ORDER } from '../lib/operatorFilters'
import { CoverageStackedBars } from './CoverageStackedBars'
import { COVERAGE_CATEGORIES, COVERAGE_COLORS } from './DamageCalculatorThreeCoverageSummary'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './SkillDirectory.css'
import './SkillCoarseClassificationPage.css'
import './DamageCalculatorThreeCoverageVersionComparison.css'

interface Props {
  versions: readonly CoverageVersionInfo[]
  snapshots: Readonly<Record<string, CoverageSnapshot>>
  selectedIds: readonly string[]
  onSelectedIdsChange: (ids: string[]) => void
  loading: boolean
  error: string
  onRetry: () => void
  onDetail: (change: CoverageChange, before: CoverageVersionInfo, after: CoverageVersionInfo,
    trigger: HTMLButtonElement) => void
}

type VersionSummary = ReturnType<typeof summarizeCoverageVersions>[number]
interface ComparisonPair {
  before: CoverageVersionInfo
  after: CoverageVersionInfo
  changes: CoverageChange[]
}

const number = (value: number) => value.toLocaleString('ja-JP')
const signed = (value: number) => value > 0 ? `+${number(value)}` : value < 0 ? `−${number(-value)}` : '0'
const versionOrder = (a: CoverageVersionInfo, b: CoverageVersionInfo) => Number(a.id.slice(1)) - Number(b.id.slice(1))
const overallCount = (entry: VersionSummary, status: string) =>
  entry.summary.sections.find(section => section.key === 'overall')?.buckets.find(bucket => bucket.status === status)?.count ?? 0

export function DamageCalculatorThreeCoverageVersionComparison({ versions, snapshots, selectedIds,
  onSelectedIdsChange, loading, error, onRetry, onDetail }: Props) {
  const [filters, setFilters] = useState<CoverageComparisonFilters>({ profession: 'ALL', rarity: 'ALL' })
  const [openPair, setOpenPair] = useState<{ before: string; after: string } | null>(null)
  const orderedVersions = useMemo(() => [...versions].sort(versionOrder), [versions])
  const selectedVersions = useMemo(() => orderedVersions.filter(version => selectedIds.includes(version.id)),
    [orderedVersions, selectedIds])
  const unknownVersion = selectedIds.find(id => !versions.some(version => version.id === id))
  const effectiveError = error || (!loading && unknownVersion ? `バージョン「${unknownVersion}」がありません。` : '')
  const missingSnapshot = selectedVersions.some(version => !snapshots[canonicalCoverageJson(version)])
  const busy = loading || (!effectiveError && missingSnapshot)
  const entries = useMemo(() => busy || effectiveError ? []
    : summarizeCoverageVersions(orderedVersions, snapshots, selectedIds, filters),
  [busy, effectiveError, orderedVersions, snapshots, selectedIds, filters])
  const pairs = useMemo<ComparisonPair[]>(() => entries.slice(1).map((entry, index) => {
    const before = entries[index].version, after = entry.version
    return { before, after, changes: compareCoverageVersionRows(
      snapshots[canonicalCoverageJson(before)].rows, snapshots[canonicalCoverageJson(after)].rows, filters,
    ) }
  }), [entries, snapshots, filters])
  const activePair = pairs.find(pair => pair.before.id === openPair?.before && pair.after.id === openPair?.after)
  const hasRows = entries.some(entry => entry.summary.count > 0)
  const sameCount = entries.length > 0 && entries.every(entry => entry.summary.count === entries[0].summary.count)
  const population = sameCount ? `${number(entries[0].summary.count)}スキル`
    : entries.map(entry => `${entry.version.id} ${number(entry.summary.count)}スキル`).join('・')

  return <section className="skill-directory-panel damage-three-version-comparison" aria-label="バージョンごとの実装範囲">
    <fieldset className="damage-three-version-picker">
      <legend>比較する版</legend>
      {orderedVersions.map(version => <label key={version.id}>
        <input type="checkbox" checked={selectedIds.includes(version.id)} onChange={event => {
          setOpenPair(null)
          onSelectedIdsChange(event.target.checked ? [...selectedIds, version.id] : selectedIds.filter(id => id !== version.id))
        }} />
        <span>{version.label}</span>
      </label>)}
    </fieldset>
    <div className="skill-directory-filters">
      <div className="skill-directory-filter-grid damage-three-version-filters">
        <label><span>職業</span><select aria-label="比較する職業" value={filters.profession}
          onChange={event => { setOpenPair(null); setFilters({ ...filters, profession: event.target.value }) }}>
          <option value="ALL">すべて</option>
          {PROFESSION_ORDER.map(profession => <option key={profession} value={profession}>{getProfessionLabel(profession)}</option>)}
        </select></label>
        <label><span>レアリティ</span><select aria-label="比較するレアリティ" value={filters.rarity}
          onChange={event => { setOpenPair(null); setFilters({ ...filters,
            rarity: event.target.value === 'ALL' ? 'ALL' : Number(event.target.value) }) }}>
          <option value="ALL">すべて</option>
          {[6, 5, 4, 3, 2, 1].map(rarity => <option key={rarity} value={rarity}>★{rarity}</option>)}
        </select></label>
      </div>
    </div>
    {effectiveError ? <div className="damage-three-version-error" role="alert">
      <span>{effectiveError}</span><button type="button" className="button secondary" onClick={onRetry}>再読み込み</button>
    </div> : busy ? <div className="operator-empty-state" role="status">読み込み中…</div>
      : versions.length === 0 ? <div className="operator-empty-state" role="status">保存された版がありません</div>
        : selectedVersions.length === 0 ? <div className="operator-empty-state" role="status">比較する版を選択してください</div>
          : !hasRows ? <div className="operator-empty-state" role="status">条件に一致するスキルがありません</div>
            : <div className="damage-three-version-content">
              <div className="damage-three-version-chart-heading">
                <h3>区分別の対応状況</h3><span role="status" aria-live="polite">{population}</span>
              </div>
              <div className="coverage-stacked-bars">
                <ul className="coverage-stacked-legend damage-three-version-legend" aria-label="実装状況の凡例">
                  {COVERAGE_CATEGORIES.map(category => <li key={category.key}>
                    <span className="coverage-stacked-swatch" aria-hidden="true"
                      style={{ '--coverage-bar-color': category.color } as CSSProperties} />{category.label}
                  </li>)}
                </ul>
                <div className="damage-three-version-charts">
                  {COVERAGE_SUMMARY_SECTIONS.map((section, index) => <CoverageStackedBars key={section.key}
                    title={section.label} categories={COVERAGE_CATEGORIES} showLegend={false}
                    rows={entries.map(entry => ({
                      key: `${section.key}-${entry.version.id}`, label: entry.version.id,
                      total: entry.summary.count, unit: 'スキル', countUnit: '件', summary: <></>,
                      buckets: entry.summary.sections[index].buckets.map(bucket => ({
                        key: bucket.status, label: bucket.label, count: bucket.count, color: COVERAGE_COLORS[bucket.status],
                      })),
                    }))} />)}
                </div>
              </div>
              <div className="damage-three-version-count-heading"><h3>総合の件数</h3><span>単位：スキル</span></div>
              <CoverageVersionSummaryTable entries={entries} />
              <div className="damage-three-version-pairs">
                {pairs.map(pair => <div className="damage-three-version-pair" key={`${pair.before.id}-${pair.after.id}`}>
                  <span>{pair.before.id} → {pair.after.id}</span>
                  <span>新規対応 {number(pair.changes.filter(change => getCoverageChangeLabel(change) === '新規対応').length)}
                    ・登録追加 {number(pair.changes.filter(change => getCoverageChangeLabel(change) === '登録追加').length)}</span>
                  <button type="button" className="button secondary" aria-haspopup="dialog"
                    aria-label={`${pair.before.id}から${pair.after.id}の変更スキル ${pair.changes.length}件`}
                    onClick={() => setOpenPair({ before: pair.before.id, after: pair.after.id })}>
                    変更スキル {number(pair.changes.length)}</button>
                </div>)}
              </div>
            </div>}
    {activePair && <GoldenglowDetailModal title={`${activePair.before.id} → ${activePair.after.id}　変更スキル ${number(activePair.changes.length)}件`}
      closeLabel="変更スキル一覧を閉じる" className="damage-three-version-changes-dialog" onClose={() => setOpenPair(null)}>
      <CoverageVersionChangesTable changes={activePair.changes} before={activePair.before} after={activePair.after} onDetail={onDetail} />
    </GoldenglowDetailModal>}
  </section>
}

export function CoverageVersionSummaryTable({ entries }: { entries: readonly VersionSummary[] }) {
  return <div className="table-wrap skill-coarse-table-wrap" role="region" aria-label="各版の総合対応件数" tabIndex={0}>
    <table className="skill-coarse-table damage-three-version-count-table">
      <caption className="visually-hidden">各版の総合対応件数</caption>
      <thead><tr><th scope="col">版</th>{COVERAGE_STATUS_OPTIONS.map(status =>
        <th key={status.value} scope="col" className="skill-coarse-count">{status.label}</th>)}
      <th scope="col" className="skill-coarse-count">合計</th></tr></thead>
      <tbody>{entries.map((entry, index) => <Fragment key={entry.version.id}>
        <tr><th scope="row">{entry.version.id}</th>{COVERAGE_STATUS_OPTIONS.map(status =>
          <td key={status.value} className="skill-coarse-count">{number(overallCount(entry, status.value))}</td>)}
        <td className="skill-coarse-count">{number(entry.summary.count)}</td></tr>
        {index > 0 && <tr className="damage-three-version-delta"><th scope="row">{entry.version.id} − {entries[index - 1].version.id}</th>
          {COVERAGE_STATUS_OPTIONS.map(status => <td key={status.value} className="skill-coarse-count">
            {signed(overallCount(entry, status.value) - overallCount(entries[index - 1], status.value))}</td>)}
          <td className="skill-coarse-count">{signed(entry.summary.count - entries[index - 1].summary.count)}</td>
        </tr>}
      </Fragment>)}</tbody>
    </table>
  </div>
}

export function CoverageVersionChangesTable({ changes, before, after, onDetail }: {
  changes: readonly CoverageChange[]
  before: CoverageVersionInfo
  after: CoverageVersionInfo
  onDetail: Props['onDetail']
}) {
  const sorted = useMemo(() => [...changes].sort((a, b) => {
    const first = a.after ?? a.before!, second = b.after ?? b.before!
    return first.skill.operatorName.localeCompare(second.skill.operatorName, 'ja') || first.skill.skillIndex - second.skill.skillIndex
  }), [changes])
  if (!sorted.length) return <div className="operator-empty-state" role="status">変更されたスキルはありません</div>
  return <div className="table-wrap skill-coarse-table-wrap" role="region" aria-label="版間で変更されたスキル" tabIndex={0}>
    <table className="skill-coarse-table damage-three-version-changes-table">
      <caption className="visually-hidden">{before.label}から{after.label}で変更されたスキル</caption>
      <thead><tr><th scope="col">オペレーター</th><th scope="col">S番号</th><th scope="col">スキル名</th>
        <th scope="col">{before.id}</th><th scope="col">{after.id}</th><th scope="col">変更</th><th scope="col">詳細</th></tr></thead>
      <tbody>{sorted.map(change => {
        const row = change.after ?? change.before!
        return <tr key={change.key}>
          <td>{row.skill.operatorName}</td><td>S{row.skill.skillIndex}</td><td>{row.skill.skillName}</td>
          <td>{change.before ? COVERAGE_STATUS_LABELS[change.before.status] : '—'}</td>
          <td>{change.after ? COVERAGE_STATUS_LABELS[change.after.status] : '—'}</td>
          <td>{getCoverageChangeLabel(change)}</td>
          <td><button type="button" className="skill-coarse-description-trigger" aria-haspopup="dialog"
            aria-label={`${row.skill.operatorName} S${row.skill.skillIndex}の変更詳細`}
            onClick={event => onDetail(change, before, after, event.currentTarget)}>詳細</button></td>
        </tr>
      })}</tbody>
    </table>
  </div>
}
