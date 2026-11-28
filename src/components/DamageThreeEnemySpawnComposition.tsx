import { useEffect, useMemo, useState } from 'react'
import { buildEnemySpawnBreakdown, formatEnemySpawnPair, type EnemySpawnBreakdownView } from '../lib/enemySpawnBreakdown'
import type { EnemyHistogramCounts } from '../lib/enemyHistogramCounts'
import {
  loadMainStorySpawnLists, loadMainStorySpawnStages, MAIN_STORY_SPAWN_AGGREGATION_VERSION, type MainStorySpawnList,
} from '../lib/mainStoryEnemySpawns'
import { STANDARD_PAGE_TITLES } from '../lib/navigation'
import type { EnemyRecord } from '../types/enemy'
import { ENEMY_MAIN_STORY_LABEL, type EnemyAggregationScope } from './EnemyAggregationScopeSelector'
import { EnemySpawnCompositionChart, EnemySpawnCompositionImageButton } from './EnemySpawnCompositionChart'
import { ENEMY_COMPARISON_TITLE, ENEMY_SPAWN_COMPOSITION_TITLE } from './enemyComparisonViews'
import { PageOutputHeader } from './PageLayout'
import { viewLabel } from './PageViewSwitch'
import './DamageThreeOperatorVotes.css'

const VIEWS = [['pairs', '防御力・術耐性の組別'], ['enemies', '敵別'], ['chapters', '章別']] as const
const PAGE_SIZE = 10
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })

interface Props {
  rows: readonly EnemyRecord[]
  counts: EnemyHistogramCounts
  scope: EnemyAggregationScope
  aggregationVersion: string
}

