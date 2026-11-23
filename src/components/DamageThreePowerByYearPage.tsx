import { useEffect, useId, useMemo, useState } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import {
  loadCoverageIndex, loadCoverageSnapshot, type CoverageSnapshot,
} from '../lib/damageCalculatorThreeCoverageHistory'
import {
  buildDamageThreePowerByYear, type PowerYearEnemy, type PowerYearMetric, type PowerYearResult, type PowerYearRow, type PowerYearUnit,
} from '../lib/damageThreePowerByYear'
import type { SkillRecord } from '../types/skill'
import { AnalysisTabPanel, AnalysisTabs } from './AnalysisTabs'
import { PageLayout, PageOutputHeader } from './PageLayout'
import { PageViewSwitch, TABLE_CHART_VIEWS, viewLabel, type TableChartView } from './PageViewSwitch'
import './DamageCalculatorTwo.css'
import './DamageThreePowerByYearPage.css'

const BREAKDOWNS = [['all', '全体'], ['attribute', '物理・術別']] as const
type Breakdown = typeof BREAKDOWNS[number][0]
const VIEWS = [TABLE_CHART_VIEWS[1], TABLE_CHART_VIEWS[0]] as const
const ENEMIES = [['zero', '防御0・術耐性0'], ['standard', '防御120・術耐性20']] as const
const UNITS = [['operator', 'オペレーター'], ['skill', 'スキル']] as const
const METRICS = [['dps', '段階DPS'], ['total', '期間総ダメージ'], ['gain', '増加ダメージ']] as const
const DURATIONS = [['30', '30秒'], ['60', '60秒'], ['120', '120秒']] as const
const INCOMING_INTERVALS = [['0', 'なし'], ['2', '2秒ごと'], ['4', '4秒ごと']] as const
const CONDITIONS = '共通条件'
const COUNT_LABELS = {
  operator: { count: '人数', suffix: '人', all: '全員' },
  skill: { count: 'スキル数', suffix: '件', all: '全件' },
} as const
const ATTRIBUTES = [['physical', '物理のみ'], ['arts', '術のみ']] as const
const COVERAGE_ID = 'v11'
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const RELEASE_DATE = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeZone: 'Asia/Tokyo' })
const formatValue = (value: number | null) => value === null ? '—' : NUMBER.format(value)

interface PageProps {
  rows: readonly SkillRecord[]
  loading: boolean
  error?: string | null
  onRetry?: () => void
}

