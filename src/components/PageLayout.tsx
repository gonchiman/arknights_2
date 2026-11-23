import { createContext, useContext, type ReactNode } from 'react'
import { STANDARD_PAGE_TITLES } from '../lib/navigation'
import { AnalysisTabs, type AnalysisTabsProps } from './AnalysisTabs'
import { ElementLocationCopyButton } from './ElementLocationCopyButton'
import { viewLabel } from './PageViewSwitch'
import './PageLayout.css'

const PageTitleContext = createContext<string | null>(null)

export function PageLayout({ page, settings, children, className }: {
  page: keyof typeof STANDARD_PAGE_TITLES
  settings?: ReactNode
  children: ReactNode
  className?: string
}) {
  return <PageTitleContext.Provider value={STANDARD_PAGE_TITLES[page]}>
    <section className={className ? `standard-page ${className}` : 'standard-page'}>
      {settings && <div className="standard-page-settings">{settings}</div>}
      {children}
    </section>
  </PageTitleContext.Provider>
}

export function PageOutputHeader({ segments = [], children }: {
  segments?: readonly string[]
  children?: ReactNode
}) {
  const pageTitle = useContext(PageTitleContext)
  if (pageTitle === null) throw new Error('PageOutputHeader requires PageLayout')
  return <div className="page-output-header">
    {children && <div className="page-output-heading">{children}</div>}
    <ElementLocationCopyButton segments={[pageTitle, ...segments]} />
  </div>
}

export function PageOutputTabs<T extends string>({ format, ...tabProps }: Omit<AnalysisTabsProps<T>, 'appearance'> & {
  format?: string | readonly string[] | null
}) {
  const segments = [viewLabel(tabProps.tabs, tabProps.activeTab)]
  if (format) segments.push(...(typeof format === 'string' ? [format] : format))
  return <PageOutputHeader segments={segments}>
    <AnalysisTabs {...tabProps} appearance="underline" />
  </PageOutputHeader>
}
