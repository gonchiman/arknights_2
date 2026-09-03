import { useEffect, useId, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import {
  OperatorDetailContent,
  type OperatorDetailCommonProps,
  type OperatorDetailContentHandle,
} from './OperatorDetailContent'

export interface OperatorDetailModalProps extends OperatorDetailCommonProps {
  onClose: () => void
}

export function OperatorDetailModal({
  operator,
  comparisonOperators,
  skills,
  overrides,
  onOverride,
  onClose,
}: OperatorDetailModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const contentRef = useRef<OperatorDetailContentHandle>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (!dialog.open) dialog.showModal()
    window.requestAnimationFrame(() => {
      contentRef.current?.focusTitle()
    })
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.overflow = previousOverflow
      if (dialog.open) dialog.close()
    }
  }, [operator.operatorId])

  const requestClose = () => {
    if (contentRef.current?.dismissClassifier()) return
    onClose()
  }

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) requestClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="operator-detail-dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        requestClose()
      }}
      onClick={handleBackdropClick}
    >
      <OperatorDetailContent
        ref={contentRef}
        operator={operator}
        comparisonOperators={comparisonOperators}
        skills={skills}
        overrides={overrides}
        onOverride={onOverride}
        variant="modal"
        titleId={titleId}
        headerAction={(
          <button type="button" aria-label="オペレーター詳細を閉じる" onClick={onClose}>×</button>
        )}
      />
    </dialog>
  )
}
