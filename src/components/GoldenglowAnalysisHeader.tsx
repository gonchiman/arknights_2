import { GOLDENGLOW_HOME_LINK } from '../lib/navigation'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import './GoldenglowAnalysisHeader.css'

export function GoldenglowAnalysisHeader({ id, title }: { id: string; title: string }) {
  return <div className="page-heading-with-breadcrumbs">
    <PageBreadcrumbs parents={[GOLDENGLOW_HOME_LINK]} current={title} />
    <header className="page-intro gg-analysis-intro">
      <h1 id={id}>{title}</h1>
    </header>
  </div>
}
