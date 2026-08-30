export type NavigationPage = 'classifier' | 'skills' | 'damage' | 'comparison' | 'enemies'

type NavigationItem = {
  id: NavigationPage
  href: string
  label: string
  description: string
}

export const APP_NAV_ITEMS: readonly NavigationItem[] = [
  {
    id: 'classifier',
    href: '#/',
    label: 'Skill Model Classifier',
    description: 'オペレーター別のスキル分類',
  },
  {
    id: 'skills',
    href: '#/skills',
    label: 'All Skills',
    description: '全スキルの一覧と絞り込み',
  },
  {
    id: 'damage',
    href: '#/damage',
    label: 'Damage Calculator',
    description: '攻撃・スキルダメージ計算',
  },
  {
    id: 'comparison',
    href: '#/comparison',
    label: 'Operator Comparison',
    description: 'オペレーター性能の横断比較',
  },
  {
    id: 'enemies',
    href: '#/enemies',
    label: 'Enemy Analysis',
    description: '敵ステータスの検索と分析',
  },
]

type AppSidebarProps = {
  activePage: NavigationPage
  open: boolean
  onClose: () => void
}

export function AppSidebar({ activePage, open, onClose }: AppSidebarProps) {
  return (
    <>
      <aside className={`app-sidebar ${open ? 'open' : ''}`} id="app-sidebar" aria-label="メインナビゲーション">
        <div className="sidebar-header">
          <a className="site-brand" href="#/" onClick={onClose} aria-label="Arknights Analyze Tool ホーム">
            <span className="brand-mark" aria-hidden="true">A</span>
            <span className="brand-copy">
              <span className="eyebrow">ARKNIGHTS</span>
              <span className="brand-title">Analyze Tool</span>
            </span>
          </a>
          <button className="sidebar-close" type="button" onClick={onClose} aria-label="メニューを閉じる">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="分析ページ">
          <p className="sidebar-section-label">ANALYSIS TOOLS</p>
          {APP_NAV_ITEMS.map((item, index) => {
            const active = item.id === activePage
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
        aria-label="メニューを閉じる"
      />
    </>
  )
}
