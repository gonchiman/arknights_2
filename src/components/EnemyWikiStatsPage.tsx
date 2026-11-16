import { useId, useMemo, useState } from 'react'
import { ENEMY_LEVEL_LABELS } from '../lib/enemyLevelSelection'
import { loadEnemyWikiStats, type EnemyWikiGrade, type EnemyWikiStatsEntry } from '../lib/enemyWikiStats'
import { getWikiCommentCount, getWikiCommentRange } from '../lib/operatorWikiComments'
import { rankOperatorWikiTotals, WIKI_ROOT } from '../lib/operatorWikiViews'
import { AnalysisTabs } from './AnalysisTabs'
import {
  getWikiViewColumns, ObservedTime, useWikiSnapshot, WikiDateRange, WikiPeriodButtons, WikiStatsTable,
  type WikiStatsPeriod,
} from './WikiStatsTable'
import './DamageCalculator.css'
import './EnemyWikiStatsPage.css'

const TABS = [['views', '閲覧数'], ['comments', 'コメント件数']] as const
const GRADES = ['NORMAL', 'ELITE', 'BOSS'] as const
const WIKI_INDEX_URL = `${WIKI_ROOT}?${encodeURIComponent('敵一覧')}`
const COMMENT_COLUMNS = [{ key: 'comments', label: 'コメント件数' }] as const
const EMPTY_ENTRIES: readonly EnemyWikiStatsEntry[] = []

type Tab = typeof TABS[number][0]
type GradeFilter = EnemyWikiGrade | ''

function searchKey(text: string) {
  return text.normalize('NFKC').toLowerCase()
}

function WikiSource() {
  return <a href={WIKI_INDEX_URL} target="_blank" rel="noopener noreferrer">アークナイツ攻略 Wiki</a>
}

function CumulativeCoverage({ ranked, total }: { ranked: number; total: number }) {
  return ranked < total && <span>累計取得 {ranked} / {total}件</span>
}

