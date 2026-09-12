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
  if (!picker) return { type: 'download' }
  const trimmedName = filename.trim()
  let handle: ChartImageFileHandle
  try {
    // Invoke immediately so the native picker retains the click's user activation.
    handle = await picker({
      id: 'goldenglow-chart-image',
      suggestedName: /\.png$/i.test(trimmedName) ? trimmedName : `${trimmedName}.png`,
      excludeAcceptAllOption: true,
      types: [{ description: 'PNG画像', accept: { 'image/png': ['.png'] } }],
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
          // Cleanup must not replace the failure that prevented the image from saving.
        }
        throw error
      }
    },
  }
}
