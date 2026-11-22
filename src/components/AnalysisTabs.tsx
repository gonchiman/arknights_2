import type { KeyboardEvent, ReactNode } from 'react'
import './AnalysisTabs.css'

export interface AnalysisTabsProps<T extends string> {
  tabs: readonly (readonly [T, string])[]
  activeTab: T
  onChange: (tab: T) => void
  idPrefix: string
  label: string
  appearance?: 'boxed' | 'underline'
}

export function AnalysisTabs<T extends string>({ tabs, activeTab, onChange, idPrefix, label, appearance = 'boxed' }: AnalysisTabsProps<T>) {
  function changeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault()
    const [tab] = tabs[next]
    onChange(tab)
    window.requestAnimationFrame(() => document.getElementById(`${idPrefix}-tab-${tab}`)?.focus({ preventScroll: true }))
  }
  return <div className={appearance === 'boxed' ? 'detail-tabs analysis-tabs' : 'detail-tabs analysis-tabs-underline'} role="tablist" aria-label={label}>
    {tabs.map(([tab, title], index) => <button type="button" key={tab} id={`${idPrefix}-tab-${tab}`}
      className={`detail-tab${activeTab === tab ? ' active' : ''}`} role="tab" aria-selected={activeTab === tab}
      aria-controls={`${idPrefix}-panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1}
      onClick={() => onChange(tab)} onKeyDown={event => changeWithKeyboard(event, index)}>{title}</button>)}
  </div>
}

export function AnalysisTabPanel({ idPrefix, tab, activeTab, title, headerActions, children }: {
  idPrefix: string; tab: string; activeTab: string; title?: string; headerActions?: ReactNode; children: ReactNode
}) {
  return <section className={title ? 'analysis-tab-panel' : 'analysis-tab-content'} id={`${idPrefix}-panel-${tab}`} role="tabpanel"
    aria-labelledby={`${idPrefix}-tab-${tab}`} hidden={activeTab !== tab}>
    {title && (headerActions ? <div className="analysis-tab-panel-header"><h2>{title}</h2>{headerActions}</div> : <h2>{title}</h2>)}
    {children}
  </section>
}
