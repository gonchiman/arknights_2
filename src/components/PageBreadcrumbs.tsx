import './PageBreadcrumbs.css'

export interface PageBreadcrumbsProps {
  parents: readonly { label: string; href: string }[]
  current: string
}

export function PageBreadcrumbs({ parents, current }: PageBreadcrumbsProps) {
  return <nav className="page-breadcrumbs" aria-label="パンくず">
    <ol>
      {parents.map((parent) => <li key={parent.href}>
        <a href={parent.href}>{parent.label}</a>
        <span className="page-breadcrumbs-separator" aria-hidden="true">›</span>
      </li>)}
      <li aria-current="page">{current}</li>
    </ol>
  </nav>
}
