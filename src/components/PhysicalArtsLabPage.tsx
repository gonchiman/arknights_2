import { HOME_LINK, PHYSICAL_ARTS_LAB_ITEM, PHYSICAL_ARTS_LAB_ITEMS } from '../lib/navigation'
import { NavigationDirectory } from './NavigationDirectory'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import { PageLayout, PageOutputHeader } from './PageLayout'

const researchTheme = '物理属性と術属性はどちらのほうが強いのか？'

export function PhysicalArtsLabPage() {
  return <PageLayout page="physical-arts-lab" className="physical-arts-lab">
    <PageOutputHeader>
      <PageBreadcrumbs parents={[HOME_LINK]} current={PHYSICAL_ARTS_LAB_ITEM.label} />
    </PageOutputHeader>
    <NavigationDirectory groups={[{ label: researchTheme, items: PHYSICAL_ARTS_LAB_ITEMS }]} label="物理・術比較ラボのページ一覧" />
  </PageLayout>
}
