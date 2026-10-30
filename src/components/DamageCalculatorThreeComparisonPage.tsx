import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  getDamageThreeComparisonEntries,
  evaluateDamageThreeComparisonEntry,
  DAMAGE_THREE_OUTPUT_KIND_LABELS,
  type DamageThreeComparisonCommon,
  type DamageThreeComparisonEntry,
  type DamageThreeComparisonOverrides,
  type DamageThreeComparisonResult,
} from '../lib/damageCalculatorThreeComparison'
import { PROFESSION_ORDER } from '../lib/operatorFilters'
import { lockPageScroll } from '../lib/pageScrollLock'
import type { SkillRecord } from '../types/skill'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import { TableSortHeader } from './TableSortHeader'
import './SkillDirectory.css'
import './SkillCoarseClassificationPage.css'
import './SkillEffectModal.css'
import './DamageCalculatorThreeComparisonPage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  onOpenOperatorDetail?: OpenOperatorDetail
}

type OutputKind = DamageThreeComparisonEntry['kind']
type Metric = 'actualTargetCount' | 'perAttack' | 'dps' | 'damageOverTimeDps' | 'combinedDps'
type TargetDisplay = 'single' | 'all'
type TableDisplay = 'auto' | 'full' | 'compact'
type ConditionValue = number | string | boolean | undefined
const OUTPUT_KINDS: OutputKind[] = ['NORMAL', 'NEXT_ATTACK', 'COUNTER', 'SKILL_ACTION']
const DAMAGE_TYPE_LABELS: Record<string, string> = { PHYSICAL: '物理', ARTS: '術', TRUE: '確定', MIXED: '混合' }
const ATTACK_LABELS: Record<OutputKind, string> = {
  NORMAL: '1攻撃ダメージ', NEXT_ATTACK: '強化攻撃ダメージ', COUNTER: '反撃ダメージ', SKILL_ACTION: '1動作ダメージ',
}
const METRIC_LABELS = { actualTargetCount: '攻撃対象数', dps: '直接DPS', damageOverTimeDps: '継続DPS', combinedDps: '合計DPS' }
const NORMAL_METRICS: Metric[] = ['combinedDps', 'dps', 'damageOverTimeDps', 'perAttack', 'actualTargetCount']
const ACTION_METRICS: Metric[] = ['perAttack', 'actualTargetCount']
function metricLabel(metric: Metric, kind: OutputKind): string {
  return metric === 'perAttack' ? ATTACK_LABELS[kind] : METRIC_LABELS[metric]
}

function metricValue(result: DamageThreeComparisonResult, metric: Metric, target: TargetDisplay): number | null {
  if (target === 'single' || metric === 'actualTargetCount') return result[metric]
  switch (metric) {
    case 'perAttack': return result.allTargetsPerAttack
    case 'dps': return result.allTargetsDps
    case 'damageOverTimeDps': return result.allTargetsDamageOverTimeDps
    case 'combinedDps': return result.allTargetsCombinedDps
  }
}

function numberFromInput(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value)
}

function resultStatus(result: DamageThreeComparisonResult, customized: boolean, target: TargetDisplay): string {
  if (result.errors.length) return '計算不可'
  if (result.output?.hasUnsupportedTalentDamage) return '一部未対応'
  if (target === 'single' && result.output?.hasRandomTargets) return '1体平均'
  if (result.output?.hasProbabilisticDamage) return '期待値'
  return customized ? '条件変更あり' : '既定条件'
}

