import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  buildDamageCalculatorThreeCoverage,
  COVERAGE_STATUS_LABELS,
  COVERAGE_STATUS_OPTIONS,
  COVERAGE_SECTION_STATUS_LABELS,
  type DamageCalculatorThreeCoverageStatus,
} from '../lib/damageCalculatorThreeCoverage'
import {
  canonicalCoverageJson, coverageRecordKey, diffCoverageRecords, loadCoverageIndex, loadCoverageSnapshot, toCoverageRecords,
  type CoverageChange, type CoverageIndex, type CoverageRecord, type CoverageSnapshot, type CoverageVersionInfo,
} from '../lib/damageCalculatorThreeCoverageHistory'
import {
  DEFAULT_DAMAGE_THREE_COVERAGE_FILTERS,
  EMPTY_DAMAGE_THREE_COVERAGE_FILTERS,
  filterDamageCalculatorThreeCoverage,
  type DamageCalculatorThreeCoverageFilters,
} from '../lib/damageCalculatorThreeCoverageFilters'
import { getProfessionLabel, PROFESSION_ORDER } from '../lib/operatorFilters'
import { lockPageScroll } from '../lib/pageScrollLock'
import { createDamageCalculatorThreeHash } from '../lib/routes'
import type { SkillRecord } from '../types/skill'
import { getCoverageChangeLabel } from '../lib/damageCalculatorThreeCoverageComparison'
import { AnalysisTabs, AnalysisTabPanel } from './AnalysisTabs'
import { DamageCalculatorThreeCoverageSummary } from './DamageCalculatorThreeCoverageSummary'
import { DamageCalculatorThreeCoverageVersionComparison } from './DamageCalculatorThreeCoverageVersionComparison'
import { DamageCalculatorThreeModuleCoverage } from './DamageCalculatorThreeModuleCoverage'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import './SkillDirectory.css'
import './SkillCoarseClassificationPage.css'
import './SkillEffectModal.css'
import './DamageCalculatorThreeCoveragePage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  onOpenOperatorDetail: OpenOperatorDetail
}

export { getCoverageChangeLabel } from '../lib/damageCalculatorThreeCoverageComparison'
const COVERAGE_TABS = [['list', '対応一覧'], ['compare', '版の比較'], ['modules', 'MOD対応']] as const
type CoverageTab = typeof COVERAGE_TABS[number][0]

