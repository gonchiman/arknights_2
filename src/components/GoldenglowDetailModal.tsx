import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import './GoldenglowDetailModal.css'

export function GoldenglowDetailModal({ title, closeLabel, children, onClose, className, initialFocusRef, closeDisabled = false }: {
  title: string
  closeLabel: string
  children: ReactNode
  onClose: () => void
  className?: string
  initialFocusRef?: RefObject<HTMLElement | null>
  closeDisabled?: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const backdropPointerDown = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const trigger = document.activeElement
    const previousOverflow = document.documentElement.style.overflow
    if (!dialog.open) dialog.showModal()
    document.documentElement.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => (initialFocusRef?.current ?? titleRef.current)?.focus())

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.documentElement.style.overflow = previousOverflow
      if (dialog.open) dialog.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [initialFocusRef])

  return (
    <dialog
      ref={dialogRef}
      className={`gg-detail-dialog${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        if (!closeDisabled) onClose()
      }}
      onPointerDown={(event) => { backdropPointerDown.current = event.target === event.currentTarget }}
      onClick={(event) => {
        if (!closeDisabled && backdropPointerDown.current && event.target === event.currentTarget) onClose()
      }}
    >
      <header className="gg-detail-header">
        <h2 ref={titleRef} id={titleId} tabIndex={-1}>{title}</h2>
        <button type="button" aria-label={closeLabel} disabled={closeDisabled}
          onClick={() => { if (!closeDisabled) onClose() }}>×</button>
      </header>
      <div className="gg-detail-body">{children}</div>
    </dialog>
  )
}