export default function DamageCalculatorThreeComparisonPage({ rows, loading, onOpenOperatorDetail }: Props) {
  const [kind, setKind] = useState<OutputKind>('NORMAL')
  const [query, setQuery] = useState('')
  const [profession, setProfession] = useState('ALL')
  const [rarity, setRarity] = useState('ALL')
  const [enemy, setEnemy] = useState({ defense: '0', resistance: '0', enemyCount: '1' })
  const [precision, setPrecision] = useState(0)
  const [target, setTarget] = useState<TargetDisplay>('single')
  const [tableDisplay, setTableDisplay] = useState<TableDisplay>('auto')
  const [panelWidth, setPanelWidth] = useState(0)
  const [measuredFullWidth, setMeasuredFullWidth] = useState<{
    results: DamageThreeComparisonResult[] | null; precision: number; target: TargetDisplay; width: number
  }>({ results: null, precision: 0, target: 'single', width: 0 })
  const panelRef = useRef<HTMLElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const tableRegionRef = useRef<HTMLDivElement>(null)
  const [overrides, setOverrides] = useState<Record<string, DamageThreeComparisonOverrides>>({})
  const [sort, setSort] = useState<{ metric: Metric; direction: 'asc' | 'desc' }>({ metric: 'combinedDps', direction: 'desc' })
  const [detail, setDetail] = useState<{ entry: DamageThreeComparisonEntry; trigger: HTMLButtonElement } | null>(null)
  const metrics = kind === 'NORMAL' ? NORMAL_METRICS : ACTION_METRICS
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const measure = () => setPanelWidth(panel.clientWidth)
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(panel)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  const entries = useMemo(() => getDamageThreeComparisonEntries(rows), [rows])
  const common = useMemo<DamageThreeComparisonCommon>(() => ({
    defense: numberFromInput(enemy.defense), resistance: numberFromInput(enemy.resistance), enemyCount: numberFromInput(enemy.enemyCount),
  }), [enemy])
  const commonErrors = useMemo(() => [
    ...(!Number.isFinite(common.defense) || common.defense < 0 ? ['敵の防御力は0以上で入力してください。'] : []),
    ...(!Number.isFinite(common.resistance) || common.resistance < 0 || common.resistance > 100 ? ['敵の術耐性は0〜100で入力してください。'] : []),
    ...(!Number.isSafeInteger(common.enemyCount) || common.enemyCount < 1 || common.enemyCount > 10000 ? ['敵の数は1〜10000の整数で入力してください。'] : []),
  ], [common])
  const professionOptions = useMemo(() => {
    const labels = new Map(entries.map(({ skill }) => [skill.profession, skill.professionLabel]))
    return PROFESSION_ORDER.filter((value) => labels.has(value)).map((value) => ({ value, label: labels.get(value) }))
  }, [entries])
  const visibleEntries = useMemo(() => {
    const words = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
    return entries.filter((entry) => entry.kind === kind
      && (profession === 'ALL' || entry.skill.profession === profession)
      && (rarity === 'ALL' || entry.skill.rarity === Number(rarity))
      && words.every((word) => `${entry.skill.operatorName} ${entry.skill.skillName} S${entry.skill.skillIndex} ${entry.stageLabel}`
        .normalize('NFKC').toLocaleLowerCase().includes(word)))
  }, [entries, kind, profession, query, rarity])
  const results = useMemo(() => visibleEntries.map((entry) => evaluateDamageThreeComparisonEntry(entry, common, overrides[entry.key])),
    [visibleEntries, common, overrides])
  const sortedResults = useMemo(() => [...results].sort((left, right) => {
    const a = metricValue(left, sort.metric, target)
    const b = metricValue(right, sort.metric, target)
    const aValid = a !== null && Number.isFinite(a)
    const bValid = b !== null && Number.isFinite(b)
    if (!aValid) return bValid ? 1 : 0
    if (!bValid) return -1
    return (a - b) * (sort.direction === 'asc' ? 1 : -1)
  }), [results, sort, target])
  const detailResult = useMemo(() => detail ? evaluateDamageThreeComparisonEntry(detail.entry, common, overrides[detail.entry.key]) : null,
    [detail, common, overrides])
  const formatter = useMemo(() => new Intl.NumberFormat('ja-JP', { minimumFractionDigits: precision, maximumFractionDigits: precision }), [precision])
  const formatNumber = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : formatter.format(value)
  const widthMatchesContent = measuredFullWidth.results === results && measuredFullWidth.precision === precision && measuredFullWidth.target === target
  const fullWidth = Math.max(kind === 'NORMAL' ? 1250 : 950, widthMatchesContent ? measuredFullWidth.width : 0)
  const compact = tableDisplay === 'compact' || (tableDisplay === 'auto' && panelWidth < fullWidth)
  useLayoutEffect(() => {
    // Long names and formatted numbers can require more than the stylesheet's minimum width.
    // Remember that width while compact, so resizing does not alternate between both layouts.
    if (compact || !tableRef.current) return
    const width = tableRef.current.scrollWidth
    if (width > panelWidth) setMeasuredFullWidth((current) => current.results === results && current.precision === precision
      && current.target === target && current.width >= width ? current : { results, precision, target, width })
  }, [compact, kind, panelWidth, results, precision, target])
  const hasFilters = query !== '' || profession !== 'ALL' || rarity !== 'ALL' || kind !== 'NORMAL'
  const updateKind = (value: OutputKind) => {
    setKind(value)
    setSort({ metric: value === 'NORMAL' ? 'combinedDps' : 'perAttack', direction: 'desc' })
  }
  const resetFilters = () => { setQuery(''); setProfession('ALL'); setRarity('ALL'); updateKind('NORMAL') }
  const closeDetail = () => {
    const trigger = detail?.trigger
    const key = detail?.entry.key
    setDetail(null)
    window.requestAnimationFrame(() => {
      // Resizing while the dialog is open may replace the condition button with the status button.
      const replacement = Array.from(tableRef.current?.querySelectorAll<HTMLButtonElement>('[data-condition-key]') ?? [])
        .find((button) => button.dataset.conditionKey === key)
      const focusTarget = trigger?.isConnected ? trigger : replacement ?? tableRegionRef.current
      focusTarget?.focus({ preventScroll: true })
    })
  }
  const updateCondition = (key: string, value: ConditionValue) => {
    if (!detail) return
    setOverrides((current) => ({ ...current, [detail.entry.key]: { ...current[detail.entry.key], [key]: value } }))
  }
  const resetConditions = () => {
    if (!detail) return
    setOverrides((current) => {
      const next = { ...current }
      delete next[detail.entry.key]
      return next
    })
  }
  const sortableHeading = (metric: Metric, label: string) => <TableSortHeader className="dc3-comparison-numeric-heading"
    label={label} sortKey={metric} sort={{ key: sort.metric, direction: sort.direction }}
    onSort={(metric) => setSort((current) => ({ metric,
      direction: current.metric === metric && current.direction === 'desc' ? 'asc' : 'desc' }))} />

  return <section className="dc3-comparison-page">
    <header className="page-intro"><h1>DC3 スキル比較</h1></header>
    <section ref={panelRef} className="skill-directory-panel" aria-label="DC3のスキル比較">
      <div className="skill-directory-filters">
        <div className="filters-heading"><span>絞り込み</span>
          <button type="button" className="filter-reset-button" disabled={!hasFilters} onClick={resetFilters}>条件をリセット</button>
        </div>
        <div className="skill-directory-filter-grid dc3-comparison-filters">
          <label><span>出力型</span><select aria-label="出力型" value={kind} onChange={(event) => updateKind(event.target.value as OutputKind)}>
            {OUTPUT_KINDS.map((value) => <option key={value} value={value}>{DAMAGE_THREE_OUTPUT_KIND_LABELS[value]}</option>)}
          </select></label>
          <label><span>文字検索</span><input type="search" aria-label="文字検索" value={query} placeholder="オペレーター名・スキル名・S番号"
            onChange={(event) => setQuery(event.target.value)} /></label>
          <label><span>職業</span><select aria-label="職業" value={profession} onChange={(event) => setProfession(event.target.value)}>
            <option value="ALL">すべて</option>
            {professionOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label><span>レアリティ</span><select aria-label="レアリティ" value={rarity} onChange={(event) => setRarity(event.target.value)}>
            <option value="ALL">すべて</option>{[6, 5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>★{value}</option>)}
          </select></label>
        </div>
      </div>
      <div className="skill-directory-filters">
        <div className="filters-heading"><span>共通条件</span></div>
        <div className="skill-directory-filter-grid dc3-comparison-conditions">
          <label><span>敵の防御力</span><input type="number" aria-label="敵の防御力" min="0" step="any" value={enemy.defense}
            aria-invalid={!Number.isFinite(common.defense) || common.defense < 0}
            onChange={(event) => setEnemy({ ...enemy, defense: event.target.value })} /></label>
          <label><span>敵の術耐性</span><input type="number" aria-label="敵の術耐性" min="0" max="100" step="any" value={enemy.resistance}
            aria-invalid={!Number.isFinite(common.resistance) || common.resistance < 0 || common.resistance > 100}
            onChange={(event) => setEnemy({ ...enemy, resistance: event.target.value })} /></label>
          <label><span>敵の数</span><input type="number" aria-label="敵の数" min="1" max="10000" step="1" value={enemy.enemyCount}
            aria-invalid={!Number.isSafeInteger(common.enemyCount) || common.enemyCount < 1 || common.enemyCount > 10000}
            onChange={(event) => setEnemy({ ...enemy, enemyCount: event.target.value })} /></label>
          <label><span>ダメージの表示対象</span><select aria-label="ダメージの表示対象" value={target} onChange={(event) => setTarget(event.target.value as TargetDisplay)}>
            <option value="single">1体</option><option value="all">全対象</option>
          </select></label>
          <label><span>小数点以下</span><select aria-label="小数点以下" value={precision} onChange={(event) => setPrecision(Number(event.target.value))}>
            {[0, 1, 2, 3].map((value) => <option key={value} value={value}>{value}桁</option>)}
          </select></label>
        </div>
        <div className="dc3-comparison-build">対応昇進・最大Lv／信頼100／潜在1／MODなし／対応スキルLv</div>
        {commonErrors.length > 0 && <div className="dc3-comparison-errors" role="alert">{commonErrors.map((error) => <p key={error}>{error}</p>)}</div>}
      </div>
      <div className="filters-heading"><span>計算結果</span><span>{DAMAGE_THREE_OUTPUT_KIND_LABELS[kind]}</span></div>
      <div className="skill-directory-filter-grid dc3-comparison-display">
        <label><span>表の表示</span><select aria-label="表の表示" value={tableDisplay} onChange={(event) => setTableDisplay(event.target.value as TableDisplay)}>
          <option value="auto">自動</option><option value="full">全列</option><option value="compact">簡易</option>
        </select></label>
        {compact && <label><span>表示指標</span><select aria-label="表示指標" value={sort.metric}
          onChange={(event) => setSort({ metric: event.target.value as Metric, direction: 'desc' })}>
          {metrics.map((metric) => <option key={metric} value={metric}>{metricLabel(metric, kind)}</option>)}
        </select></label>}
      </div>
      <div className="result-meta dc3-comparison-meta" role="status" aria-live="polite">
        <span>{loading ? '読み込み中…' : `${results.length} 行表示`}</span>
        {!loading && <span>計算可 {results.filter((result) => !result.errors.length).length}／計算不可 {results.filter((result) => result.errors.length).length}</span>}
      </div>
      {!loading && results.length === 0 ? <div className="operator-empty-state" role="status">条件に一致するスキルがありません</div>
        : <div ref={tableRegionRef} className="table-wrap skill-coarse-table-wrap dc3-comparison-table-wrap" role="region" aria-label="スキル比較の計算結果" tabIndex={0}>
          <table ref={tableRef} className={`skill-coarse-table dc3-comparison-table${kind === 'NORMAL' ? ' dc3-comparison-table-normal' : ''}${compact ? ' dc3-comparison-table-compact' : ''}`}>
            <caption className="visually-hidden">{DAMAGE_THREE_OUTPUT_KIND_LABELS[kind]}のスキル比較</caption>
            <thead><tr>
              <th scope="col">{compact ? 'OP' : 'オペレーター'}</th><th scope="col">{compact ? 'S' : 'S番号'}</th>
              {!compact && <th scope="col">スキル名</th>}<th scope="col">段階</th>
              {compact ? sortableHeading(sort.metric, metricLabel(sort.metric, kind)) : <>
                <th scope="col">属性</th>{sortableHeading('actualTargetCount', '攻撃対象数')}{sortableHeading('perAttack', ATTACK_LABELS[kind])}
                {kind === 'NORMAL' && <>{sortableHeading('dps', '直接DPS')}{sortableHeading('damageOverTimeDps', '継続DPS')}{sortableHeading('combinedDps', '合計DPS')}</>}
              </>}
              <th scope="col">状態</th>{!compact && <th scope="col">個別条件</th>}
            </tr></thead>
            <tbody>{!loading && sortedResults.map((result) => {
              const { entry } = result
              const customized = Object.keys(overrides[entry.key] ?? {}).length > 0
              return <tr key={entry.key}>
                <td><OperatorDetailLink operatorId={entry.skill.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}
                  className="skill-coarse-link">{entry.skill.operatorName}</OperatorDetailLink></td>
                <td>{compact ? entry.skill.skillIndex : `S${entry.skill.skillIndex}`}</td>
                {!compact && <td>{entry.skill.skillName}</td>}<td>{entry.stageLabel}</td>
                {compact ? <td className="dc3-comparison-number">{sort.metric === 'actualTargetCount' ? result.actualTargetCount ?? '—' : formatNumber(metricValue(result, sort.metric, target))}</td> : <>
                  <td>{result.damageType ? DAMAGE_TYPE_LABELS[result.damageType] ?? result.damageType : '—'}</td>
                  <td className="dc3-comparison-number">{result.actualTargetCount ?? '—'}</td>
                  <td className="dc3-comparison-number">{formatNumber(metricValue(result, 'perAttack', target))}</td>
                  {kind === 'NORMAL' && <>{(['dps', 'damageOverTimeDps', 'combinedDps'] as const).map((metric) =>
                    <td key={metric} className="dc3-comparison-number">{formatNumber(metricValue(result, metric, target))}</td>)}</>}
                </>}
                <td>{compact ? <button type="button" className="skill-coarse-description-trigger dc3-comparison-status-trigger" aria-haspopup="dialog"
                  data-condition-key={entry.key} aria-label={`${entry.skill.operatorName} S${entry.skill.skillIndex} ${entry.stageLabel}：${resultStatus(result, customized, target)}の詳細と個別条件`}
                  onClick={(event) => setDetail({ entry, trigger: event.currentTarget })}>{resultStatus(result, customized, target)}</button>
                  : resultStatus(result, customized, target)}</td>
                {!compact && <td><button type="button" className="skill-coarse-description-trigger" aria-haspopup="dialog" data-condition-key={entry.key}
                  aria-label={`${entry.skill.operatorName} S${entry.skill.skillIndex} ${entry.stageLabel}の個別条件`}
                  onClick={(event) => setDetail({ entry, trigger: event.currentTarget })}>{customized ? '変更済み' : '設定'}</button></td>}
              </tr>
            })}</tbody>
          </table>
        </div>}
    </section>
    {detailResult && <ComparisonConditionsDialog result={detailResult} customized={Object.keys(overrides[detailResult.entry.key] ?? {}).length > 0}
      target={target} common={common} formatNumber={formatNumber} onChange={updateCondition} onReset={resetConditions} onClose={closeDetail} />}
  </section>
}

function ComparisonConditionsDialog({ result, customized, target, common, formatNumber, onChange, onReset, onClose }: {
  result: DamageThreeComparisonResult
  customized: boolean
  target: TargetDisplay
  common: DamageThreeComparisonCommon
  formatNumber: (value: number | null) => string
  onChange: (key: string, value: ConditionValue) => void
  onReset: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const backdropPointerDownRef = useRef(false)
  const titleId = useId()
  const { entry } = result
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
  const levelLabel = entry.levelIndex < 7 ? `Lv${entry.levelIndex + 1}` : `特化${entry.levelIndex - 6}`
  const formatCondition = (value: number) => Number.isFinite(value) ? String(value) : '—'
  const detailRows = [
    ['スキル名', entry.skill.skillName], ['段階', entry.stageLabel], ['出力型', DAMAGE_THREE_OUTPUT_KIND_LABELS[entry.kind]],
    ['属性', result.damageType ? DAMAGE_TYPE_LABELS[result.damageType] ?? result.damageType : '—'],
    ['敵の防御力', formatCondition(common.defense)], ['敵の術耐性', formatCondition(common.resistance)],
    ['敵の数', Number.isFinite(common.enemyCount) ? String(common.enemyCount) : '—'],
    ['攻撃対象数', result.actualTargetCount ?? '—'], ['ダメージの表示対象', target === 'single' ? '1体' : '全対象'],
    ...(['perAttack', ...(entry.kind === 'NORMAL' ? ['dps', 'damageOverTimeDps', 'combinedDps'] as const : [])] as Metric[])
      .map((metric) => [metricLabel(metric, entry.kind), formatNumber(metricValue(result, metric, target))]),
    ['状態', resultStatus(result, customized, target)], ['個別条件', customized ? '変更済み' : '既定値'],
  ]
  return <dialog ref={dialogRef} className="skill-effect-dialog dc3-comparison-dialog" aria-labelledby={titleId} aria-modal="true"
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onPointerDown={(event) => { backdropPointerDownRef.current = event.target === event.currentTarget }}
    onPointerCancel={() => { backdropPointerDownRef.current = false }}
    onClick={(event) => {
      if (backdropPointerDownRef.current && event.target === event.currentTarget) onClose()
      backdropPointerDownRef.current = false
    }}>
    <div className="skill-effect-modal">
      <header className="skill-effect-modal-header"><h2 id={titleId}>{entry.skill.operatorName} S{entry.skill.skillIndex}／{entry.stageLabel}</h2>
        <button ref={closeRef} type="button" aria-label="詳細を閉じる" onClick={onClose}>×</button></header>
      <div className="skill-effect-modal-body dc3-comparison-dialog-body" role="region" aria-label="スキルの詳細と個別条件" tabIndex={0}>
        <div className="dc3-comparison-build">昇進{entry.phaseIndex} Lv{entry.operatorLevel}／信頼100／潜在1／MODなし／{levelLabel}</div>
        <div className="filters-heading"><span>詳細</span></div>
        <table className="dc3-comparison-detail-table"><caption className="visually-hidden">スキルの詳細と計算結果</caption>
          <tbody>{detailRows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody>
        </table>
        <div className="filters-heading"><span>個別条件</span>
          <button type="button" className="filter-reset-button" disabled={!customized} onClick={onReset}>既定値に戻す</button></div>
        {result.fields.length ? <div className="skill-directory-filter-grid dc3-comparison-individual-fields">
          {result.fields.map((field) => <label key={field.key}><span>{field.label}</span>
            {field.kind === 'number' && !field.options?.length ? <input type="number" aria-label={field.label} min={field.min} max={field.max} step={field.step ?? 'any'}
              value={typeof field.value === 'number' && Number.isFinite(field.value) ? field.value : ''} disabled={field.locked}
              onChange={(event) => onChange(field.key, numberFromInput(event.target.value))} />
              : <select aria-label={field.label} value={String(field.value ?? '')} disabled={field.locked} onChange={(event) => {
                const options = field.options ?? [{ value: true, label: 'あり' }, { value: false, label: 'なし' }]
                const selected = options.find((option) => String(option.value) === event.target.value)
                if (selected) onChange(field.key, selected.value)
              }}>
                {(field.options ?? [{ value: true, label: 'あり' }, { value: false, label: 'なし' }]).map((option) =>
                  <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
              </select>}
          </label>)}
        </div> : <div className="dc3-comparison-build">個別条件なし</div>}
        {result.errors.length > 0 && <div className="dc3-comparison-errors" role="alert">{result.errors.map((reason, index) => <p key={index}>{reason}</p>)}</div>}
        {result.notes.length > 0 && <>
          <div className="filters-heading"><span>計算範囲</span></div>
          <ul className="dc3-comparison-notes">{result.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </>}
      </div>
    </div>
  </dialog>
}
