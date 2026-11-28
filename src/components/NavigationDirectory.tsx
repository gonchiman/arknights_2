import type { NavigationGroup, NavigationItem } from '../lib/navigation'
import './HomePage.css'

type NavigationDirectoryProps = {
  groups: readonly NavigationGroup[]
  label: string
  archive?: boolean
}

function PageLinks({ items }: { items: readonly NavigationItem[] }) {
  return <ul>
    {items.map(item => <li key={item.id}>
      <a href={item.href}>{item.label}</a>
      {!!item.children?.length && <PageLinks items={item.children} />}
    </li>)}
  </ul>
}

export function NavigationDirectory({ groups, label, archive }: NavigationDirectoryProps) {
  return <nav aria-label={label} className={archive ? 'page-directory page-directory-archive' : 'page-directory'}>
    {groups.map(group => <div key={group.label}
      className={group.label ? 'page-directory-group' : 'page-directory-group page-directory-secondary'}>
      {group.label && <h2>{group.label}</h2>}
      <PageLinks items={group.items} />
    </div>)}
  </nav>
}
