import { useEffect, useId, useMemo, useState } from 'react'
import {
  loadCoverageIndex, loadCoverageSnapshot, type CoverageSnapshot,
} from '../lib/damageCalculatorThreeCoverageHistory'
import {
  buildDamageThreePowerByYear, type PowerYearEnemy, type PowerYearResult, type PowerYearRow, type PowerYearUnit,
} from '../lib/damageThreePowerByYear'
import type { SkillRecord } from '../types/skill'
import { AnalysisTabPanel } from './AnalysisTabs'
import { PageLayout, PageOutputTabs } from './PageLayout'
import { PageViewSwitch, TABLE_CHART_VIEWS, viewLabel, type TableChartView } from './PageViewSwitch'
import './DamageCalculatorTwo.css'
import './DamageThreePowerByYearPage.css'

const TABS = [['years', '実装年別'], ['attribute', '物理・術別']] as const
type PowerTab = typeof TABS[number][0]
const VIEWS = [TABLE_CHART_VIEWS[1], TABLE_CHART_VIEWS[0]] as const
const ENEMIES = [['zero', '防御0・術耐性0'], ['standard', '防御120・術耐性20']] as const
const UNITS = [['operator', 'オペレーター'], ['skill', 'スキル']] as const
const COUNT_LABELS = {
  operator: { count: '人数', suffix: '人', all: '全員' },
  skill: { count: 'スキル数', suffix: '件', all: '全件' },
} as const
const ATTRIBUTES = [['physical', '物理のみ'], ['arts', '術のみ']] as const
const COVERAGE_ID = 'v11'
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const RELEASE_DATE = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeZone: 'Asia/Tokyo' })
const formatDps = (value: number | null) => value === null ? '—' : NUMBER.format(value)

interface PageProps {
  rows: readonly SkillRecord[]
  loading: boolean
  error?: string | null
  onRetry?: () => void
}

export default function DamageThreePowerByYearPage({ rows, loading, error, onRetry }: PageProps) {
  const idPrefix = useId()
  const [tab, setTab] = useState<PowerTab>('years')
  const [view, setView] = useState<TableChartView>('chart')
  const [enemy, setEnemy] = useState<PowerYearEnemy>('zero')
  const [unit, setUnit] = useState<PowerYearUnit>('operator')
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
    ? buildDamageThreePowerByYear(rows, snapshot, enemy, unit) : null, [rows, snapshot, enemy, unit, loading, error])
  const tabProps = { idPrefix, activeTab: tab }
  const loadError = error || snapshotError
  const retry = () => {
    if (error) onRetry?.()
    if (snapshotError) {
      setSnapshotError('')
      setAttempt(previous => previous + 1)
    }
  }

  return <PageLayout page="damage-three-power-by-year" className="power-year-page" settings={<>
    <div className="power-year-settings">
      <strong>集計単位</strong>
      <PageViewSwitch views={UNITS} selected={unit} onChange={setUnit} label="集計単位" />
    </div>
    <div className="power-year-settings">
      <strong>敵条件</strong>
      <PageViewSwitch views={ENEMIES} selected={enemy} onChange={setEnemy} label="敵条件" />
    </div>
    <div className="power-year-meta">
      <span>★6・昇進2 Lv.90・特化3</span><span>敵1体</span>
      <span>{unit === 'operator' ? '各人の最高DPSを採用' : '各スキルでDPSが最大の段階を採用'}</span>
      <span>DC3 {COVERAGE_ID}</span>
      {result?.latestReleaseDate && <span>日本版実装日 <time dateTime={result.latestReleaseDate}>
        {RELEASE_DATE.format(new Date(result.latestReleaseDate))}
      </time>まで</span>}
    </div>
  </>}>
    {loadError ? <div className="power-year-status" role="alert">
      <span>{loadError}</span>
      {(onRetry || snapshotError) && <button className="button secondary" onClick={retry} type="button">再読み込み</button>}
    </div> : !result ? <p role="status">火力データを読み込んでいます…</p>
      : result.years.length === 0 ? <p role="status">集計対象の{viewLabel(UNITS, unit)}は0{COUNT_LABELS[unit].suffix}です。</p> : <>
        <PageOutputTabs {...tabProps} tabs={TABS} onChange={setTab} label="火力の集計方法" format={viewLabel(VIEWS, view)} />
        {TABS.map(([key, tabLabel]) => <AnalysisTabPanel key={key} {...tabProps} tab={key}>
          {tab === key && <>
            <div className="power-year-tools">
              <PageViewSwitch views={VIEWS} selected={view} onChange={setView} label="表示形式" />
              {key === 'attribute' && view === 'chart' && <div className="power-year-key" aria-label="属性の凡例">
                {ATTRIBUTES.map(([type, label], i) => <span key={type}>
                  <i className={`power-year-color-${type}`} aria-hidden="true" />{i === 0 ? '上段' : '下段'} {label}
                </span>)}
              </div>}
            </div>
            {view === 'chart'
              ? <PowerYearChart result={result} split={key === 'attribute'} label={tabLabel} unit={unit} />
              : <PowerYearTable result={result} split={key === 'attribute'} label={tabLabel} unit={unit} />}
            {key === 'attribute' && <p className="power-year-note">
              物理のみ・術のみの比較から除外　{result.total.otherCount}{COUNT_LABELS[unit].suffix}（混合属性など）
            </p>}
          </>}
        </AnalysisTabPanel>)}
      </>}
  </PageLayout>
}

