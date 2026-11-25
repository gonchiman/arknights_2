import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { lockPageScroll } from '../lib/pageScrollLock'
import { getProfessionLabel, PROFESSION_ORDER } from '../lib/operatorFilters'
import { buildSubProfessionOptions, EMPTY_OPERATOR_FILTERS, hasActiveOperatorFilters, matchesOperatorAttributes, type FilterState } from '../lib/operatorSearchFilters'
import type { TdDeploymentRosterEntry } from '../lib/tdDeploymentRoster'
import { Filters } from './Filters'
import { PageOutputHeader } from './PageLayout'
import { TdRecentAllies } from './TdRecentAllies'
import './TdDeploymentPicker.css'

const PAGE_SIZE = 12
const TITLE = '配置する味方を選択'
const PROFESSION_OPTIONS = PROFESSION_ORDER.map(value => ({ value, label: getProfessionLabel(value) }))
export const TD_POSITION_LABEL = { MELEE: '地上', RANGED: '高台', ALL: '地上・高台' }

function normalizeName(name: string) {
  return name.normalize('NFKC').trim().toLowerCase()
    .replace(/[ァ-ヶ]/g, kana => String.fromCharCode(kana.charCodeAt(0) - 0x60))
}

export function TdDeploymentPicker({ active, operators, recentOperators, error, onRetry, onClose, onSelect }: {
  active: boolean
  operators: readonly TdDeploymentRosterEntry[] | null
  recentOperators: readonly TdDeploymentRosterEntry[]
  error: string
  onRetry: () => void
  onClose: () => void
  onSelect: (operator: TdDeploymentRosterEntry) => void
}) {
  const [filters, setFilters] = useState(EMPTY_OPERATOR_FILTERS)
  const [page, setPage] = useState(0)
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const backdropPress = useRef(false)
  const results = useRef<HTMLDivElement>(null)
  const lastChoice = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!active || !dialog) return
    dialog.showModal()
    const unlock = lockPageScroll(document.documentElement)
    const firstControl = window.matchMedia('(pointer: coarse)').matches ? '.initial-button' : '.search'
    if (lastChoice.current?.isConnected) lastChoice.current.focus()
    else dialog.querySelector<HTMLElement>(firstControl)?.focus({ preventScroll: true })
    return () => {
      unlock()
      dialog.close()
    }
  }, [active])

  const needle = normalizeName(filters.query)
  const matches = operators?.filter(operator =>
    matchesOperatorAttributes(operator, filters) && (!needle || normalizeName(operator.name).includes(needle))) ?? []
  const branches = filters.profession === 'ALL' ? undefined
    : buildSubProfessionOptions(operators ?? [], filters.profession).filter(branch => branch.value)
  const lastPage = Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  const start = currentPage * PAGE_SIZE
  const visible = matches.slice(start, start + PAGE_SIZE)
  const hasFilters = hasActiveOperatorFilters(filters)

  function changeFilters(next: FilterState) {
    setFilters(next)
    setPage(0)
  }

  function selectFromSearch(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement && event.key === 'Enter' &&
        !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && visible.length) {
      event.preventDefault()
      results.current?.querySelector('button')?.click()
    }
  }

  function chooseOperator(operator: TdDeploymentRosterEntry, button: HTMLButtonElement) {
    lastChoice.current = button
    onSelect(operator)
  }

  const reset = () => changeFilters(EMPTY_OPERATOR_FILTERS)
  const picker = <div className="td-deploy-picker" onKeyDown={selectFromSearch}>
    {!hasFilters && <TdRecentAllies operators={recentOperators} onSelect={chooseOperator} />}
    <div className="td-deploy-filter-panel">
      <PageOutputHeader segments={['地形', 'オペレーター配置', 'オペレーターの絞り込み']}
        actions={<button type="button" className="filter-reset-button" disabled={!hasFilters} onClick={reset}>条件をリセット</button>}>
        <h4>オペレーターの絞り込み</h4>
      </PageOutputHeader>
      <Filters value={filters} professionOptions={PROFESSION_OPTIONS} subProfessionOptions={branches}
        onChange={changeFilters} onReset={reset} headingLabel={null}
        searchLabel="名前" searchPlaceholder="オペレーター名で検索" />
    </div>
    <section className="td-deploy-results" aria-label="配置候補">
      <div className="td-deploy-results-heading"><h4>配置候補</h4>
        <span role="status">{operators === null ? '読み込み中…' : matches.length ? `${matches.length}人` : '該当なし'}</span>
      </div>
      <div ref={results} className="td-deploy-search-results">
        {visible.map(operator => <button key={operator.id} type="button" className="button secondary"
          onClick={event => chooseOperator(operator, event.currentTarget)}>
          <strong>{operator.name}</strong>
          <span>{[operator.rarity > 0 && `★${operator.rarity}`, operator.subProfessionName, TD_POSITION_LABEL[operator.position]]
            .filter(Boolean).join(' · ')}</span>
        </button>)}
      </div>
      {lastPage > 0 && <div className="map-pagination td-deploy-pages">
        <button type="button" className="button secondary" disabled={currentPage === 0} aria-label="前の候補"
          onClick={() => setPage(currentPage - 1)}>前へ</button>
        <span aria-live="polite">{start + 1}–{start + visible.length} / {matches.length}人</span>
        <button type="button" className="button secondary" disabled={currentPage === lastPage} aria-label="次の候補"
          onClick={() => setPage(currentPage + 1)}>次へ</button>
      </div>}
    </section>
  </div>

  return <dialog ref={dialogRef} className="td-deploy-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}
    onPointerDown={event => { backdropPress.current = event.target === event.currentTarget }}
    onPointerCancel={() => { backdropPress.current = false }}
    onClick={event => {
      if (backdropPress.current && event.target === event.currentTarget) onClose()
      backdropPress.current = false
    }}>
    <header className="td-deploy-dialog-header">
      <PageOutputHeader segments={['地形', 'オペレーター配置', TITLE]}
        actions={<button type="button" className="button secondary" onClick={onClose}>閉じる</button>}>
        <h2 id={titleId}>{TITLE}</h2>
      </PageOutputHeader>
    </header>
    <div className="td-deploy-dialog-body">
      {error ? <div role="alert">{error} <button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></div> : picker}
    </div>
  </dialog>
}
