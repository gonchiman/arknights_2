import { createOperatorDetailHash } from '../lib/routes'
import { SURTR_ANALYSIS_ITEMS } from '../lib/navigation'
import './SurtrHomePage.css'

export function SurtrHomePage() {
  return (
    <section className="surtr-home-page" aria-labelledby="surtr-home-title">
      <a
        className="surtr-home-header"
        href={createOperatorDetailHash('char_350_surtr', { source: 'surtr-home' })}
        aria-label="スルトのOP情報"
      >
        <h1 className="surtr-home-title" id="surtr-home-title">スルト</h1>
        <ul className="surtr-home-profile" aria-label="基本情報">
          <li aria-label="レアリティ6">★6</li>
          <li>前衛</li>
          <li>術戦士</li>
        </ul>
        <span className="surtr-home-info-action" aria-hidden="true">OP情報 <span>→</span></span>
      </a>
      <nav aria-label="スルトの分析">
        <ul className="surtr-home-analysis-list">
          {SURTR_ANALYSIS_ITEMS.map((item) => <li key={item.id}>
            <a className="surtr-home-analysis-link" href={item.href} aria-labelledby={`surtr-home-${item.id}`}>
              <svg className="surtr-home-analysis-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4v16h16" /><path d="m7 14 4-5 4 3 5-6" />
              </svg>
              <h2 id={`surtr-home-${item.id}`}>{item.label}</h2>
              <span className="surtr-home-analysis-action" aria-hidden="true">開く <span>→</span></span>
            </a>
          </li>)}
        </ul>
      </nav>
    </section>
  )
}