interface OutputProps {
  result: PowerYearResult
  split: boolean
  label: string
  unit: PowerYearUnit
}

function PowerYearTable({ result, split, label, unit }: OutputProps) {
  const title = `${viewLabel(UNITS, unit)}単位・${label}の単体DPS中央値`
  const countLabel = COUNT_LABELS[unit].count
  function row({ year, count, rosterCount, median, physical, arts }: PowerYearRow) {
    return <tr key={year ?? 'total'}>
      <th scope="row">{year ?? '全期間'}</th>
      {split ? <>
        <td>{formatDps(physical.median)}</td><td>{physical.count}</td>
        <td>{formatDps(arts.median)}</td><td>{arts.count}</td>
      </> : <><td>{count}</td><td>{rosterCount}</td><td>{formatDps(median)}</td></>}
    </tr>
  }
  return <div className="damage-two-table-wrap" role="region" tabIndex={0} aria-label={title}>
    <table className={`damage-two-table power-year-table${split ? ' is-split' : ''}`} aria-label={title}>
      <thead><tr><th scope="col">実装年</th>
        {split ? <>
          <th scope="col">物理のみ<wbr /> DPS中央値</th><th scope="col" aria-label={`物理のみの${countLabel}`}>{countLabel}</th>
          <th scope="col">術のみ<wbr /> DPS中央値</th><th scope="col" aria-label={`術のみの${countLabel}`}>{countLabel}</th>
        </> : <><th scope="col">採用{countLabel}</th><th scope="col">実装{countLabel}</th><th scope="col">単体DPS中央値</th></>}
      </tr></thead>
      <tbody>{result.years.map(row)}</tbody>
      <tfoot>{row(result.total)}</tfoot>
    </table>
  </div>
}

function PowerYearChart({ result: { years, total }, split, label, unit }: OutputProps) {
  const { count: countLabel, suffix, all } = COUNT_LABELS[unit]
  // Both tabs and enemy presets use the same 0–2,500 DPS baseline. Extend it for larger values.
  const peak = Math.max(...years.flatMap(row => [row.median ?? 0, row.physical.median ?? 0, row.arts.median ?? 0]))
  const maximum = Math.max(2500, Math.ceil(peak / 500) * 500)
  const description = years.map(row => split
    ? `${row.year}年、物理 ${formatDps(row.physical.median)} DPS、${row.physical.count}${suffix}、術 ${formatDps(row.arts.median)} DPS、${row.arts.count}${suffix}`
    : `${row.year}年、${formatDps(row.median)} DPS、${row.rosterCount}${suffix}中${row.count}${suffix}`).join('。')

  function bar(year: number | null, median: number | null, population: string, series = 'overall') {
    return <div key={series} className="power-year-line">
      <span className="power-year-year">{year}</span>
      <div className="power-year-track">
        {median !== null && <span className={`power-year-bar power-year-color-${series}`}
          style={{ width: `${median / maximum * 100}%` }} />}
      </div>
      <strong>{formatDps(median)}</strong><span className="power-year-count">{population}</span>
    </div>
  }

  return <>
    <div className={`power-year-chart${split ? ' is-split' : ''}`} role="img"
      aria-label={`${viewLabel(UNITS, unit)}単位・${label}の単体DPS中央値。${description}`}>
      <div className="power-year-line power-year-head">
        <span>実装年</span><span>単体DPS中央値</span><span>DPS</span><span>{split ? countLabel : `採用／${all}`}</span>
      </div>
      {years.map(row => <div key={row.year} className="power-year-bars">
        {split ? ATTRIBUTES.map(([type], i) => bar(i === 0 ? row.year : null, row[type].median, `${row[type].count}${suffix}`, type))
          : bar(row.year, row.median, `${row.count} / ${row.rosterCount}`)}
      </div>)}
      <div className="power-year-line power-year-axis"><div><span>0</span><span>{NUMBER.format(maximum)}</span></div></div>
    </div>
    <div className="power-year-total"><strong>全期間</strong>
      {split ? ATTRIBUTES.map(([type, name]) => <span key={type}>
        {name} {formatDps(total[type].median)} DPS（{total[type].count}{suffix}）
      </span>) : <span>{formatDps(total.median)} DPS（{total.count} / {total.rosterCount}{suffix}）</span>}
    </div>
  </>
}