export default function DamageThreePowerByYearPage({ rows, loading, error, onRetry }: PageProps) {
  const idPrefix = useId()
  const [breakdown, setBreakdown] = useState<Breakdown>('all')
  const [view, setView] = useState<TableChartView>('chart')
  const [enemy, setEnemy] = useState<PowerYearEnemy>('zero')
  const [unit, setUnit] = useState<PowerYearUnit>('operator')
  const [metric, setMetric] = useState<PowerYearMetric>('dps')
  const [duration, setDuration] = useState<typeof DURATIONS[number][0]>('60')
  const [incoming, setIncoming] = useState<typeof INCOMING_INTERVALS[number][0]>('2')
  const [snapshot, setSnapshot] = useState<CoverageSnapshot | null>(null)
  const [snapshotError, setSnapshotError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    async function load() {
      try {
        const index = await loadCoverageIndex(signal)
        const version = index.versions.find(item => item.id === COVERAGE_ID)
        if (!version) throw new Error(`DC3 ${COVERAGE_ID}の実装範囲が見つかりません。`)
        const data = await loadCoverageSnapshot(version, signal)
        if (!signal.aborted) setSnapshot(data)
      } catch (reason) {
        if (!signal.aborted) setSnapshotError(reason instanceof Error ? reason.message : '実装範囲を取得できませんでした。')
      }
    }
    void load()
    return () => controller.abort()
  }, [attempt])

  const result = useMemo(() => snapshot && !loading && !error
    ? buildDamageThreePowerByYear(rows, snapshot, enemy, unit, metric, Number(duration), incoming === '0' ? null : Number(incoming))
    : null, [rows, snapshot, enemy, unit, metric, duration, incoming, loading, error])
  const timed = metric !== 'dps'
  const metricLabel = viewLabel(METRICS, metric)
  const medianLabel = `${timed ? duration + '秒の' : ''}${metricLabel}中央値`
  const breakdownLabel = viewLabel(BREAKDOWNS, breakdown)
  const split = breakdown === 'attribute'
  const tabProps = { idPrefix, activeTab: metric }
  const loadError = error || snapshotError
  const retry = () => {
    if (error) onRetry?.()
    if (snapshotError) {
      setSnapshotError('')
      setAttempt(previous => previous + 1)
    }
  }

  return <PageLayout page="damage-three-power-by-year" className="power-year-page" settings={<>
    <PageOutputHeader segments={[CONDITIONS]}><h2>{CONDITIONS}</h2></PageOutputHeader>
    <div className="power-year-settings">
      <strong>集計単位</strong>
      <PageViewSwitch views={UNITS} selected={unit} onChange={setUnit} label="集計単位" />
    </div>
    <label className="power-year-settings">
      <strong>敵条件</strong>
      <select value={enemy} onChange={event => setEnemy(event.target.value as PowerYearEnemy)}>
        {ENEMIES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select>
    </label>
  </>}>
    <PageOutputHeader segments={[metricLabel, breakdownLabel, viewLabel(VIEWS, view)]}>
      <AnalysisTabs {...tabProps} tabs={METRICS} onChange={setMetric} label="指標" appearance="underline" />
    </PageOutputHeader>
    {METRICS.map(([key]) => <AnalysisTabPanel key={key} {...tabProps} tab={key}>
      {metric === key && <>
        {timed && <div className="power-year-period">
          <div className="power-year-settings">
            <strong>配置後の時間</strong>
            <PageViewSwitch views={DURATIONS} selected={duration} onChange={setDuration} label="配置後の時間" />
          </div>
          <label className="power-year-settings">
            <strong>敵からの被撃</strong>
            <select value={incoming} onChange={event => setIncoming(event.target.value as typeof incoming)}>
              {INCOMING_INTERVALS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select>
          </label>
        </div>}
        <div className="power-year-tools">
          <div className="power-year-settings">
            <strong>内訳</strong>
            <PageViewSwitch views={BREAKDOWNS} selected={breakdown} onChange={setBreakdown} label="内訳" />
          </div>
          <PageViewSwitch views={VIEWS} selected={view} onChange={setView} label="表示形式" />
        </div>
        {loadError ? <div className="power-year-status" role="alert">
          <span>{loadError}</span>
          {(onRetry || snapshotError) && <button className="button secondary" onClick={retry} type="button">再読み込み</button>}
        </div> : !result ? <p role="status">火力データを読み込んでいます…</p>
          : result.years.length === 0 ? <p role="status">集計対象の{viewLabel(UNITS, unit)}は0{COUNT_LABELS[unit].suffix}です。</p> : <>
            <div className="power-year-summary">
              <h2>{medianLabel}</h2>
              <div className="power-year-note">
                <span>採用 {result.total.count} / {result.total.rosterCount}{COUNT_LABELS[unit].suffix}</span>
                {timed && <span>未算出 {result.total.rosterCount - result.total.count}{COUNT_LABELS[unit].suffix}</span>}
              </div>
            </div>
            {split && view === 'chart' && <div className="power-year-key" aria-label="属性の凡例">
              {ATTRIBUTES.map(([type, label], i) => <span key={type}>
                <i className={`power-year-color-${type}`} aria-hidden="true" />{i === 0 ? '上段' : '下段'} {label}
              </span>)}
            </div>}
            {view === 'chart'
              ? <PowerYearChart result={result} split={split} label={breakdownLabel} unit={unit} medianLabel={medianLabel} metric={metric} />
              : <PowerYearTable result={result} split={split} label={breakdownLabel} unit={unit} medianLabel={medianLabel} />}
            {split && <div className="power-year-note">物理のみ・術のみの比較から除外　{result.total.otherCount}{COUNT_LABELS[unit].suffix}（混合属性など）</div>}
          </>}
        <footer className="power-year-meta">
          <span>★6・昇進2 Lv.90・特化3</span><span>敵1体</span>
          {timed ? <>
            <span>初期SPから開始・常時接敵・発動可能時に即発動（推計）</span>
            {metric === 'gain' && <span>通常攻撃のみとの差</span>}
            {unit === 'operator' && <span>各人の最大値を採用</span>}
          </> : <span>{unit === 'operator' ? '各人の最高DPSを採用' : '各スキルでDPSが最大の段階を採用'}</span>}
          <span>DC3 {COVERAGE_ID}</span>
          {result?.latestReleaseDate && <span>日本版実装日 <time dateTime={result.latestReleaseDate}>
            {RELEASE_DATE.format(new Date(result.latestReleaseDate))}
          </time>まで</span>}
        </footer>
      </>}
    </AnalysisTabPanel>)}
  </PageLayout>
}

interface OutputProps {
  result: PowerYearResult
  split: boolean
  label: string
  unit: PowerYearUnit
  medianLabel: string
}

function PowerYearTable({ result, split, label, unit, medianLabel }: OutputProps) {
  const title = `${viewLabel(UNITS, unit)}単位・${label}の${medianLabel}`
  const countLabel = COUNT_LABELS[unit].count
  function row({ year, count, rosterCount, median, physical, arts }: PowerYearRow) {
    return <tr key={year ?? 'total'}>
      <th scope="row">{year ?? '全期間'}</th>
      {split ? <>
        <td>{formatValue(physical.median)}</td><td>{physical.count}</td>
        <td>{formatValue(arts.median)}</td><td>{arts.count}</td>
      </> : <><td>{count}</td><td>{rosterCount}</td><td>{formatValue(median)}</td></>}
    </tr>
  }
  return <div className="damage-two-table-wrap" role="region" tabIndex={0} aria-label={title}>
    <table className={`damage-two-table power-year-table${split ? ' is-split' : ''}`} aria-label={title}>
      <thead><tr><th scope="col">実装年</th>
        {split ? <>
          <th scope="col">物理のみ<wbr /> {medianLabel}</th><th scope="col" aria-label={`物理のみの${countLabel}`}>{countLabel}</th>
          <th scope="col">術のみ<wbr /> {medianLabel}</th><th scope="col" aria-label={`術のみの${countLabel}`}>{countLabel}</th>
        </> : <><th scope="col">採用{countLabel}</th><th scope="col">実装{countLabel}</th><th scope="col">{medianLabel}</th></>}
      </tr></thead>
      <tbody>{result.years.map(row)}</tbody>
      <tfoot>{row(result.total)}</tfoot>
    </table>
  </div>
}

function PowerYearChart({ result: { years, total }, split, label, unit, medianLabel, metric }: OutputProps & { metric: PowerYearMetric }) {
  const { count: countLabel, suffix, all } = COUNT_LABELS[unit]
  const valueUnit = metric === 'dps' ? 'DPS' : 'ダメージ'
  const values = years.flatMap(row => [row.median ?? 0, row.physical.median ?? 0, row.arts.median ?? 0])
  const low = Math.min(0, ...values), high = Math.max(0, ...values)
  const extent = metric === 'dps' ? Math.max(2500, Math.ceil(high / 500) * 500)
    : createZeroBasedValueAxis(Math.max(-low, high)).maximum
  const minimum = low < 0 ? -extent : 0
  const maximum = high > 0 || minimum === 0 ? extent : 0
  const span = maximum - minimum
  const mixedSigns = minimum < 0 && maximum > 0
  const description = years.map(row => split
    ? `${row.year}年、物理 ${formatValue(row.physical.median)} ${valueUnit}、${row.physical.count}${suffix}、術 ${formatValue(row.arts.median)} ${valueUnit}、${row.arts.count}${suffix}`
    : `${row.year}年、${formatValue(row.median)} ${valueUnit}、${row.rosterCount}${suffix}中${row.count}${suffix}`).join('。')

  function bar(year: number | null, median: number | null, population: string, series = 'overall') {
    return <div key={series} className="power-year-line">
      <span className="power-year-year">{year}</span>
      <div className="power-year-track">
        {median !== null && <span className={`power-year-bar power-year-color-${series}`}
          style={{ marginLeft: `${(Math.min(0, median) - minimum) / span * 100}%`, width: `${Math.abs(median) / span * 100}%` }} />}
      </div>
      <strong>{formatValue(median)}</strong><span className="power-year-count">{population}</span>
    </div>
  }

  return <>
    <div className={`power-year-chart${split ? ' is-split' : ''}${mixedSigns ? ' has-negative-and-positive' : ''}${metric !== 'dps' ? ' is-timed' : ''}`} role="img"
      aria-label={`${viewLabel(UNITS, unit)}単位・${label}の${medianLabel}。${description}`}>
      <div className="power-year-line power-year-head">
        <span>実装年</span><span>{valueUnit}</span><span>中央値</span><span>{split ? countLabel : `採用／${all}`}</span>
      </div>
      {years.map(row => <div key={row.year} className="power-year-bars">
        {split ? ATTRIBUTES.map(([type], i) => bar(i === 0 ? row.year : null, row[type].median, `${row[type].count}${suffix}`, type))
          : bar(row.year, row.median, `${row.count} / ${row.rosterCount}`)}
      </div>)}
      <div className="power-year-line power-year-axis"><div><span>{NUMBER.format(minimum)}</span>
        {mixedSigns && <span className="power-year-axis-zero">0</span>}<span>{NUMBER.format(maximum)}</span></div></div>
    </div>
    <div className="power-year-total"><strong>全期間</strong>
      {split ? ATTRIBUTES.map(([type, name]) => <span key={type}>
        {name} {formatValue(total[type].median)} {valueUnit}（{total[type].count}{suffix}）
      </span>) : <span>{formatValue(total.median)} {valueUnit}（{total.count} / {total.rosterCount}{suffix}）</span>}
    </div>
  </>
}
