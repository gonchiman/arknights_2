import { PRIMARY_NAV_GROUPS } from '../lib/navigation'
import { NavigationDirectory } from './NavigationDirectory'
import { PageLayout } from './PageLayout'

export function HomePage() {
  return <PageLayout page="home">
    <NavigationDirectory groups={PRIMARY_NAV_GROUPS} label="ホームのページ一覧" />
  </PageLayout>
}