export function DamageThreeEnemySpawnComposition({ rows, counts, scope, aggregationVersion }: Props) {
  const [view, setView] = useState<EnemySpawnBreakdownView>('pairs')
  const [chapter, setChapter] = useState<number | null>(null)
  const [pairKey, setPairKey] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [chapterLists, setChapterLists] = useState<MainStorySpawnList[]>()
  const [chapterError, setChapterError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const supportsChapters = scope === 'main' && aggregationVersion === MAIN_STORY_SPAWN_AGGREGATION_VERSION
  useEffect(() => {
    if (!supportsChapters) return
    let active = true
    void loadMainStorySpawnStages().then(loadMainStorySpawnLists).then(lists => {
      if (active) setChapterLists(lists)
    }).catch(() => { if (active) setChapterError(true) })
    return () => { active = false }
  }, [supportsChapters, attempt])

  const result = useMemo(() => buildEnemySpawnBreakdown(rows, counts, {
    view, chapter: view !== 'chapters' ? chapter : null, pairKey: view === 'enemies' ? pairKey : null, chapterLists,
  }), [rows, counts, view, chapter, pairKey, chapterLists])
  const chapterName = view === 'chapters' || chapter === null ? '全章' : `第${chapter}章`
  const pair = view === 'enemies' ? result.pairs.find(option => option.key === pairKey) : undefined
  const scopeName = scope === 'main' ? ENEMY_MAIN_STORY_LABEL : '全体'
  const viewName = viewLabel(VIEWS, view)
  const segments = [ENEMY_COMPARISON_TITLE, ENEMY_SPAWN_COMPOSITION_TITLE, viewName]
  const chartTitle = `${viewName}の出現回数`
  const pendingChapters = view === 'chapters' && !chapterLists
  const activePage = Math.min(page, Math.max(0, Math.ceil(result.rows.length / PAGE_SIZE) - 1))
  const start = activePage * PAGE_SIZE
  const pageRows = result.rows.slice(start, start + PAGE_SIZE)
  const range = `${start + 1}–${start + pageRows.length} / ${result.rows.length}件`
  const plot = { rows: pageRows, totalCount: result.total, maxCount: result.rows[0]?.count ?? 0, title: chartTitle }
  const unit = { pairs: '組', enemies: '種（敵ID別）', chapters: '章' }[view]
  const totalLabel = `表示対象 ${NUMBER.format(result.total)}回`
  const missingLabel = `${scope === 'main' ? chapterName : '集計範囲'}で値なし ${NUMBER.format(result.missingCount)}回を除外`
  const filters = [`集計版 ${aggregationVersion}`, scopeName, ...(supportsChapters ? [chapterName] : []),
    ...(pair ? [formatEnemySpawnPair(pair.defense, pair.resistance)] : [])]
  const conditions = [...filters, totalLabel, missingLabel, range]
  const filenameParts = [...filters, `${start + 1}〜${start + pageRows.length}件目`]

  return <section className="dc3-operator-votes" aria-label={ENEMY_SPAWN_COMPOSITION_TITLE}>
    <div className="dc3-vote-detail-controls">
      <label className="dc3-vote-picker">内訳
        <select value={view} onChange={event => {
          const next = event.target.value as EnemySpawnBreakdownView
          setView(next)
          setPage(0)
          if (next === 'chapters') setChapter(null)
          if (next !== 'enemies') setPairKey(null)
        }}>
          {VIEWS.map(([value, label]) => <option key={value} value={value} disabled={value === 'chapters' && !supportsChapters}>
            {value === 'chapters' && !supportsChapters ? `章別（${MAIN_STORY_SPAWN_AGGREGATION_VERSION}・メインストーリーのみ）` : label}
          </option>)}
        </select>
      </label>
      {supportsChapters && view !== 'chapters' && <label className="dc3-vote-picker">章
        <select value={chapter ?? ''} disabled={!chapterLists} onChange={event => {
          setChapter(event.target.value === '' ? null : Number(event.target.value))
          setPairKey(null)
          setPage(0)
        }}>
          <option value="">全章</option>
          {result.chapters.map(value => <option key={value} value={value}>第{value}章</option>)}
        </select>
      </label>}
      {view === 'enemies' && <label className="dc3-vote-picker">防御力・術耐性の組
        <select value={pairKey ?? ''} onChange={event => { setPairKey(event.target.value || null); setPage(0) }}>
          <option value="">すべての組</option>
          {result.pairs.map(option => <option key={option.key} value={option.key}>
            {formatEnemySpawnPair(option.defense, option.resistance)}
          </option>)}
        </select>
      </label>}
    </div>
    {chapterError && <div className="enemy-aggregation-status" role="alert">章別の出現データを読み込めませんでした。
      <button type="button" className="button secondary" onClick={() => {
        setChapterError(false); setAttempt(value => value + 1)
      }}>再読み込み</button>
    </div>}
    <PageOutputHeader segments={segments} actions={!pendingChapters && pageRows.length > 0 &&
      <EnemySpawnCompositionImageButton {...plot} conditions={conditions} filenameParts={filenameParts}
        parentLocation={[STANDARD_PAGE_TITLES['damage-three-skill-attribute-matrix'], ...segments]} />}>
      <div className="dc3-matrix-table-heading">
        <h2>{chartTitle}</h2>
        {!pendingChapters && pageRows.length > 0 && <nav aria-label="出現回数の内訳のページ切り替え">
          <span aria-live="polite">{range}</span>
          {result.rows.length > PAGE_SIZE && <>
            <button type="button" className="button secondary" disabled={activePage === 0}
              onClick={() => setPage(activePage - 1)}>前へ</button>
            <button type="button" className="button secondary" disabled={start + PAGE_SIZE >= result.rows.length}
              onClick={() => setPage(activePage + 1)}>次へ</button>
          </>}
        </nav>}
      </div>
    </PageOutputHeader>
    {pendingChapters ? !chapterError && <p role="status">章別の出現データを読み込んでいます…</p> : <>
      <div className="dc3-matrix-conditions" role="status">
        <span>{totalLabel}</span><span>{NUMBER.format(result.rows.length)}{unit}</span><span>{missingLabel}</span>
      </div>
      {pageRows.length ? <EnemySpawnCompositionChart {...plot} /> : <p role="status">該当する出現はありません。</p>}
    </>}
  </section>
}
