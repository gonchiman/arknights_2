import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { createOperatorDetailHash, type OperatorDetailSource } from '../lib/routes'

export type OpenOperatorDetail = (
  operatorId: string,
  trigger: HTMLAnchorElement,
) => void

interface Props extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> {
  operatorId: string
  source?: OperatorDetailSource
  onOpenOperatorDetail?: OpenOperatorDetail
}

export function OperatorDetailLink({
  operatorId,
  source,
  onOpenOperatorDetail,
  children,
  ...anchorProps
}: Props) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !onOpenOperatorDetail
      || event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || event.currentTarget.target === '_blank'
    ) {
      return
    }

    event.preventDefault()
    onOpenOperatorDetail(operatorId, event.currentTarget)
  }

  return (
    <a
      {...anchorProps}
      href={createOperatorDetailHash(operatorId, { source })}
      aria-haspopup={onOpenOperatorDetail ? 'dialog' : anchorProps['aria-haspopup']}
      onClick={handleClick}
    >
      {children}
    </a>
  )
}
