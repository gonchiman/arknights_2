import { useEffect, useId, useRef, type ReactNode } from 'react'
import { lockPageScroll } from '../lib/pageScrollLock'
import { PageOutputHeader } from './PageLayout'
import './SkillDpsCombinationDialog.css'

export function SkillDpsCombinationDialog({ title, segments, bodyLabel, className, onClose, children }: {
  title: string
  segments: string[]
  bodyLabel: string
  className?: string
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const backdropPointerDownRef = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (!dialog.open) dialog.showModal()
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus())
    const unlockScroll = lockPageScroll(document.documentElement)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      unlockScroll()
      if (dialog.open) dialog.close()
    }
  }, [])

  return <dialog
    ref={dialogRef}
    className={`skill-dps-combination-dialog${className ? ` ${className}` : ''}`}
    aria-labelledby={titleId}
    aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose() }}
    onPointerDown={event => { backdropPointerDownRef.current = event.target === event.currentTarget }}
    onPointerCancel={() => { backdropPointerDownRef.current = false }}
    onClick={event => {
      if (backdropPointerDownRef.current && event.target === event.currentTarget) onClose()
      backdropPointerDownRef.current = false
    }}
  >
    <div className="skill-dps-combination-dialog-content">
      <header className="skill-dps-combination-dialog-header">
        <PageOutputHeader segments={segments} actions={
          <button ref={closeRef} type="button" className="button secondary" aria-label={`${title}を閉じる`} onClick={onClose}>閉じる</button>
        }>
          <h2 id={titleId}>{title}</h2>
        </PageOutputHeader>
      </header>
      <div className="skill-dps-combination-dialog-body" role="region" tabIndex={0} aria-label={bodyLabel}>
        {children}
      </div>
    </div>
  </dialog>
}
