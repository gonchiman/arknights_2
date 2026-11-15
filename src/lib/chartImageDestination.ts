interface ChartImageWritable {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
  abort?: (reason?: unknown) => Promise<void>
}

interface ChartImageFileHandle {
  createWritable: () => Promise<ChartImageWritable>
}

interface ChartImageSavePickerOptions {
  id: string
  suggestedName: string
  excludeAcceptAllOption: boolean
  types: { description: string; accept: Record<string, string[]> }[]
}

export type ChartImageSavePicker = (options: ChartImageSavePickerOptions) => Promise<ChartImageFileHandle>

export type ChartImageDestination =
  | { type: 'file'; write: (blob: Blob) => Promise<void> }
  | { type: 'download' }
  | { type: 'cancelled' }

type ChartFileFormat = 'png' | 'zip' | 'mp4' | 'webm'
const CHART_FILE_TYPES: Record<ChartFileFormat, {
  id: string
  description: string
  mimeType: string
}> = {
  png: { id: 'goldenglow-chart-image', description: 'PNG画像', mimeType: 'image/png' },
  zip: { id: 'surtr-comparison-archive', description: 'PNG画像のZIP', mimeType: 'application/zip' },
  mp4: { id: 'enemy-rating-chart-video', description: 'MP4動画', mimeType: 'video/mp4' },
  webm: { id: 'enemy-rating-chart-video', description: 'WebM動画', mimeType: 'video/webm' },
}

/** Keep the native method's Window receiver, without requiring browser-specific types. */
export function getChartImageSavePicker(): ChartImageSavePicker | undefined {
  if (typeof window === 'undefined') return undefined
  const picker = (window as Window & { showSaveFilePicker?: ChartImageSavePicker }).showSaveFilePicker
  return typeof picker === 'function' ? picker.bind(window) : undefined
}

/** Call from the save gesture, before awaiting PNG rendering or other preparation. */
export async function selectChartImageDestination(
  filename: string,
  picker: ChartImageSavePicker | undefined,
): Promise<ChartImageDestination> {
  return selectChartFileDestination(filename, picker, 'png')
}

/** Select the archive destination before generating its PNG entries. */
export async function selectChartArchiveDestination(
  filename: string,
  picker: ChartImageSavePicker | undefined,
): Promise<ChartImageDestination> {
  return selectChartFileDestination(filename, picker, 'zip')
}

/** Choose a video destination while the save gesture is still active. */
export async function selectChartVideoDestination(
  filename: string,
  picker: ChartImageSavePicker | undefined,
  format: 'mp4' | 'webm',
): Promise<ChartImageDestination> {
  return selectChartFileDestination(withChartVideoExtension(filename, format), picker, format)
}

export function withChartVideoExtension(filename: string, format: 'mp4' | 'webm'): string {
  return `${filename.trim().replace(/\.(?:mp4|webm)$/i, '')}.${format}`
}

async function selectChartFileDestination(
  filename: string,
  picker: ChartImageSavePicker | undefined,
  format: ChartFileFormat,
): Promise<ChartImageDestination> {
  if (!picker) return { type: 'download' }
  const trimmedName = filename.trim()
  const extension = `.${format}`
  const { id, description, mimeType } = CHART_FILE_TYPES[format]
  let handle: ChartImageFileHandle
  try {
    // Invoke immediately so the native picker retains the click's user activation.
    handle = await picker({
      id,
      suggestedName: trimmedName.toLowerCase().endsWith(extension) ? trimmedName : `${trimmedName}${extension}`,
      excludeAcceptAllOption: true,
      types: [{ description, accept: { [mimeType]: [extension] } }],
    })
  } catch (error) {
    // AbortError while writing can mean a failed file check; only picker aborts cancel.
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') {
      return { type: 'cancelled' }
    }
    throw error
  }

  return {
    type: 'file',
    async write(blob) {
      const writable = await handle.createWritable()
      try {
        await writable.write(blob)
        await writable.close()
      } catch (error) {
        try {
          await writable.abort?.(error)
        } catch {
          // Cleanup must preserve the original save failure.
        }
        throw error
      }
    },
  }
}
