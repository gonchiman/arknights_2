const encoder = new TextEncoder()
const FILENAME_BYTE_LIMIT = 240
export type ChartImageFilenamePart = string | number | null | undefined | false

function sanitizePart(value: string): string {
  const sanitized = value.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/\s+/g, '').replace(/^[. _]+|[. _]+$/g, '')
  return /^-*$/.test(sanitized) ? '' : sanitized
}

function truncateText(value: string, byteLimit: number): string {
  let text = ''
  for (const character of value) {
    if (encoder.encode(text + character).length > byteLimit) break
    text += character
  }
  return text
}

function fitParts(parts: string[], byteLimit: number, previouslyOmitted = 0): string {
  const omission = (count: number) => count > 0 ? `ほか${count}項目` : ''
  const joined = [...parts, omission(previouslyOmitted)].filter(Boolean).join('_')
  if (encoder.encode(joined).length <= byteLimit) return joined
  const kept: string[] = []
  for (let index = 0; index < parts.length; index += 1) {
    const omittedAfter = parts.length - index - 1 + previouslyOmitted
    const candidate = [...kept, parts[index], omission(omittedAfter)].filter(Boolean).join('_')
    if (encoder.encode(candidate).length > byteLimit) {
      const marker = omission(parts.length - index + previouslyOmitted)
      if (kept.length === 0) {
        const suffix = `…_${marker}`
        return truncateText(parts[index], byteLimit - encoder.encode(suffix).length) + suffix
      }
      return [...kept, marker].join('_')
    }
    kept.push(parts[index])
  }
  return [...kept, omission(previouslyOmitted)].filter(Boolean).join('_')
}

function safeFilename(parts: string[], suffix = '', previouslyOmitted = 0): string {
  const extension = `${suffix}.png`
  // Readable names need explicit protection from Windows device names.
  const reserved = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(parts[0])
  const stem = fitParts(reserved ? ['画像', ...parts] : parts,
    FILENAME_BYTE_LIMIT - encoder.encode(extension).length, previouslyOmitted)
  return `${stem}${extension}`
}

/** Parts are ordered from the main conditions to optional display details. */
export function createChartImageFilename(prefix: string, parts: readonly ChartImageFilenamePart[] = []): string {
  const tokens = [prefix, ...parts].flatMap((part) => {
    if (part === null || part === undefined || part === false || part === '') return []
    if (typeof part !== 'string' && typeof part !== 'number') throw new TypeError('Filename parts must be strings or finite numbers')
    if (typeof part === 'number' && !Number.isFinite(part)) throw new TypeError('Filename numbers must be finite')
    return sanitizePart(String(part)).split('_').filter(Boolean)
  })
  return safeFilename(tokens.length > 0 ? tokens : ['グラフ'])
}

/** Keep order and exact values; compress only a complete arithmetic sequence. */
export function formatChartFilenameValues(values: readonly number[]): string {
  if (!values.every(Number.isFinite)) throw new TypeError('Filename values must be finite')
  const step = values.length > 1 ? values[1] - values[0] : 0
  if (values.length >= 3 && step !== 0 && values.every((value, index) => value === values[0] + index * step)) {
    return `${values[0]}-${values.at(-1)}刻み${step}`
  }
  return values.join('-')
}

function formatAspect(aspectRatio?: number): string {
  if (aspectRatio === undefined) return '比率自動'
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) throw new TypeError('Chart image aspect ratio must be a positive finite number')
  // The save UI accepts integer sides from 1 to 100. Reduce equivalent ratios.
  for (let denominator = 1; denominator <= 100; denominator += 1) {
    const numerator = Math.round(aspectRatio * denominator)
    if (numerator >= 1 && numerator <= 100 && numerator / denominator === aspectRatio) {
      return `比率${numerator}x${denominator}`
    }
  }
  return `比率${aspectRatio}x1`
}

/** Preserve custom names in the dialog; call this only for automatic names. */
export function withChartImageAspect(filename: string, aspectRatio?: number): string {
  const suffix = `_${formatAspect(aspectRatio)}`
  const stem = filename.replace(/\.png$/i, '').replace(/_比率(?:自動|[\d.e+-]+x[\d.e+-]+)$/i, '')
  const omitted = stem.match(/_ほか(\d+)項目$/)
  const parts = (omitted ? stem.slice(0, -omitted[0].length) : stem).split('_').filter(Boolean)
  return safeFilename(parts.length > 0 ? parts : ['グラフ'], suffix, Number(omitted?.[1] ?? 0))
}
