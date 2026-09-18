import './GoldenglowAnalysisHeader.css'

export function GoldenglowAnalysisHeader({ id, title }: { id: string; title: string }) {
  return <header className="page-intro gg-analysis-intro">
    <a className="gg-analysis-home-link" href="#/analysis/goldenglow"><span aria-hidden="true">←</span> GGトップ</a>
    <div>
      <span className="page-kicker">GOLDENGLOW</span>
      <h1 id={id}>{title}</h1>
    </div>
  </header>
}
