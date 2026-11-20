import { CHART_IMAGE_FILENAME_BYTE_LIMIT } from './chartImageFilename.ts'

export interface ChartDirectoryWritable {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
  abort?: (reason?: unknown) => Promise<void>
}

export interface ChartDirectoryFileHandle {
  createWritable: () => Promise<ChartDirectoryWritable>
  isSameEntry?: (other: ChartDirectoryFileHandle) => Promise<boolean>
}

export interface ChartDirectoryHandle {
  name: string
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<ChartDirectoryFileHandle>
  removeEntry: (name: string) => Promise<void>
}

export type ChartDirectorySavePicker = (options: {
  id: string
  mode: 'readwrite'
}) => Promise<ChartDirectoryHandle>

export type ChartDirectoryDestination =
  | { type: 'directory'; name: string; write: (filename: string, blob: Blob) => Promise<string> }
  | { type: 'cancelled' }

const encoder = new TextEncoder()
const FILENAME_BYTE_LIMIT = CHART_IMAGE_FILENAME_BYTE_LIMIT

/** Native pickers require their Window receiver. Unsupported browsers remain explicit. */
export function getChartDirectorySavePicker(): ChartDirectorySavePicker | undefined {
  if (typeof window === 'undefined') return undefined
  const picker = (window as Window & { showDirectoryPicker?: ChartDirectorySavePicker }).showDirectoryPicker
  return typeof picker === 'function' ? picker.bind(window) : undefined
}

function errorName(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
    ? error.name : undefined
}

function pngFilename(filename: string, copy: number): string {
  const name = filename.trim()
  if (!name || /[<>:"/\\|?*\u0000-\u001f\u007f]/u.test(filename) || !/\.png$/i.test(name)) {
    throw new Error('PNGのファイル名に使えない文字が含まれています。')
  }
  const extension = name.slice(-4)
  const stem = name.slice(0, -4)
  if (!stem.trim() || /^[. ]+$/.test(stem)
    || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(stem)) {
    throw new Error('PNGのファイル名を確認してください。')
  }
  const number = copy === 1 ? '' : ` (${copy})`
  if (encoder.encode(`${stem}${number}${extension}`).length <= FILENAME_BYTE_LIMIT) {
    return `${stem}${number}${extension}`
  }
  // Keep the aspect suffix readable when a collision number needs extra bytes.
  const matchedAspect = stem.match(/_比率(?:自動|[\d.e+-]+x[\d.e+-]+)$/i)?.[0] ?? ''
  const aspect = encoder.encode(`…${number}${matchedAspect}${extension}`).length <= FILENAME_BYTE_LIMIT
    ? matchedAspect : ''
  const head = aspect ? stem.slice(0, -aspect.length) : stem
  const suffix = `…${number}${aspect}${extension}`
  const limit = FILENAME_BYTE_LIMIT - encoder.encode(suffix).length
  let prefix = ''
  for (const character of head) {
    if (encoder.encode(prefix + character).length > limit) break
    prefix += character
  }
  return `${prefix}${suffix}`
}

async function isOccupied(directory: ChartDirectoryHandle, filename: string): Promise<boolean> {
  try {
    await directory.getFileHandle(filename)
    return true
  } catch (error) {
    const name = errorName(error)
    if (name === 'NotFoundError') return false
    if (name === 'TypeMismatchError') return true // A directory with the same name also occupies it.
    throw error
  }
}

async function writePng(directory: ChartDirectoryHandle, filename: string, blob: Blob): Promise<string> {
  let copy = 1
  let availableName = pngFilename(filename, copy)
  while (await isOccupied(directory, availableName)) availableName = pngFilename(filename, ++copy)
  const handle = await directory.getFileHandle(availableName, { create: true })
  let writable: ChartDirectoryWritable | undefined
  try {
    writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return availableName
  } catch (error) {
    try { await writable?.abort?.(error) } catch { /* Preserve the original write error. */ }
    try {
      // Only the newly created failed entry is eligible for cleanup.
      const current = await directory.getFileHandle(availableName)
      if (current === handle || (handle.isSameEntry && await handle.isSameEntry(current))) {
        await directory.removeEntry(availableName)
      }
    } catch { /* Cleanup failure must not turn a failed write into success. */ }
    throw error
  }
}

/** Select immediately from the save gesture, before any image rendering has been awaited. */
export async function selectChartDirectoryDestination(
  picker: ChartDirectorySavePicker | undefined,
): Promise<ChartDirectoryDestination> {
  if (!picker) throw new Error('このブラウザーはフォルダ保存に対応していません。')
  let directory: ChartDirectoryHandle
  try {
    directory = await picker({ id: 'chart-png-directory', mode: 'readwrite' })
  } catch (error) {
    if (errorName(error) === 'AbortError') return { type: 'cancelled' }
    throw error
  }
  // Serialize writes from the same selection so equal names cannot race within one export.
  let tail: Promise<unknown> = Promise.resolve()
  return {
    type: 'directory', name: directory.name,
    write(filename, blob) {
      const writing = tail.then(() => writePng(directory, filename, blob))
      tail = writing.catch(() => {})
      return writing
    },
  }
}
