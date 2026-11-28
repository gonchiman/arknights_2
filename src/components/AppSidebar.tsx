import { useEffect, useRef } from 'react'
import { HOME_LINK, PRIMARY_NAV_GROUPS, type NavigationPage } from '../lib/navigation'

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
      <aside className={`app-sidebar ${open ? 'open' : ''}`} id="app-sidebar" aria-label="メインナビゲーション" inert={!open}>
        <div className="sidebar-header">
          <a className="site-brand" href={HOME_LINK.href} onClick={onClose} aria-label="Arknights Analyze Tool ホーム" aria-current={activePage === 'home' ? 'page' : undefined}>
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
          {PRIMARY_NAV_GROUPS.map((group) => (
            <div className="sidebar-nav-group" key={group.label}>
              {group.label && <p className="sidebar-section-label">{group.label}</p>}
              {group.items.map((item) => (
                <a
                  key={item.id}
                  className={`sidebar-nav-link${item.id === activePage ? ' active' : ''}`}
                  href={item.href}
                  aria-current={item.id === activePage ? 'page' : undefined}
                  onClick={onClose}
                >{item.label}</a>
              ))}
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
