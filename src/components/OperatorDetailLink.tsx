import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { createOperatorDetailHash } from '../lib/routes'

export type OpenOperatorDetail = (
  operatorId: string,
  trigger: HTMLAnchorElement,
) => void

interface Props extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> {
  operatorId: string
  onOpenOperatorDetail?: OpenOperatorDetail
}

export function OperatorDetailLink({
  operatorId,
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
      href={createOperatorDetailHash(operatorId)}
      aria-haspopup={onOpenOperatorDetail ? 'dialog' : anchorProps['aria-haspopup']}
      onClick={handleClick}
    >
      {children}
    </a>
  )
}
