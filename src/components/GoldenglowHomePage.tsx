import { useMemo } from 'react'
import { deriveGoldenglowGuideSkills } from '../lib/goldenglowGuideSkill'
import { GOLDENGLOW_ANALYSIS_ITEMS } from '../lib/navigation'
import type { SkillRecord } from '../types/skill'
import { GoldenglowOperatorInfo } from './GoldenglowOperatorInfo'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'
import './GoldenglowHomePage.css'

export function GoldenglowHomePage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const skill = useMemo(() => {
    const skills = deriveGoldenglowGuideSkills(rows)
    return skills.find((candidate) => candidate.skillIndex === 3) ?? skills[0] ?? null
  }, [rows])

  return (
    <section className="calculator-page gg-reference-page gg-home-page" aria-labelledby="gg-home-title">
      <header className="page-intro gg-home-intro">
        <div>
          <span className="page-kicker">OPERATOR ANALYSIS</span>
          <h1 id="gg-home-title">ゴールデングロー</h1>
          <p className="gg-home-profession">★6 · 術師 / 操機術師</p>
        </div>
        <span className="gg-home-mark" aria-hidden="true">GG</span>
      </header>

      <GoldenglowOperatorInfo skill={skill} loading={loading} defaultOpen={false} />
      {!loading && !skill && <div className="gg-home-load-error" role="alert">
        <p>{error ?? 'ゴールデングローの情報を取得できませんでした。'}</p>
        <button type="button" className="button secondary" onClick={onRetry}>再読み込み</button>
      </div>}

      <nav className="gg-home-analyses" aria-labelledby="gg-home-analyses-title">
        <h2 id="gg-home-analyses-title">分析</h2>
        <ul className="gg-home-analysis-list">
          {GOLDENGLOW_ANALYSIS_ITEMS.map((item) => <li key={item.id}>
            <a className="gg-home-analysis-link" href={item.href} aria-labelledby={`gg-home-${item.id}`}>
              <AnalysisIcon page={item.id} />
              <h3 id={`gg-home-${item.id}`}>{item.label}</h3>
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
    {page === 'goldenglow-performance' ? <><path d="M4 4v16h16" /><path d="m7 14 4-5 4 3 5-6" /></>
      : page === 'goldenglow-guide' ? <path d="m13 3-8 11h6l-1 7 9-12h-6l1-6" />
        : <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></>}
  </svg>
}
