import { ARCHIVE_NAV_GROUPS, HOME_LINK, STANDARD_PAGE_TITLES } from '../lib/navigation'
import { NavigationDirectory } from './NavigationDirectory'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import { PageLayout, PageOutputHeader } from './PageLayout'

export function ArchivePage() {
  return <PageLayout page="archive">
    <PageOutputHeader>
      <PageBreadcrumbs parents={[HOME_LINK]} current={STANDARD_PAGE_TITLES.archive} />
    </PageOutputHeader>
    <NavigationDirectory groups={ARCHIVE_NAV_GROUPS} label="保管庫のページ一覧" archive />
  </PageLayout>
}
