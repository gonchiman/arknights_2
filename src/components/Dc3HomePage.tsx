import { DC3_HOME_ITEM, DC3_NAV_ITEMS, HOME_LINK } from '../lib/navigation'
import { NavigationDirectory } from './NavigationDirectory'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import { PageLayout, PageOutputHeader } from './PageLayout'

export function Dc3HomePage() {
  return <PageLayout page="dc3-home">
    <PageOutputHeader>
      <PageBreadcrumbs parents={[HOME_LINK]} current={DC3_HOME_ITEM.label} />
    </PageOutputHeader>
    <NavigationDirectory groups={[{ label: '', items: DC3_NAV_ITEMS }]} label="DC3のページ一覧" />
  </PageLayout>
}
