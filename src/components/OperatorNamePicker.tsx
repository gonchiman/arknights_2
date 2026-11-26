import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { EMPTY_OPERATOR_FILTERS, getRecentOperatorRows, matchesOperatorAttributes, matchesOperatorName } from '../lib/operatorSearchFilters'
import type { SkillRecord } from '../types/skill'
import { Filters, type FilterOption } from './Filters'
import { useRecentOperators } from './useRecentOperators'

export type OperatorChoice = Pick<SkillRecord, 'operatorId' | 'operatorName' | 'profession' | 'rarity' | 'nameInitial' | 'subProfessionId'>

export function OperatorNamePicker({ operators, professionOptions, value, onSelect }: {
  operators: readonly OperatorChoice[]
  professionOptions: readonly FilterOption[]
  value: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [attributes, setAttributes] = useState(EMPTY_OPERATOR_FILTERS)
  const { recentOperatorIds, rememberOperator } = useRecentOperators()
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const results = useRef<HTMLDivElement>(null)
  const selected = operators.find(operator => operator.operatorId === value)
  const expanded = open && operators.length > 0

  useEffect(() => {
    if (!expanded) return
    input.current?.focus()
    const dismiss = (event: MouseEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('click', dismiss)
    return () => document.removeEventListener('click', dismiss)
  }, [expanded])

  const searching = query.trim() !== ''
  const matching = expanded ? operators.filter(operator => matchesOperatorAttributes(operator, attributes)
    && (!searching || matchesOperatorName(operator.operatorName, query))) : []
  const recent = searching ? [] : getRecentOperatorRows(matching, recentOperatorIds)
  const candidates = recent.length ? matching.filter(operator => !recent.includes(operator)) : matching

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  function choose(operator: OperatorChoice) {
    rememberOperator(operator.operatorId)
    if (operator.operatorId !== value) onSelect(operator.operatorId)
    close()
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'Enter' && event.target === input.current) {
      event.preventDefault()
      const first = recent[0] ?? candidates[0]
      if (first) choose(first)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (event.target !== input.current && !(event.target instanceof Node && results.current?.contains(event.target))) return
    event.preventDefault()
    const buttons = Array.from(results.current?.querySelectorAll('button') ?? [])
    const index = buttons.findIndex(button => button === event.target)
    if (event.key === 'ArrowUp' && index <= 0) input.current?.focus()
    else buttons[Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))]?.focus()
  }

  function choices(title: string, rows: readonly OperatorChoice[]) {
    if (!rows.length) return null
    return <section aria-label={title} className="dc3-name-choices">
      <span className="dc3-name-group-label">{title}</span>
      <div className="dc3-name-options">{rows.map(row =>
        <button key={row.operatorId} type="button" className="button secondary"
          aria-current={row.operatorId === value ? 'true' : undefined} onClick={() => choose(row)}>
          {row.operatorName}
        </button>)}</div>
    </section>
  }

  return <div className="dc3-name-picker" ref={root}
    onBlur={event => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}>
    <div className="dc3-vote-picker">
      <span>オペレーター</span>
      <button type="button" className="button secondary dc3-name-trigger" ref={trigger}
        aria-label={selected ? `オペレーターを選択（現在：${selected.operatorName}）` : 'オペレーターを選択'}
        aria-expanded={expanded} aria-controls={panelId} disabled={!operators.length}
        onClick={() => { setQuery(''); setOpen(!expanded) }}>
        {selected?.operatorName ?? '該当なし'}
      </button>
    </div>
    <div id={panelId} hidden={!expanded} className="dc3-name-panel" onKeyDown={navigate}>
      {expanded && <>
        <input type="search" aria-label="オペレーター名で検索" placeholder="オペレーター名で検索"
          autoComplete="off" ref={input} value={query} onChange={event => setQuery(event.target.value)} />
        <div className="dc3-name-attributes" role="group" aria-label="候補の絞り込み">
          <Filters value={attributes} onChange={setAttributes} professionOptions={professionOptions}
            headingLabel={null} showNameInitial={false} showSearch={false} />
        </div>
        <div className="dc3-name-results" ref={results}>
          {choices('最近の選択', recent)}
          {choices(searching ? '検索結果' : '候補', candidates)}
          {!candidates.length && !recent.length && <p role="status">該当するオペレーターはいません。</p>}
        </div>
      </>}
    </div>
  </div>
}
