import { APP_NAV_ITEMS, DAMAGE_THREE_POWER_BY_YEAR_ITEM, SKILL_DPS_ANALYSIS_ITEM, SKILL_LEARNING_ITEMS, STANDARD_PAGE_TITLES } from '../lib/navigation'
import './HomePage.css'

const HOME_PANELS = [
  {
    id: 'charts',
    title: 'グラフ作成',
    links: [{ label: STANDARD_PAGE_TITLES['bar-chart-workbench'], href: '#/charts/bar' }],
  },
  {
    id: 'operators',
    title: 'オペレーター',
    links: [{ label: 'オペレーターデータベース', href: '#/operators' }, DAMAGE_THREE_POWER_BY_YEAR_ITEM, SKILL_DPS_ANALYSIS_ITEM],
  },
  {
    id: 'enemies',
    title: '敵',
    links: [
      { label: '敵データベース', href: '#/enemies' },
      { label: '敵の統計分析', href: '#/analysis/enemies' },
      { label: '敵の重回帰分析', href: '#/analysis/enemies/regression' },
    ],
  },
  {
    id: 'maps',
    title: 'マップ',
    links: APP_NAV_ITEMS.filter((item) => item.id === 'maps' || item.id === 'td-maps'),
  },
  {
    id: 'operator-analysis',
    title: 'オペレーター個別分析',
    links: APP_NAV_ITEMS.filter((item) => item.section === 'operator-analysis'),
  },
  {
    id: 'skill-learning',
    title: 'スキル学習',
    links: SKILL_LEARNING_ITEMS,
  },
  {
    id: 'code-analysis',
    title: 'コード解析',
    links: [{ label: 'GGの処理を調べる', href: '#/analysis/code' }],
  },
] as const

export function HomePage() {
  return (
    <section className="home-page" aria-labelledby="home-title">
      <header className="home-page-heading">
        <div className="home-page-eyebrow">ARKNIGHTS ANALYZE TOOL</div>
        <h1 id="home-title">ホーム</h1>
      </header>
      <div className="home-panel-grid">
        {HOME_PANELS.map((panel, index) => (
          <section className="home-panel" key={panel.id} aria-labelledby={`home-panel-${panel.id}`}>
            <header className="home-panel-heading">
              <span className="home-panel-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <h2 id={`home-panel-${panel.id}`}>{panel.title}</h2>
            </header>
            <div className="home-panel-body">
              {panel.links.map((link) => (
                <a className="home-panel-link" key={link.href} href={link.href}>
                  <span>{link.label}</span>
                  <span className="home-panel-arrow" aria-hidden="true">→</span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
