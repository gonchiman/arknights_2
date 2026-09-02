import { useEffect, useRef } from 'react'
import { APP_NAV_ITEMS, NAVIGATION_SECTIONS, type NavigationPage } from '../lib/navigation'

type AppSidebarProps = {
  activePage: NavigationPage
  open: boolean
  onClose: () => void
}

export function AppSidebar({ activePage, open, onClose }: AppSidebarProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  return (
    <>
      <aside className={`app-sidebar ${open ? 'open' : ''}`} id="app-sidebar" aria-label="メインナビゲーション">
        <div className="sidebar-header">
          <a className="site-brand" href="#/operators" onClick={onClose} aria-label="Arknights Analyze Tool ホーム">
            <span className="brand-mark" aria-hidden="true">A</span>
            <span className="brand-copy">
              <span className="eyebrow">ARKNIGHTS</span>
              <span className="brand-title">Analyze Tool</span>
            </span>
          </a>
          <button ref={closeButtonRef} className="sidebar-close" type="button" onClick={onClose} aria-label="メニューを閉じる">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="メインページ">
          {NAVIGATION_SECTIONS.map((section) => (
            <div className="sidebar-nav-group" key={section.id}>
              <p className="sidebar-section-label">{section.label}</p>
              {APP_NAV_ITEMS.filter((item) => item.section === section.id).map((item) => {
                const active = item.id === activePage
                const index = APP_NAV_ITEMS.indexOf(item)
                return (
                  <a
                    key={item.id}
                    className={`sidebar-nav-link ${active ? 'active' : ''}`}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={onClose}
                  >
                    <span className="sidebar-nav-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <span className="sidebar-nav-copy">
                      <span className="sidebar-nav-title">{item.label}</span>
                      <span className="sidebar-nav-description">{item.description}</span>
                    </span>
                  </a>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-meta" aria-label="データセット情報">
          <span className="sidebar-meta-label">DATASET</span>
          <strong>Arknights JP</strong>
          <span>Game data analysis workspace</span>
        </div>
      </aside>
      <button
        className={`sidebar-backdrop ${open ? 'visible' : ''}`}
        type="button"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        aria-hidden={!open}
        aria-label="メニューを閉じる"
      />
    </>
  )
}
