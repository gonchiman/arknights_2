import { useLayoutEffect, useState } from 'react'

const FONT = '"Yu Gothic", "YuGothic", "Hiragino Kaku Gothic ProN", system-ui, sans-serif'

export function estimatedBarChartTextWidth(text: string): number {
  return Array.from(text).reduce((sum, character) => sum + (/[^\x00-\xff]/.test(character) ? 11 : 6.5), 0)
}

/** Screen and image drawings measure labels with the same fixed-size font. */
export function useBarChartTextWidths(texts: readonly string[]) {
  const key = JSON.stringify(texts)
  const [widths, setWidths] = useState<Record<string, number>>({})
  useLayoutEffect(() => {
    let active = true
    const measure = () => {
      if (!active) return
      const context = window.document.createElement('canvas').getContext('2d')
      if (!context) return
      context.font = `600 11px ${FONT}`
      const next: Record<string, number> = {}
      for (const text of JSON.parse(key) as string[]) next[text] = Math.ceil(context.measureText(text).width)
      setWidths(current => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }
    measure()
    void window.document.fonts.ready.then(measure)
    window.document.fonts.addEventListener('loadingdone', measure)
    return () => { active = false; window.document.fonts.removeEventListener('loadingdone', measure) }
  }, [key])
  return (text: string) => widths[text] ?? estimatedBarChartTextWidth(text)
}
