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

export function PageOutputHeader({ segments = [], actions, children }: {
  segments?: readonly string[]
  actions?: ReactNode
  children?: ReactNode
}) {
  const pageTitle = useContext(PageTitleContext)
  if (pageTitle === null) throw new Error('PageOutputHeader requires PageLayout')
  const copyButton = <ElementLocationCopyButton segments={[pageTitle, ...segments]} />
  return <div className={actions ? 'page-output-header page-output-header-with-actions' : 'page-output-header'}>
    {children && <div className="page-output-heading">{children}</div>}
    {actions ? <div className="page-output-actions">{actions}{copyButton}</div> : copyButton}
  </div>
}

export function PageOutputTabs<T extends string>({ format, actions, ...tabProps }: Omit<AnalysisTabsProps<T>, 'appearance'> & {
  format?: string | readonly string[] | null
  actions?: ReactNode
}) {
  const segments = [viewLabel(tabProps.tabs, tabProps.activeTab)]
  if (format) segments.push(...(typeof format === 'string' ? [format] : format))
  return <PageOutputHeader segments={segments} actions={actions}>
    <AnalysisTabs {...tabProps} appearance="underline" />
  </PageOutputHeader>
}
