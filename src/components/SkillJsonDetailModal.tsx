import { useEffect, useId, useRef, useState } from 'react'
import './SkillJsonDetailModal.css'

interface Props {
  title: string
  subtitle: string
  json: string
  onClose: () => void
}

export function SkillJsonDetailModal({ title, subtitle, json, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const backdropPointerDown = useRef(false)
  const titleId = useId()
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const trigger = document.activeElement
    const previousOverflow = document.documentElement.style.overflow
    if (!dialog.open) dialog.showModal()
    document.documentElement.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => titleRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.documentElement.style.overflow = previousOverflow
      if (dialog.open) dialog.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => setCopyState('idle'), [json])

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="skill-json-detail-dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onPointerDown={(event) => { backdropPointerDown.current = event.target === event.currentTarget }}
      onClick={(event) => {
        if (backdropPointerDown.current && event.target === event.currentTarget) onClose()
      }}
    >
      <article className="skill-json-detail-modal">
        <header className="skill-json-detail-header">
          <div>
            <h2 ref={titleRef} id={titleId} tabIndex={-1}>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" aria-label={`${title}を閉じる`} onClick={onClose}>×</button>
        </header>
        <div className="skill-json-detail-body">
          <div className="skill-json-detail-actions">
            <button type="button" onClick={() => void copyJson()}>JSONをコピー</button>
            <span role="status">
              {copyState === 'copied' && 'コピーしました'}
              {copyState === 'failed' && 'コピーできませんでした。下のJSONを選択してコピーしてください。'}
            </span>
          </div>
          <textarea aria-label={title} readOnly value={json} spellCheck={false} wrap="off" />
        </div>
      </article>
    </dialog>
  )
}
