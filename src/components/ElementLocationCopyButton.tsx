import { useEffect, useRef, useState } from 'react'
import { writeClipboardText } from '../lib/clipboard'
import './ElementLocationCopyButton.css'

type CopyFeedback = { text: string; state: 'copied' | 'failed' }

export function ElementLocationCopyButton({ segments, className, disabled = false }: {
  segments: readonly string[]
  className?: string
  disabled?: boolean
}) {
  const text = segments.join(' / ')
  const currentText = useRef(text)
  const copyInProgress = useRef(false)
  const [copying, setCopying] = useState(false)
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null)
  currentText.current = text

  useEffect(() => { setFeedback(null) }, [text])

  const copyState = feedback?.text === text ? feedback.state : null
  const visualState = copying ? 'copying' : copyState ?? 'idle'

  async function copyLocation() {
    if (disabled || !text || copyInProgress.current) return
    const copiedText = text
    copyInProgress.current = true
    setCopying(true)
    setFeedback(null)
    try {
      await writeClipboardText(`〈${copiedText}〉`)
      if (currentText.current === copiedText) setFeedback({ text: copiedText, state: 'copied' })
    } catch {
      if (currentText.current === copiedText) setFeedback({ text: copiedText, state: 'failed' })
    } finally {
      copyInProgress.current = false
      setCopying(false)
    }
  }

  return <>
    <button type="button" className={`element-location-copy-button${className ? ` ${className}` : ''}`}
      disabled={disabled || !text} aria-disabled={disabled || copying || !text} aria-busy={copying}
      data-copy-state={visualState}
      aria-label={text ? `${text}の場所をコピー` : '場所をコピー'} onClick={() => void copyLocation()}>
      <span className="element-location-copy-face" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false">
          {visualState === 'copied' ? <path d="m5 12 4 4L19 6" />
            : visualState === 'failed' ? <>
              <path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5M12 17h.01" />
            </> : <>
              <rect x="8" y="8" width="12" height="12" rx="1.5" />
              <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
            </>}
        </svg>
      </span>
    </button>
    <span className="visually-hidden" role="status">
      {copyState === 'copied' ? `${text}の場所をコピーしました。`
        : copyState === 'failed' ? `${text}の場所をコピーできませんでした。` : ''}
    </span>
  </>
}