export function DamageCalculatorThreeCoveragePage({ rows, loading, onOpenOperatorDetail }: Props) {
  const [activeTab, setActiveTab] = useState<CoverageTab>('list')
  const [comparisonVisited, setComparisonVisited] = useState(false)
  const [modulesVisited, setModulesVisited] = useState(false)
  const [versionSelection, setVersionSelection] = useState<string[] | null>(null)
  const [filters, setFilters] = useState<DamageCalculatorThreeCoverageFilters>({ ...DEFAULT_DAMAGE_THREE_COVERAGE_FILTERS })
  const [detail, setDetail] = useState<{ row: CoverageRecord; change?: CoverageChange; trigger: HTMLButtonElement;
    historical?: boolean; beforeLabel?: string; afterLabel?: string } | null>(null)
  const [versionId, setVersionId] = useState('CURRENT')
  const [comparisonId, setComparisonId] = useState('')
  const [changesOnly, setChangesOnly] = useState(false)
  const [index, setIndex] = useState<CoverageIndex | null>(null)
  const [indexError, setIndexError] = useState('')
  const [indexLoading, setIndexLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<Record<string, CoverageSnapshot>>({})
  const snapshotCache = useRef<Record<string, CoverageSnapshot>>({})
  const [snapshotErrors, setSnapshotErrors] = useState<Record<string, string>>({})
  const liveCoverageRows = useMemo(() => buildDamageCalculatorThreeCoverage(rows), [rows])
  const liveCoverage = useMemo(() => toCoverageRecords(liveCoverageRows), [liveCoverageRows])
  const selectedIds = useMemo(() => versionSelection ?? index?.versions.map(version => version.id) ?? [], [versionSelection, index])
  const requestedIdsKey = JSON.stringify([...new Set([versionId, comparisonId,
    ...(activeTab === 'compare' ? selectedIds : [])].filter(id => id && id !== 'CURRENT'))])

  useEffect(() => {
    const controller = new AbortController()
    setIndexError('')
    setIndexLoading(true)
    loadCoverageIndex(controller.signal).then(value => {
      if (!controller.signal.aborted) { setIndex(value); setIndexLoading(false) }
    }).catch(error => {
      if (!controller.signal.aborted) {
        setIndexError(error instanceof Error ? error.message : 'バージョン一覧を取得できませんでした。')
        setIndexLoading(false)
      }
    })
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    if (!index) return
    const controller = new AbortController()
    const ids: string[] = JSON.parse(requestedIdsKey)
    for (const id of ids) {
      const version = index.versions.find(value => value.id === id)
      if (!version) continue
      const cacheKey = canonicalCoverageJson(version)
      if (snapshotCache.current[cacheKey]) continue
      setSnapshotErrors(previous => ({ ...previous, [cacheKey]: '' }))
      loadCoverageSnapshot(version, controller.signal).then(snapshot => {
        if (controller.signal.aborted) return
        snapshotCache.current[cacheKey] = snapshot
        setSnapshots(previous => ({ ...previous, [cacheKey]: snapshot }))
      }).catch(error => {
        if (!controller.signal.aborted) setSnapshotErrors(previous => ({ ...previous,
          [cacheKey]: error instanceof Error ? error.message : `${id}を取得できませんでした。` }))
      })
    }
    return () => controller.abort()
  }, [requestedIdsKey, index, retry])

  const selectedVersion = index?.versions.find(version => version.id === versionId)
  const comparisonVersion = index?.versions.find(version => version.id === comparisonId)
  const selectedSnapshot = selectedVersion ? snapshots[canonicalCoverageJson(selectedVersion)] : undefined
  const comparisonSnapshot = comparisonVersion ? snapshots[canonicalCoverageJson(comparisonVersion)] : undefined
  const selectedError = versionId === 'CURRENT' ? '' : indexError || (index && !selectedVersion
    ? `バージョン「${versionId}」がありません。` : selectedVersion ? snapshotErrors[canonicalCoverageJson(selectedVersion)] ?? '' : '')
  const comparisonError = !comparisonId ? '' : indexError || (index && !comparisonVersion
    ? `比較元「${comparisonId}」がありません。` : comparisonVersion ? snapshotErrors[canonicalCoverageJson(comparisonVersion)] ?? '' : '')
  const versionComparisonError = indexError || (index ? selectedIds.map(id => {
    const version = index.versions.find(value => value.id === id)
    return version ? snapshotErrors[canonicalCoverageJson(version)] ?? '' : `バージョン「${id}」がありません。`
  }).find(Boolean) ?? '' : '')
  const versionComparisonLoading = !versionComparisonError && (indexLoading || !index || selectedIds.some(id => {
    const version = index.versions.find(value => value.id === id)
    return version && !snapshots[canonicalCoverageJson(version)]
  }))
  const error = selectedError || comparisonError
  const busy = !error && ((versionId === 'CURRENT' ? loading : !selectedSnapshot) || Boolean(comparisonId && !comparisonSnapshot))
  const coverage = useMemo(() => (versionId === 'CURRENT' ? liveCoverage : selectedSnapshot?.rows ?? [])
    .slice().sort((a, b) => b.skill.rarity - a.skill.rarity || a.skill.operatorName.localeCompare(b.skill.operatorName, 'ja')
      || a.skill.skillIndex - b.skill.skillIndex), [versionId, liveCoverage, selectedSnapshot])
  const changes = useMemo(() => comparisonSnapshot ? diffCoverageRecords(comparisonSnapshot.rows, coverage) : [], [comparisonSnapshot, coverage])
  const changesByKey = useMemo(() => new Map(changes.map(change => [change.key, change])), [changes])
  const tableRows = useMemo(() => [...coverage, ...changes.flatMap(change => change.kind === 'REMOVED' && change.before ? [change.before] : [])], [coverage, changes])
  const visibleRows = useMemo(() => filterDamageCalculatorThreeCoverage(tableRows, filters)
    .filter(row => !comparisonId || !changesOnly || changesByKey.has(coverageRecordKey(row))),
  [tableRows, filters, comparisonId, changesOnly, changesByKey])
  const summaryRows = useMemo(() => visibleRows.filter(row => changesByKey.get(coverageRecordKey(row))?.kind !== 'REMOVED'), [visibleRows, changesByKey])
  const professionOptions = useMemo(() => {
    const labels = new Map(tableRows.map(({ skill }) => [skill.profession, skill.professionLabel]))
    if (filters.profession !== 'ALL' && !labels.has(filters.profession)) labels.set(filters.profession, getProfessionLabel(filters.profession))
    return PROFESSION_ORDER.filter((profession) => labels.has(profession))
      .map((profession) => ({ value: profession, label: labels.get(profession) }))
  }, [tableRows, filters.profession])
  const counts = useMemo(() => COVERAGE_STATUS_OPTIONS.map(({ value, label }) =>
    `${label} ${summaryRows.filter((row) => row.status === value).length}`), [summaryRows])
  const hasFilters = filters.query.trim() !== '' || filters.profession !== 'ALL'
    || filters.rarity !== 'ALL' || filters.status !== 'ALL'

  const closeDetail = () => {
    const trigger = detail?.trigger
    setDetail(null)
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    })
  }

  return (
    <section className="damage-three-coverage-page">
      <header className="page-intro"><h1>DC3 実装範囲</h1></header>
      <AnalysisTabs tabs={COVERAGE_TABS} activeTab={activeTab} onChange={tab => {
        setActiveTab(tab)
        if (tab === 'compare') setComparisonVisited(true)
        if (tab === 'modules') setModulesVisited(true)
      }} idPrefix="dc3-coverage" label="実装範囲の表示" />
      <AnalysisTabPanel idPrefix="dc3-coverage" tab="list" activeTab={activeTab} title="対応一覧">
      <section className="skill-directory-panel" aria-label="DC3の対応スキル一覧">
        <div className="skill-directory-filter-grid damage-three-coverage-history-controls">
          <label><span>バージョン</span><select aria-label="バージョン" value={versionId}
            onChange={event => { setVersionId(event.target.value); setDetail(null) }}>
            <option value="CURRENT">現在の実装</option>
            {index?.versions.map(version => <option key={version.id} value={version.id}>{version.label}</option>)}
          </select></label>
          <label><span>比較元</span><select aria-label="比較元" value={comparisonId}
            onChange={event => { setComparisonId(event.target.value); setDetail(null) }}>
            <option value="">比較なし</option>
            {index?.versions.map(version => <option key={version.id} value={version.id}>{version.label}</option>)}
          </select></label>
          <label className="damage-three-coverage-changes-only"><input type="checkbox" checked={changesOnly}
            disabled={!comparisonId} onChange={event => setChangesOnly(event.target.checked)} /><span>変更のみ</span></label>
          <button type="button" className="button secondary" disabled={!index}
            aria-haspopup="dialog" onClick={() => setHistoryOpen(true)}>版の履歴</button>
        </div>
        {(indexError || error) && <div className="damage-three-coverage-history-error" role="alert">
          <span>{error || indexError}</span><button type="button" className="button secondary" onClick={() => setRetry(value => value + 1)}>再読み込み</button>
        </div>}
        <div className="skill-directory-filters">
          <div className="filters-heading">
            <span>絞り込み</span>
            <button type="button" className="filter-reset-button" disabled={!hasFilters}
              onClick={() => setFilters({ ...EMPTY_DAMAGE_THREE_COVERAGE_FILTERS })}>条件をリセット</button>
          </div>
          <div className="skill-directory-filter-grid skill-coarse-filters">
            <label className="skill-directory-search">
              <span>文字検索</span>
              <input type="search" value={filters.query} placeholder="オペレーター名・スキル名・S番号"
                onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
            </label>
            <label>
              <span>職業</span>
              <select aria-label="職業" value={filters.profession}
                onChange={(event) => setFilters({ ...filters, profession: event.target.value })}>
                <option value="ALL">すべて</option>
                {professionOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>レアリティ</span>
              <select aria-label="レアリティ" value={filters.rarity} onChange={(event) => setFilters({ ...filters,
                rarity: event.target.value === 'ALL' ? 'ALL' : Number(event.target.value),
              })}>
                <option value="ALL">すべて</option>
                {[6, 5, 4, 3, 2, 1].map((rarity) => <option key={rarity} value={rarity}>★{rarity}</option>)}
              </select>
            </label>
            <label>
              <span>総合の状況</span>
              <select aria-label="総合の状況" value={filters.status} onChange={(event) => setFilters({ ...filters,
                status: event.target.value as DamageCalculatorThreeCoverageStatus | 'ALL',
              })}>
                <option value="ALL">すべて</option>
                {COVERAGE_STATUS_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>
        {!busy && !error && <DamageCalculatorThreeCoverageSummary rows={summaryRows}
          title={comparisonId ? '選択版の対応状況' : '絞り込み結果の対応状況'} />}
        <div className="result-meta damage-three-coverage-meta" role="status" aria-live="polite">
          <span>{error ? '読み込み失敗' : busy ? '読み込み中…' : `${visibleRows.length} / ${tableRows.length} スキル表示`}</span>
          {!busy && !error && <span>{counts.join('・')}</span>}
          {!busy && !error && comparisonId && <span>変更 {visibleRows.filter(row => changesByKey.has(coverageRecordKey(row))).length}件</span>}
        </div>
        {!busy && !error && (visibleRows.length === 0 ? (
          <div className="operator-empty-state" role="status">{comparisonId && changesOnly ? '条件に一致する変更はありません' : '条件に一致するスキルがありません'}</div>
        ) : <DamageCalculatorThreeCoverageTable rows={visibleRows} changes={comparisonId ? changesByKey : undefined}
          onOpenOperatorDetail={onOpenOperatorDetail} onDetail={(row, trigger, change) => setDetail({ row, trigger, change })} />)}
      </section>
      </AnalysisTabPanel>
      <AnalysisTabPanel idPrefix="dc3-coverage" tab="compare" activeTab={activeTab} title="版の比較">
        {comparisonVisited && <DamageCalculatorThreeCoverageVersionComparison versions={index?.versions ?? []}
          snapshots={snapshots} selectedIds={selectedIds} onSelectedIdsChange={setVersionSelection}
          loading={versionComparisonLoading} error={versionComparisonError} onRetry={() => setRetry(value => value + 1)}
          onDetail={(change, before, after, trigger) => {
            const row = change.after ?? change.before
            if (row) setDetail({ row, change, trigger, historical: true, beforeLabel: before.label, afterLabel: after.label })
          }} />}
      </AnalysisTabPanel>
      <AnalysisTabPanel idPrefix="dc3-coverage" tab="modules" activeTab={activeTab} title="MOD対応">
        {modulesVisited && (loading ? <div className="result-meta" role="status">読み込み中…</div>
          : <DamageCalculatorThreeModuleCoverage rows={liveCoverageRows} />)}
      </AnalysisTabPanel>
      {detail && <DamageCalculatorThreeCoverageDialog row={detail.row} change={detail.change}
        historical={detail.historical ?? (versionId !== 'CURRENT' || detail.change?.kind === 'REMOVED')}
        beforeLabel={detail.beforeLabel ?? comparisonVersion?.label} afterLabel={detail.afterLabel ?? selectedVersion?.label ?? '現在の実装'} onClose={closeDetail} />}
      {historyOpen && index && <DamageCalculatorThreeCoverageHistoryDialog versions={index.versions} onClose={() => setHistoryOpen(false)} />}
    </section>
  )
}

export function DamageCalculatorThreeCoverageHistoryDialog({ versions, onClose }: {
  versions: readonly CoverageVersionInfo[]
  onClose: () => void
}) {
  return <GoldenglowDetailModal title="版の履歴" closeLabel="版の履歴を閉じる" onClose={onClose}>
    <div className="table-wrap skill-coarse-table-wrap" role="region" aria-label="実装範囲の保存履歴" tabIndex={0}>
      <table className="skill-coarse-table damage-three-coverage-history-table">
        <caption className="visually-hidden">実装範囲の保存履歴</caption>
        <thead><tr><th scope="col">バージョン</th><th scope="col">記録日時</th><th scope="col">記録方法</th>
          <th scope="col">スキル数</th><th scope="col">コード</th><th scope="col">ゲームデータ</th></tr></thead>
        <tbody>{versions.map(version => <tr key={version.id}>
          <th scope="row">{version.label}</th><td>{new Date(version.capturedAt).toLocaleString('ja-JP', { timeZoneName: 'short' })}</td>
          <td>{version.source.reconstructed ? '過去コードを記録時のゲームデータで再集計' : '保存時の実装を記録'}</td>
          <td>{version.skillCount}</td>
          <td>版 {version.source.codeRevision}{version.source.codeDirty ? '（未コミットの変更を含む）' : ''}{'\n'}SHA-256 {version.source.codeFingerprint}</td>
          <td>版 {version.source.gameDataRevision}{'\n'}SHA-256 {version.source.gameDataFingerprint}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </GoldenglowDetailModal>
}

export function DamageCalculatorThreeCoverageTable({ rows, changes, onOpenOperatorDetail, onDetail }: {
  rows: readonly CoverageRecord[]
  changes?: ReadonlyMap<string, CoverageChange>
  onOpenOperatorDetail: OpenOperatorDetail
  onDetail: (row: CoverageRecord, trigger: HTMLButtonElement, change?: CoverageChange) => void
}) {
  return <div className="table-wrap skill-coarse-table-wrap" role="region" aria-label="DC3の対応スキル" tabIndex={0}>
    <table className={`skill-coarse-table damage-three-coverage-table${changes ? ' damage-three-coverage-comparison-table' : ''}`}>
      <caption className="visually-hidden">DC3の区分別の実装状況</caption>
      <thead><tr>
        <th scope="col">オペレーター</th><th scope="col">S番号</th><th scope="col">スキル名</th>
        <th scope="col">スキル</th><th scope="col">素質</th><th scope="col">特性</th><th scope="col">総合</th>
        {changes && <><th scope="col">変更</th><th scope="col">比較元の総合</th><th scope="col">変更項目</th></>}
        <th scope="col">詳細</th>
      </tr></thead>
      <tbody>{rows.map(row => {
        const key = coverageRecordKey(row), change = changes?.get(key)
        const removed = change?.kind === 'REMOVED'
        return <tr key={key} data-coverage-change={change?.kind}>
          <td><OperatorDetailLink operatorId={row.skill.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}
            className="skill-coarse-link">{row.skill.operatorName}</OperatorDetailLink></td>
          <td>S{row.skill.skillIndex}</td><td>{row.skill.skillName}</td>
          <td>{removed ? '—' : COVERAGE_SECTION_STATUS_LABELS[row.sections.skill]}</td>
          <td>{removed ? '—' : COVERAGE_SECTION_STATUS_LABELS[row.sections.talent]}</td>
          <td>{removed ? '—' : COVERAGE_SECTION_STATUS_LABELS[row.sections.trait]}</td>
          <td>{removed ? '—' : COVERAGE_STATUS_LABELS[row.status]}</td>
          {changes && <>
            <td>{change ? getCoverageChangeLabel(change) : '—'}</td>
            <td>{change?.before ? COVERAGE_STATUS_LABELS[change.before.status] : change?.kind === 'ADDED' ? '—' : COVERAGE_STATUS_LABELS[row.status]}</td>
            <td className="damage-three-coverage-change-fields">{change?.fields.join('・') || '—'}</td>
          </>}
          <td><button type="button" className="skill-coarse-description-trigger" aria-haspopup="dialog"
            aria-label={`${row.skill.operatorName} S${row.skill.skillIndex}の対応詳細`}
            onClick={event => onDetail(row, event.currentTarget, change)}>詳細</button></td>
        </tr>
      })}</tbody>
    </table>
  </div>
}

function coverageChangeValue(field: string, row: CoverageRecord | undefined): string {
  if (!row) return 'カタログに存在しない'
  if (field === '総合' || field === 'カタログ') return COVERAGE_STATUS_LABELS[row.status]
  if (field === 'スキル情報') return `${row.skill.operatorName} S${row.skill.skillIndex} ${row.skill.skillName}・${row.skill.professionLabel}・★${row.skill.rarity}・${row.skill.subProfessionName}`
  if (field === '計算条件') return row.conditionsLabel ?? (row.selection ? '育成条件の記録なし' : '—')
  if (field === 'スキル' || field === '素質' || field === '特性') {
    const section = field === 'スキル' ? 'skill' : field === '素質' ? 'talent' : 'trait'
    const details = row.details.filter(detail => field === '素質' ? detail.id.startsWith('talent-')
      : detail.id === (field === 'スキル' ? 'skill' : 'trait'))
      .map(detail => `${detail.label} ${detail.name}：${COVERAGE_SECTION_STATUS_LABELS[detail.status]}`)
    return [`${field}：${COVERAGE_SECTION_STATUS_LABELS[row.sections[section]]}`, ...details].join('\n')
  }
  if (field === '計算範囲') return row.calculationScope.join('\n') || '—'
  if (field === '対応条件') return row.supportedConditions.join('\n') || '—'
  if (field === '保留理由') return row.deferredReasons.join('\n') || '—'
  if (field === '対象範囲') return row.scopeNotes.join('\n') || '—'
  if (field === '保留事項') return row.issues.map(issue => `${issue.relatedSections.join('・')}：${issue.reason}\n${
    issue.impact === 'OUTSIDE_SCOPE' ? '計算範囲外' : issue.supportedCondition ?? '保留'}${issue.currentTreatment ? `・${issue.currentTreatment}` : ''}`).join('\n') || '—'
  return '—'
}

export function DamageCalculatorThreeCoverageDialog({ row, change, historical = false, beforeLabel = '比較元', afterLabel = '選択版', onClose }: {
  row: CoverageRecord
  change?: CoverageChange
  historical?: boolean
  beforeLabel?: string
  afterLabel?: string
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const backdropPointerDownRef = useRef(false)
  const titleId = useId()
  const { skill } = row
  const facts: [string, string][] = [
    ['スキル名', skill.skillName],
    ['総合', COVERAGE_STATUS_LABELS[row.status]],
    ...(row.selection ? [['共通条件', row.conditionsLabel ?? (historical ? '育成条件の記録なし' : '昇進2・特化3・潜在1・MODなし')] as [string, string]] : []),
    ...row.calculationScope.map((value): [string, string] => ['計算範囲', value]),
    ...row.supportedConditions.map((value): [string, string] => ['対応条件', value]),
    ...row.scopeNotes.map((value): [string, string] => ['対象範囲', value]),
  ]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus())
    const unlockScroll = lockPageScroll(document.documentElement)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      unlockScroll()
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog ref={dialogRef} className="skill-effect-dialog damage-three-coverage-dialog"
      aria-labelledby={titleId} aria-modal="true"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onPointerDown={(event) => { backdropPointerDownRef.current = event.target === event.currentTarget }}
      onPointerCancel={() => { backdropPointerDownRef.current = false }}
      onClick={(event) => {
        if (backdropPointerDownRef.current && event.target === event.currentTarget) onClose()
        backdropPointerDownRef.current = false
      }}>
      <div className="skill-effect-modal">
        <header className="skill-effect-modal-header">
          <h2 id={titleId}>{skill.operatorName} S{skill.skillIndex}</h2>
          <button ref={closeRef} type="button" aria-label="対応詳細を閉じる" onClick={onClose}>×</button>
        </header>
        <div className="skill-effect-modal-body" role="region" aria-label="スキルの対応詳細" tabIndex={0}>
          {change && <div className="table-wrap skill-coarse-table-wrap damage-three-coverage-detail-wrap"
            role="region" aria-label="バージョン間の変更内容" tabIndex={0}>
            <table className="skill-coarse-table damage-three-coverage-change-table">
              <caption className="visually-hidden">{skill.operatorName} S{skill.skillIndex}の変更内容</caption>
              <thead><tr><th scope="col">変更項目</th><th scope="col">{beforeLabel}</th><th scope="col">{afterLabel}</th></tr></thead>
              <tbody>{change.fields.map(field => <tr key={field}><th scope="row">{field}</th>
                <td>{coverageChangeValue(field, change.before)}</td><td>{coverageChangeValue(field, change.after)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          <div className="table-wrap skill-coarse-table-wrap damage-three-coverage-detail-wrap"
            role="region" aria-label="区分別の実装状況" tabIndex={0}>
            <table className="skill-coarse-table damage-three-coverage-sections-table">
              <caption className="visually-hidden">{skill.operatorName} S{skill.skillIndex}の区分別の実装状況</caption>
              <thead><tr><th scope="col">区分</th><th scope="col">項目</th><th scope="col">実装状況</th></tr></thead>
              <tbody>{row.details.map((section) => <tr key={section.id}>
                <th scope="row">{section.label}</th><td>{section.name}</td>
                <td>{COVERAGE_SECTION_STATUS_LABELS[section.status]}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="table-wrap skill-coarse-table-wrap damage-three-coverage-detail-wrap"
            role="region" aria-label="計算範囲と対応条件" tabIndex={0}>
            <table className="skill-coarse-table damage-three-coverage-detail-table">
              <caption className="visually-hidden">{skill.operatorName} S{skill.skillIndex}の計算範囲</caption>
              <thead><tr><th scope="col">項目</th><th scope="col">内容</th></tr></thead>
              <tbody>{facts.map(([label, value], index) => <tr key={`${label}-${index}`}>
                <th scope="row">{label}</th><td>{value}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {row.issues.length > 0 && <div className="table-wrap skill-coarse-table-wrap damage-three-coverage-detail-wrap"
            role="region" aria-label="保留事項と関連区分" tabIndex={0}>
            <table className="skill-coarse-table damage-three-coverage-issues-table">
              <caption className="visually-hidden">{skill.operatorName} S{skill.skillIndex}の保留事項と関連区分</caption>
              <thead><tr><th scope="col">関連区分</th><th scope="col">保留事項</th><th scope="col">現在の対応</th></tr></thead>
              <tbody>{row.issues.map((issue) => <tr key={issue.id}>
                <th scope="row">{issue.relatedSections.join('・')}</th><td>{issue.reason}</td>
                <td>{issue.impact === 'OUTSIDE_SCOPE' ? '計算範囲外' : issue.supportedCondition ?? '保留'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          {row.selection && <div className="damage-three-coverage-actions">
            <a className="button" href={createDamageCalculatorThreeHash(row.selection)}>{historical ? '現在の計算機3で開く' : '計算機3で開く'}</a>
          </div>}
        </div>
      </div>
    </dialog>
  )
}
