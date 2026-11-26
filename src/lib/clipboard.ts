export async function writeClipboardText(text: string, trigger?: HTMLElement): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // 権限がない環境では、同じクリック操作内で従来方式を試します。
    }
  }

  const previousFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  // A native modal makes the rest of the document inert, including a textarea appended to body.
  const dialog = (trigger?.isConnected ? trigger.closest('dialog[open]') : null)
    ?? previousFocus?.closest('dialog[open]')
  const container = dialog ?? document.body
  container.append(textarea)

  let copied = false
  try {
    textarea.focus({ preventScroll: true })
    if (document.activeElement === textarea) {
      textarea.select()
      textarea.setSelectionRange(0, textarea.value.length)
      copied = document.execCommand('copy')
    }
  } finally {
    textarea.remove()
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  }

  if (!copied) throw new Error('クリップボードへコピーできませんでした。')
}
