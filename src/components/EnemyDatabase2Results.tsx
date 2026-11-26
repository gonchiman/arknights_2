import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ENEMY_LEVEL_LABELS } from '../lib/enemyLevelSelection'
import { sortEnemyRows, type EnemyTableSort, type EnemyTableSortKey } from '../lib/enemyTableSort'
import type { EnemyRecord } from '../types/enemy'
import { ComparisonTableImageDialog, type ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import { OutputImageSaveButton } from './OutputImageSaveButton'
import { PageOutputHeader } from './PageLayout'
import { TableSortHeader } from './TableSortHeader'
import './DamageCalculatorTwo.css'
import './EnemyDatabase2Results.css'

const PAGE_SIZE = 100
const OUTPUT_NAME = '敵一覧'
const INTEGER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const DECIMAL = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
type Mode = 'RATING' | 'VALUE'
type OpenDetail = (enemy: EnemyRecord, trigger: HTMLButtonElement) => void
type Column = {
  key: EnemyTableSortKey | 'index'
  label: string
  ratingLabel?: string
  text: (enemy: EnemyRecord, mode: Mode) => string
}

function number(value: number | null, formatter = INTEGER, suffix = '') {
  return value === null ? '—' : `${formatter.format(value)}${suffix}`
}

function primary(mode: Mode, rating: string | null, value: number | null) {
  return mode === 'RATING' ? rating ?? '—' : number(value)
}

const COLUMNS: readonly Column[] = [
  { key: 'index', label: '図鑑番号', text: enemy => enemy.index || '—' },
  { key: 'name', label: '敵名', text: enemy => enemy.name },
  { key: 'level', label: '区分', text: enemy => ENEMY_LEVEL_LABELS[enemy.levelType] },
  { key: 'stages', label: '登場ステージ数', text: enemy => number(enemy.stageAppearanceCount) },
  { key: 'hp', label: 'HP', ratingLabel: '耐久', text: (enemy, mode) => primary(mode, enemy.ratings.endurance, enemy.stats.maxHp) },
  { key: 'attack', label: '攻撃力', text: (enemy, mode) => primary(mode, enemy.ratings.attack, enemy.stats.attack) },
  { key: 'defense', label: '防御力', text: (enemy, mode) => primary(mode, enemy.ratings.defense, enemy.stats.defense) },
  { key: 'resistance', label: '術耐性', text: (enemy, mode) => primary(mode, enemy.ratings.resistance, enemy.stats.magicResistance) },
  { key: 'speed', label: '移動速度', text: enemy => number(enemy.stats.moveSpeed, DECIMAL) },
  { key: 'interval', label: '攻撃間隔', text: enemy => number(enemy.stats.baseAttackTime, DECIMAL, '秒') },
  { key: 'weight', label: '重量', text: enemy => number(enemy.stats.massLevel) },
]

function heading(column: Column, mode: Mode) {
  return mode === 'RATING' ? column.ratingLabel ?? column.label : column.label
}

function nextDirection(key: EnemyTableSortKey, sort: EnemyTableSort | null) {
  if (sort?.key === key) return sort.direction === 'asc' ? 'desc' : 'asc'
  return key === 'name' || key === 'level' ? 'asc' : 'desc'
}

function EnemyListTable({ rows, mode, sort = null, onSort, onOpenDetail }: {
  rows: readonly EnemyRecord[]
  mode: Mode
  sort?: EnemyTableSort | null
  onSort?: (key: EnemyTableSortKey) => void
  onOpenDetail?: OpenDetail
}) {
  return <table className="damage-two-table enemy-db2-table" aria-label={OUTPUT_NAME}>
    <colgroup>{COLUMNS.map(column => <col key={column.key} className={`enemy-db2-col-${column.key}`} />)}</colgroup>
    <thead><tr>{COLUMNS.map(column => {
      const label = heading(column, mode)
      if (!onSort || column.key === 'index') return <th key={column.key} scope="col">{label}</th>
      const direction = nextDirection(column.key, sort) === 'asc' ? '昇順' : '降順'
      return <TableSortHeader key={column.key} sortKey={column.key} sort={sort} onSort={onSort}
        label={label} ariaLabel={`${label}を${direction}に並べ替え`} />
    })}</tr></thead>
    <tbody>{rows.map(enemy => <tr key={enemy.id}>
      {COLUMNS.map(column => {
        const value = column.text(enemy, mode)
        if (column.key === 'name') return <th key={column.key} scope="row">
          {onOpenDetail ? <button type="button" className="enemy-db2-name" aria-haspopup="dialog"
            aria-label={`${value}の詳細を開く`} onClick={event => onOpenDetail(enemy, event.currentTarget)}>{value}</button> : value}
        </th>
        const numeric = column.key !== 'index' && column.key !== 'level'
        return <td key={column.key} data-table-image-number={numeric || undefined}>{value}</td>
      })}
    </tr>)}</tbody>
  </table>
}

export function EnemyDatabase2Results({ rows, mode, scopeLabel, onOpenDetail, children }: {
  rows: readonly EnemyRecord[]
  mode: Mode
  scopeLabel: string
  onOpenDetail: OpenDetail
  children?: ReactNode
}) {
  const [sort, setSort] = useState<EnemyTableSort | null>(null)
  const [pagination, setPagination] = useState<{ rows: readonly EnemyRecord[]; page: number } | null>(null)
  const [image, setImage] = useState<ComparisonTableImageSnapshot | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const sorted = useMemo(() => sortEnemyRows(rows, sort), [rows, sort])
  const pageCount = Math.ceil(rows.length / PAGE_SIZE)
  const page = pagination?.rows === rows ? pagination.page : 0
  const first = page * PAGE_SIZE
  const visible = sorted.slice(first, first + PAGE_SIZE)
  const range = `${INTEGER.format(first + 1)}–${INTEGER.format(first + visible.length)} / ${INTEGER.format(rows.length)}体`
  const sortColumn = COLUMNS.find(column => column.key === sort?.key)
  const sortLabel = sort && sortColumn ? `${heading(sortColumn, mode)} ${sort.direction === 'asc' ? '昇順' : '降順'}` : '図鑑順'

  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0
  }, [rows, page, sort])

  function updateSort(key: EnemyTableSortKey) {
    setSort({ key, direction: nextDirection(key, sort) })
    setPagination(null)
  }

  function saveCurrentPage() {
    setImage({
      title: '敵データベース2　敵一覧',
      conditions: [scopeLabel, mode === 'RATING' ? 'ゲーム内評価' : '実数値', sortLabel, range],
      table: <EnemyListTable rows={visible} mode={mode} />,
    })
  }

  return <>
    <PageOutputHeader segments={[OUTPUT_NAME]}
      actions={visible.length > 0 && <OutputImageSaveButton onClick={saveCurrentPage} />}>
      <div className="enemy-db2-result-heading"><h2>{OUTPUT_NAME}</h2>
        <span role="status">{INTEGER.format(rows.length)}体</span>
      </div>
    </PageOutputHeader>
    <div className="enemy-db2-result-controls">
      {children}
      <div className="enemy-db2-order"><span role="status">{sortLabel}</span>
        {sort && <button type="button" className="button secondary" onClick={() => {
          setSort(null)
          setPagination(null)
        }}>図鑑順に戻す</button>}
      </div>
    </div>
    {visible.length > 0 ? <div className="damage-two-table-wrap enemy-db2-scroll" ref={scroll}
      role="region" aria-label="敵一覧のスクロール領域" tabIndex={0}>
      <EnemyListTable rows={visible} mode={mode} sort={sort} onSort={updateSort} onOpenDetail={onOpenDetail} />
    </div> : <p className="enemy-db2-empty" role="status">条件に一致する敵はいません。</p>}
    {pageCount > 1 && <nav className="enemy-pagination" aria-label="敵一覧のページ切り替え">
      <span>{range}</span>
      <div>
        <button type="button" disabled={page === 0} onClick={() => setPagination({ rows, page: page - 1 })}>前へ</button>
        <span>{page + 1} / {pageCount}</span>
        <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPagination({ rows, page: page + 1 })}>次へ</button>
      </div>
    </nav>}
    {image && <ComparisonTableImageDialog snapshot={image} helpMode="none" onClose={() => setImage(null)} />}
  </>
}
