import { useState } from 'react'
import type { TdDeployOperator } from '../lib/tdDeploymentRoster'
import './TdDeploymentPicker.css'

const PAGE_SIZE = 4
export const TD_POSITION_LABEL = { MELEE: '地上', RANGED: '高台', ALL: '地上・高台' }

function normalizeName(name: string) {
  return name.normalize('NFKC').trim().toLowerCase()
    .replace(/[ァ-ヶ]/g, kana => String.fromCharCode(kana.charCodeAt(0) - 0x60))
}

export function TdDeploymentPicker({ operators, onSelect }: {
  operators: readonly TdDeployOperator[] | null
  onSelect: (operator: TdDeployOperator) => void
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const needle = normalizeName(query)
  const matches = operators?.filter(operator => normalizeName(operator.name).includes(needle)) ?? []
  const lastPage = Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  const start = currentPage * PAGE_SIZE
  const visible = matches.slice(start, start + PAGE_SIZE)
  const countLabel = matches.length ? `${start + 1}–${start + visible.length} / ${matches.length}人` : '該当なし'

  return <div className="td-deploy-picker">
    <label className="td-map-search">
      <span className="visually-hidden">オペレーター名</span>
      <input type="search" autoFocus autoComplete="off" placeholder="名前で検索" value={query}
        onChange={event => { setQuery(event.target.value); setPage(0) }}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && visible.length) {
            event.preventDefault()
            onSelect(visible[0])
          }
        }} />
    </label>
    {visible.length > 0 && <div className="td-deploy-search-results" role="group" aria-label="配置候補">
      {visible.map(operator => <button key={operator.id} type="button" className="button secondary"
        onClick={() => onSelect(operator)}>
        {operator.name}<span>{TD_POSITION_LABEL[operator.position]}</span>
      </button>)}
    </div>}
    <div className="map-pagination">
      <span role="status">{operators === null ? '読み込み中…' : countLabel}</span>
      {lastPage > 0 && <div>
        <button type="button" className="button secondary" disabled={currentPage === 0} aria-label="前の候補"
          onClick={() => setPage(currentPage - 1)}>前へ</button>
        <button type="button" className="button secondary" disabled={currentPage === lastPage} aria-label="次の候補"
          onClick={() => setPage(currentPage + 1)}>次へ</button>
      </div>}
    </div>
  </div>
}
