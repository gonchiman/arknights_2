const encoder = new TextEncoder()
const PREFIX_BYTE_LIMIT = 96

function serializeOptions(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Chart image options must contain finite numbers')
    return Object.is(value, -0) ? '-0' : JSON.stringify(value)
  }
  if (typeof value !== 'object') throw new TypeError('Chart image options must be JSON-compatible')
  if (ancestors.has(value)) throw new TypeError('Chart image options must not contain cycles')
  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Chart image options must contain plain objects')
  }
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError('Chart image options must use string keys')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) return `[${Array.from(value, (item) => serializeOptions(item, ancestors)).join(',')}]`
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${serializeOptions(item, ancestors)}`).join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

function safePrefix(prefix: string): string {
  // Removing dots also keeps reserved Windows device names safe with the hash suffix.
  const sanitized = prefix.replace(/[<>:"/\\|?*.\u0000-\u001f\u007f]/g, '-').trim().replace(/^-+|-+$/g, '')
  let result = ''
  let bytes = 0
  for (const character of sanitized) {
    const length = encoder.encode(character).length
    if (bytes + length > PREFIX_BYTE_LIMIT) break
    result += character
    bytes += length
  }
  return result.trimEnd() || 'chart'
}

/** Pass all options that affect the saved image, including chart kind and ordered series. */
export async function createChartImageFilename(prefix: string, options: object): Promise<string> {
  const serialized = serializeOptions(options)
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(serialized))
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${safePrefix(prefix)}-${hash}.png`
}

/** Equivalent numerical ratios produce the same name, independently of input notation. */
export function withChartImageAspect(filename: string, aspectRatio?: number): string {
  if (aspectRatio !== undefined && (!Number.isFinite(aspectRatio) || aspectRatio <= 0)) {
    throw new TypeError('Chart image aspect ratio must be a positive finite number')
  }
  const aspect = aspectRatio === undefined ? 'auto' : `ratio${aspectRatio}`
  return `${filename.replace(/\.png$/i, '')}-${aspect}.png`
}
