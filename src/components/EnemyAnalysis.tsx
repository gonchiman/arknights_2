import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadEnemyRecords,
  matchesEnemyFilters,
  type EnemyFilters,
} from '../lib/enemyData'
import type { EnemyLevelType, EnemyRecord } from '../types/enemy'
import { EnemyDetailModal } from './EnemyDetailModal'
import './EnemyAnalysis.css'

const PAGE_SIZE = 100

const DEFAULT_FILTERS: EnemyFilters = {
  query: '',
  levelType: 'ALL',
  damageType: 'ALL',
}

const LEVEL_OPTIONS: Array<{ value: EnemyLevelType | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'すべて' },
  { value: 'NORMAL', label: '通常' },
  { value: 'ELITE', label: 'エリート' },
  { value: 'BOSS', label: 'ボス' },
  { value: 'UNKNOWN', label: '未分類' },
]

const LEVEL_LABELS: Record<EnemyLevelType, string> = {
  NORMAL: '通常',
  ELITE: 'エリート',
  BOSS: 'ボス',
  UNKNOWN: '未分類',
}

const DAMAGE_TYPE_LABELS: Record<string, string> = {
  PHYSIC: '物理',
  PHYSICAL: '物理',
  MAGIC: '術',
  ARTS: '術',
  PURE: '確定',
  NO_DAMAGE: '非攻撃',
  HEAL: '回復',
}

const INTEGER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const DECIMAL_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })

export function EnemyAnalysis() {
  const [rows, setRows] = useState<EnemyRecord[]>([])
  const [filters, setFilters] = useState<EnemyFilters>({ ...DEFAULT_FILTERS })
  const [page, setPage] = useState(0)
  const [loadVersion, setLoadVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailEnemy, setDetailEnemy] = useState<EnemyRecord | null>(null)
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    void loadEnemyRecords()
      .then((records) => {
        if (!active) return
        setRows(records)
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : '不明なエラーが発生しました。')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [loadVersion])

  const damageTypeOptions = useMemo(() => (
    [...new Set(rows.flatMap((enemy) => enemy.damageTypes))]
      .sort((a, b) => getDamageTypeLabel(a).localeCompare(getDamageTypeLabel(b), 'ja'))
  ), [rows])

  const filteredRows = useMemo(
    () => rows.filter((enemy) => matchesEnemyFilters(enemy, filters)),
    [rows, filters],
  )
  const pageCount = Math.ceil(filteredRows.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const visibleRows = filteredRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const rangeStart = filteredRows.length === 0 ? 0 : currentPage * PAGE_SIZE + 1
  const rangeEnd = Math.min((currentPage + 1) * PAGE_SIZE, filteredRows.length)
  const filtersActive = filters.query !== '' || filters.levelType !== 'ALL' || filters.damageType !== 'ALL'

  const updateFilter = <K extends keyof EnemyFilters,>(key: K, value: EnemyFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(0)
  }

  const resetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS })
    setPage(0)
  }

  const openEnemyDetail = (enemy: EnemyRecord, trigger: HTMLButtonElement) => {
    detailTriggerRef.current = trigger
    setDetailEnemy(enemy)
  }

  const closeEnemyDetail = () => {
    setDetailEnemy(null)
    window.requestAnimationFrame(() => {
      if (detailTriggerRef.current?.isConnected) detailTriggerRef.current.focus()
    })
  }

  return (
    <section className="enemy-analysis-route">
      <header className="page-intro">
        <div>
          <span className="page-kicker">ENEMY DIRECTORY</span>
          <h1>Enemy Analysis</h1>
        </div>
        <p>敵図鑑と戦闘データを結合し、基礎ステータス・攻撃種別・能力を一覧で確認します。</p>
      </header>

      <section className="enemy-directory" aria-label="敵情報一覧">
        <div className="enemy-filters">
          <div className="enemy-filters-heading">
            <strong>敵を絞り込む</strong>
            <button type="button" onClick={resetFilters} disabled={!filtersActive}>条件をリセット</button>
          </div>
          <div className="enemy-filter-grid">
            <label className="enemy-query-filter">
              <span>検索</span>
              <input
                type="search"
                value={filters.query}
                placeholder="敵名・図鑑番号・能力・内部ID"
                onChange={(event) => updateFilter('query', event.target.value)}
              />
            </label>
            <label>
              <span>区分</span>
              <select
                value={filters.levelType}
                onChange={(event) => updateFilter('levelType', event.target.value as EnemyFilters['levelType'])}
              >
                {LEVEL_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>攻撃種別</span>
              <select
                value={filters.damageType}
                onChange={(event) => updateFilter('damageType', event.target.value)}
              >
                <option value="ALL">すべて</option>
                {damageTypeOptions.map((damageType) => (
                  <option value={damageType} key={damageType}>{getDamageTypeLabel(damageType)}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="result-meta enemy-result-meta" role="status" aria-live="polite">
          <span>{loading ? '敵データを読み込み中…' : `${filteredRows.length} 体表示`}</span>
          <span>数値は敵DBのLv.0（存在しない場合は最初のレベル）です</span>
        </div>

        {error ? (
          <div className="enemy-load-state" role="alert">
            <strong>敵データを読み込めませんでした</strong>
            <span>{error}</span>
            <button type="button" className="button secondary" onClick={() => setLoadVersion((value) => value + 1)}>
              再読み込み
            </button>
          </div>
        ) : !loading && filteredRows.length === 0 ? (
          <div className="enemy-load-state" role="status">
            <strong>条件に一致する敵がいません</strong>
            <span>検索文字や絞り込み条件を変更してください。</span>
            <button type="button" className="button secondary" onClick={resetFilters}>条件をリセット</button>
          </div>
        ) : (
          <>
            <div className="table-wrap enemy-table-wrap">
              <table className="enemy-table">
                <caption>敵の基礎ステータス一覧</caption>
                <thead>
                  <tr>
                    <th className="enemy-name-column">敵</th>
                    <th>区分</th>
                    <th className="numeric-heading">HP</th>
                    <th className="numeric-heading">攻撃力</th>
                    <th className="numeric-heading">防御力</th>
                    <th className="numeric-heading">術耐性</th>
                    <th className="numeric-heading">移動速度</th>
                    <th className="numeric-heading">攻撃間隔</th>
                    <th className="numeric-heading">重量</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((enemy) => (
                    <EnemyRow enemy={enemy} onOpenDetail={openEnemyDetail} key={enemy.id} />
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <nav className="enemy-pagination" aria-label="敵一覧のページ切り替え">
                <span>{rangeStart}–{rangeEnd} / {filteredRows.length}</span>
                <div>
                  <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>前へ</button>
                  <span>{currentPage + 1} / {pageCount}</span>
                  <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>次へ</button>
                </div>
              </nav>
            )}
          </>
        )}
      </section>

      <p className="enemy-data-note">
        ステージ固有の敵レベル、強襲条件、危機契約などの補正は反映していません。複数レベルを持つ敵も、ここでは比較しやすい基礎値を表示します。
      </p>
      {detailEnemy && <EnemyDetailModal enemy={detailEnemy} onClose={closeEnemyDetail} />}
    </section>
  )
}

function EnemyRow({
  enemy,
  onOpenDetail,
}: {
  enemy: EnemyRecord
  onOpenDetail: (enemy: EnemyRecord, trigger: HTMLButtonElement) => void
}) {
  return (
    <tr>
      <td className="enemy-identity-cell">
        <span className="enemy-index">{enemy.index || '—'}</span>
        <button
          type="button"
          className="enemy-detail-button"
          aria-haspopup="dialog"
          aria-label={`${enemy.name}の詳細を開く`}
          onClick={(event) => onOpenDetail(enemy, event.currentTarget)}
        >
          <strong>{enemy.name}</strong>
          <span aria-hidden="true">詳細</span>
        </button>
      </td>
      <td>
        <span className={`enemy-level-badge ${enemy.levelType.toLowerCase()}`}>{LEVEL_LABELS[enemy.levelType]}</span>
      </td>
      <EnemyNumberCell value={enemy.stats.maxHp} />
      <EnemyNumberCell value={enemy.stats.attack} />
      <EnemyNumberCell value={enemy.stats.defense} />
      <EnemyNumberCell value={enemy.stats.magicResistance} />
      <EnemyNumberCell value={enemy.stats.moveSpeed} decimal />
      <td className="enemy-number-cell">
        <strong>{formatDecimal(enemy.stats.baseAttackTime, '秒')}</strong>
      </td>
      <EnemyNumberCell value={enemy.stats.massLevel} />
    </tr>
  )
}

function EnemyNumberCell({ value, decimal = false, suffix = '' }: { value: number | null; decimal?: boolean; suffix?: string }) {
  return (
    <td className="enemy-number-cell">
      <strong>{decimal ? formatDecimal(value, suffix) : formatInteger(value, suffix)}</strong>
    </td>
  )
}

function getDamageTypeLabel(value: string): string {
  return DAMAGE_TYPE_LABELS[value] ?? value
}

function formatInteger(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${INTEGER_FORMATTER.format(value)}${suffix}`
}

function formatDecimal(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${DECIMAL_FORMATTER.format(value)}${suffix}`
}