export function EnemyWikiStatsPage() {
  const id = useId()
  const state = useWikiSnapshot(loadEnemyWikiStats)
  const snapshot = state.status === 'ready' ? state.snapshot : null
  const [tab, setTab] = useState<Tab>('views')
  const [query, setQuery] = useState('')
  const [grade, setGrade] = useState<GradeFilter>('')
  const [period, setPeriod] = useState<WikiStatsPeriod>(30)
  const [viewPage, setViewPage] = useState(0)
  const [commentPage, setCommentPage] = useState(0)
  const entries = snapshot?.entries ?? EMPTY_ENTRIES
  const commentTargets = useMemo(() => entries.filter(entry => entry.comment?.status !== 'no-log').length, [entries])

  const filtered = useMemo(() => {
    const search = searchKey(query.trim())
    return entries.filter(entry =>
      (!grade || entry.grade === grade)
      && (!search || searchKey(entry.name).includes(search) || searchKey(entry.index).includes(search)),
    )
  }, [entries, grade, query])
  const { viewRanks, commentRanks } = useMemo(() => {
    const viewTotals = entries.map(entry => ({ operatorId: entry.wikiUrl, total: entry.view?.total ?? null }))
    const commentTotals = entries.map(entry => ({
      operatorId: entry.wikiUrl,
      total: entry.comment?.status === 'available' ? entry.comment.total : null,
    }))
    return {
      viewRanks: rankOperatorWikiTotals(viewTotals, viewTotals),
      commentRanks: rankOperatorWikiTotals(commentTotals, commentTotals),
    }
  }, [entries])
  const viewRows = useMemo(() => filtered.map(entry => ({
    operatorId: entry.wikiUrl,
    index: entry.index,
    name: entry.name,
    wikiUrl: entry.wikiUrl,
    yesterday: entry.view?.yesterday ?? null,
    today: entry.view?.today ?? null,
    total: entry.view?.total ?? null,
  })), [filtered])
  const range = useMemo(() => snapshot?.commentsObservedAt && period !== 'total'
    ? getWikiCommentRange(snapshot.throughDate, period)
    : null, [snapshot, period])
  const commentRows = useMemo(() => filtered.map(entry => {
    const comment = entry.comment
    const counted = comment?.status === 'available' ? comment : undefined
    const comments = period === 'total' ? counted?.total ?? null : range && getWikiCommentCount(counted, range)
    return {
      operatorId: entry.wikiUrl,
      index: entry.index,
      name: entry.name,
      wikiUrl: comment?.wikiUrl ?? entry.wikiUrl,
      wikiLinkLabel: comment?.wikiUrl ? 'Wiki コメントページ' : 'Wiki ページ',
      missingLabel: comment?.status === 'no-log' ? 'ログなし' as const : undefined,
      comments,
    }
  }), [filtered, period, range])

  function resetPages() {
    setViewPage(0)
    setCommentPage(0)
  }

  return <section className="calculator-page wiki-stats-page enemy-wiki-stats-page">
    <header className="page-intro">
      <h1>{tab === 'views' ? '敵別 Wiki 閲覧数' : '敵別 Wiki コメント件数'}</h1>
    </header>
    <AnalysisTabs tabs={TABS} idPrefix={id} label="Wiki 集計の表示" activeTab={tab} onChange={setTab} />
    <div className="enemy-wiki-stats-filters calculator-panel" role="group" aria-label="敵の絞り込み">
      <label>敵名・図鑑番号 <input type="search" value={query} placeholder="敵名・図鑑番号で検索"
        onChange={event => { setQuery(event.target.value); resetPages() }} /></label>
      <label>階級 <select value={grade}
        onChange={event => { setGrade(event.target.value as GradeFilter); resetPages() }}>
        <option value="">すべて</option>
        {GRADES.map(value => <option key={value} value={value}>{ENEMY_LEVEL_LABELS[value]}</option>)}
      </select></label>
    </div>
    <section id={`${id}-panel-views`} role="tabpanel" aria-labelledby={`${id}-tab-views`} hidden={tab !== 'views'}>
      {state.status === 'loading' && <p className="calculator-loading" role="status">読み込み中…</p>}
      {state.status === 'error' && <p className="error-box" role="alert">敵別 Wiki 集計を読み込めませんでした。</p>}
      {snapshot && <div className="calculator-panel">
        <div className="wiki-stats-meta">
          <WikiSource />
          <div className="wiki-stats-dates">
            <CumulativeCoverage ranked={viewRanks.size} total={entries.length} />
            {snapshot.viewsObservedAt && <ObservedTime observedAt={snapshot.viewsObservedAt} />}
          </div>
        </div>
        <WikiStatsTable columns={getWikiViewColumns(snapshot.viewsObservedAt ? snapshot : null)}
          rows={viewRows} ranks={viewRanks} defaultSort="yesterday" page={viewPage} onPageChange={setViewPage}
          label="Wiki 閲覧数一覧" tableLabel="敵別の Wiki ページ閲覧数（回）" metricLabel="閲覧数" linkLabel="Wiki ページ"
          subject="enemy" provisionalRanks={viewRanks.size < entries.length}
          nameColumnClass="wiki-stats-name-column" />
      </div>}
    </section>
    <section id={`${id}-panel-comments`} role="tabpanel" aria-labelledby={`${id}-tab-comments`} hidden={tab !== 'comments'}>
      {state.status === 'loading' && <p className="calculator-loading" role="status">読み込み中…</p>}
      {state.status === 'error' && <p className="error-box" role="alert">敵別 Wiki 集計を読み込めませんでした。</p>}
      {snapshot && <div className="calculator-panel">
        <div className="wiki-stats-meta">
          <WikiPeriodButtons period={period} onChange={value => { setPeriod(value); setCommentPage(0) }} />
          <div className="wiki-stats-dates">
            {range && <WikiDateRange {...range} />}
            {snapshot.commentsObservedAt && <ObservedTime observedAt={snapshot.commentsObservedAt} />}
          </div>
        </div>
        <div className="wiki-stats-meta">
          <WikiSource />
          <CumulativeCoverage ranked={commentRanks.size} total={commentTargets} />
        </div>
        <WikiStatsTable columns={COMMENT_COLUMNS} rows={commentRows} ranks={commentRanks} defaultSort="comments"
          page={commentPage} onPageChange={setCommentPage} label="Wiki コメント件数一覧"
          tableLabel="敵別の Wiki コメント件数（件）" metricLabel="コメント件数" linkLabel="Wiki ページ"
          subject="enemy" provisionalRanks={commentRanks.size < commentTargets}
          nameColumnClass="wiki-stats-comments-name-column" />
      </div>}
    </section>
  </section>
}
