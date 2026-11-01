import { useId, useMemo, useRef, useState } from 'react'
import { getEnemyCountWeight, type EnemyHistogramCounts } from '../lib/enemyHistogramCounts'
import { ENEMY_IMMUNITIES, type EnemyImmunityCountMode, type EnemyImmunityKey } from '../lib/enemyImmunities'
import { ENEMY_LEVEL_LABELS } from '../lib/enemyLevelSelection'
import type { EnemyRecord } from '../types/enemy'
import { EnemyDetailModal } from './EnemyDetailModal'
import './EnemyAnalysis.css'
import './EnemyImmunityTable.css'

const PAGE_SIZE = 5

export function EnemyImmunityTable({ rows, immunityKey, countMode, counts }: {
  rows: readonly EnemyRecord[]
  immunityKey: EnemyImmunityKey
  countMode: EnemyImmunityCountMode
  counts: EnemyHistogramCounts
}) {
  const headingId = useId()
  const [page, setPage] = useState(0)
  const [detailEnemy, setDetailEnemy] = useState<EnemyRecord | null>(null)
  const detailTrigger = useRef<HTMLButtonElement | null>(null)
  const label = ENEMY_IMMUNITIES.find(item => item.key === immunityKey)!.label
  const showSpawns = countMode === 'SPAWNS'
  const orderedRows = useMemo(() => showSpawns
    ? [...rows].sort((a, b) => getEnemyCountWeight(b.id, 'SPAWNS', counts) - getEnemyCountWeight(a.id, 'SPAWNS', counts))
    : rows, [rows, showSpawns, counts])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const first = currentPage * PAGE_SIZE
  const visibleRows = orderedRows.slice(first, first + PAGE_SIZE)

  function closeDetail() {
    setDetailEnemy(null)
    window.requestAnimationFrame(() => {
      if (detailTrigger.current?.isConnected) detailTrigger.current.focus({ preventScroll: true })
    })
  }

  return <div className="enemy-immunity-table-section">
    <div className="enemy-immunity-table-heading">
      <h3 id={headingId}>{label}無効</h3>
      <span>{rows.length.toLocaleString('ja-JP')}種類</span>
    </div>
    <div className="table-wrap enemy-table-wrap enemy-immunity-table-scroll"
      role="region" aria-label={`${label}無効の敵一覧・スクロール領域`} tabIndex={0}>
      <table className="enemy-table enemy-immunity-table" data-count-mode={countMode} aria-labelledby={headingId}>
        <thead><tr>
          <th scope="col">敵名</th>
          <th scope="col">区分</th>
          <th scope="col">無効化する状態異常</th>
          {showSpawns && <th scope="col" className="enemy-immunity-spawn-count" aria-sort="descending">出現回数（体）</th>}
        </tr></thead>
        <tbody>{visibleRows.map(enemy => {
          const immunities = [...new Set(enemy.statusImmunities.map(value => value === '武装解除' ? '戦慄' : value))]
          return <tr key={enemy.id}>
            <th scope="row">
              <button type="button" className="enemy-detail-button" aria-haspopup="dialog"
                aria-label={`${enemy.name}の詳細を開く`}
                onClick={event => { detailTrigger.current = event.currentTarget; setDetailEnemy(enemy) }}>
                <strong>{enemy.name}</strong>
              </button>
            </th>
            <td>{ENEMY_LEVEL_LABELS[enemy.levelType]}</td>
            <td>{immunities.map((value, index) => <span key={value} className="enemy-immunity-table-status">
              <span className={value === label ? 'enemy-immunity-selected-status' : undefined}>{value}</span>
              {index < immunities.length - 1 ? '・' : ''}
            </span>)}</td>
            {showSpawns && <td className="enemy-immunity-spawn-count">{getEnemyCountWeight(enemy.id, 'SPAWNS', counts).toLocaleString('ja-JP')}</td>}
          </tr>
        })}
          {rows.length === 0 && <tr><td colSpan={showSpawns ? 4 : 3} className="enemy-immunity-table-empty">該当する敵なし</td></tr>}
        </tbody>
      </table>
    </div>
    <nav className="enemy-pagination" aria-label="耐性を持つ敵一覧のページ切り替え">
      <span role="status" aria-live="polite">{rows.length === 0 ? '0' : `${first + 1}–${Math.min(first + PAGE_SIZE, rows.length)}`} / {rows.length.toLocaleString('ja-JP')}種類</span>
      {pageCount > 1 && <div>
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>前へ</button>
        <span>{currentPage + 1} / {pageCount}</span>
        <button type="button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>次へ</button>
      </div>}
    </nav>
    {detailEnemy && <EnemyDetailModal enemy={detailEnemy} onClose={closeDetail} />}
  </div>
}
