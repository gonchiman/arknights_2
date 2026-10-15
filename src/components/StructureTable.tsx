import type { ReactNode } from 'react'

export function StructureTable({ caption, headers, className = '', children }: {
  caption: string
  headers: readonly string[]
  className?: string
  children: ReactNode
}) {
  return <div className="table-wrap skill-structure-table-wrap" tabIndex={0} role="region" aria-label={caption}>
    <table className={`skill-structure-table ${className}`.trim()}>
      <caption className="visually-hidden">{caption}</caption>
      <thead><tr>{headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
}
