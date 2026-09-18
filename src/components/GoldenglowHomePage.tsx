import { GOLDENGLOW_OPERATOR_ID } from '../lib/goldenglowExplosion'
import { GOLDENGLOW_ANALYSIS_ITEMS } from '../lib/navigation'
import { createOperatorDetailHash } from '../lib/routes'
import './DamageCalculator.css'
import './GoldenglowHomePage.css'

const homeItems = [
  {
    id: 'operator-detail',
    href: createOperatorDetailHash(GOLDENGLOW_OPERATOR_ID),
    label: 'オペレーター情報',
    description: '基本情報・スキル・モジュール',
  },
  ...GOLDENGLOW_ANALYSIS_ITEMS,
]

export function GoldenglowHomePage() {
  return (
    <section className="calculator-page gg-home-page" aria-labelledby="gg-home-title">
      <h1 className="gg-home-title" id="gg-home-title">ゴールデングロー</h1>
      <nav aria-label="ゴールデングローの情報・分析">
        <ul className="gg-home-analysis-list">
          {homeItems.map((item) => <li key={item.id}>
            <a className="gg-home-analysis-link" href={item.href} aria-labelledby={`gg-home-${item.id}`}>
              <AnalysisIcon page={item.id} />
              <h2 id={`gg-home-${item.id}`}>{item.label}</h2>
              <span className="gg-home-analysis-description">{item.description}</span>
              <span className="gg-home-analysis-action" aria-hidden="true">開く <span>→</span></span>
            </a>
          </li>)}
        </ul>
      </nav>
    </section>
  )
}

function AnalysisIcon({ page }: { page: string }) {
  return <svg className="gg-home-analysis-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {page === 'operator-detail' ? <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>
      : page === 'goldenglow-performance' ? <><path d="M4 4v16h16" /><path d="m7 14 4-5 4 3 5-6" /></>
      : page === 'goldenglow-guide' ? <path d="m13 3-8 11h6l-1 7 9-12h-6l1-6" />
        : <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></>}
  </svg>
}
