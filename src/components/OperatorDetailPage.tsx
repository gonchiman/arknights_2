import { useId } from 'react'
import {
  OperatorDetailContent,
  type OperatorDetailCommonProps,
} from './OperatorDetailContent'
import './OperatorDetailPage.css'

export interface OperatorDetailPageProps extends OperatorDetailCommonProps {
  backHref?: string
  backLabel?: string
}

export function OperatorDetailPage({
  operator,
  comparisonOperators,
  skills,
  overrides,
  onOverride,
  backHref = '#/operators',
  backLabel = 'オペレーター一覧へ戻る',
}: OperatorDetailPageProps) {
  const titleId = useId()

  return (
    <section className="operator-detail-page" aria-labelledby={titleId}>
      <OperatorDetailContent
        operator={operator}
        comparisonOperators={comparisonOperators}
        skills={skills}
        overrides={overrides}
        onOverride={onOverride}
        variant="page"
        titleId={titleId}
        headerAction={(
          <a className="operator-detail-page-back" href={backHref}>{backLabel}</a>
        )}
      />
    </section>
  )
}
