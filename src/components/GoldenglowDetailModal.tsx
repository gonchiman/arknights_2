import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { lockPageScroll } from '../lib/pageScrollLock'
import './GoldenglowDetailModal.css'

export function GoldenglowDetailModal({ title, closeLabel, children, onClose, className, initialFocusRef, closeDisabled = false, closeOnContextMenu = false }: {
  title: string
  closeLabel: string
  children: ReactNode
  onClose: () => void
  closeOnContextMenu?: boolean
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
    if (!dialog.open) dialog.showModal()
    const unlockScroll = lockPageScroll(document.documentElement)
    const focusFrame = window.requestAnimationFrame(() => (initialFocusRef?.current ?? titleRef.current)?.focus())

    return () => {
      window.cancelAnimationFrame(focusFrame)
      unlockScroll()
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
      onContextMenu={closeOnContextMenu ? (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!closeDisabled) onClose()
      } : undefined}
      onCancel={(event) => {
        // Escape in a nested dialog should only close that dialog.
        if (event.target !== event.currentTarget) return
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
