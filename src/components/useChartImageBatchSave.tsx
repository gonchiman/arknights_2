import { useRef, useState } from 'react'
import {
  downloadChartFile, getChartImageSavePicker, selectChartArchiveDestination, selectChartImageDestination,
  type ChartImageSavePicker,
} from '../lib/chartImageDestination'
import {
  getChartDirectorySavePicker, selectChartDirectoryDestination,
  type ChartDirectoryDestination, type ChartDirectorySavePicker,
} from '../lib/chartDirectoryDestination'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { createStoredZipArchive } from '../lib/pngZipArchive'
import type { ChartImageRasterOutput } from '../lib/chartImageRasterSize'
import { ChartImageFrame, type ChartImageFrameProps } from './ChartImageFrame'
import { saveComparisonChartImage } from './saveComparisonChartImage'

export interface ChartImageBatchOutput {
  key: string
  filename: string
  frame: ChartImageFrameProps
  /** Optional exact raster size; existing callers retain automatic scaling. */
  output?: ChartImageRasterOutput
}

interface BatchSaveState {
  saving: boolean
  error: boolean | string
  progress: string
  folderProgress: { completed: number; total: number } | null
}

interface BatchSaveOptions {
  outputs: readonly ChartImageBatchOutput[]
  archive: boolean
  folderExport: boolean
  invalid: boolean
  onClose: () => void
}

interface FolderExportSession {
  destination: Extract<ChartDirectoryDestination, { type: 'directory' }>
  files: { name: string; blob: Blob }[]
  nextIndex: number
}

const initialState = (): BatchSaveState => ({ saving: false, error: false, progress: '', folderProgress: null })

/** Keep the save transaction independent of rerenders and of the selected preview. */
export function createChartImageBatchSaveController({ generate, onState,
  download = downloadChartFile,
}: {
  generate: (output: ChartImageBatchOutput) => Promise<Blob>
  onState: (state: BatchSaveState) => void
  download?: typeof downloadChartFile
}) {
  let state = initialState()
  let busy = false
  let session: FolderExportSession | null = null
  const update = (patch: Partial<BatchSaveState>) => { state = { ...state, ...patch }; onState(state) }
  function reset() {
    session = null
    update({ error: false, progress: '', folderProgress: null })
  }
  async function generateFiles(outputs: readonly ChartImageBatchOutput[]) {
    const files: { name: string; blob: Blob }[] = []
    for (const [index, output] of outputs.entries()) {
      update({ progress: `PNG ${index + 1}/${outputs.length}を作成中…` })
      files.push({ name: output.filename, blob: await generate(output) })
    }
    return files
  }
  async function save(options: BatchSaveOptions & {
    picker?: ChartImageSavePicker
    directoryPicker?: ChartDirectorySavePicker
  }, filename: string, chooseLocation: boolean, chooseNewFolder = false) {
    const { outputs, archive, folderExport, invalid, onClose, picker, directoryPicker } = options
    if (invalid || !outputs.length || (folderExport && !directoryPicker) || busy) return
    busy = true
    update({ saving: true, error: false, progress: '' })
    try {
      if (folderExport) {
        let current = chooseNewFolder ? null : session
        if (!current) {
          const destination = await selectChartDirectoryDestination(directoryPicker)
          if (destination.type === 'cancelled') return
          // A cancelled reselection must leave the previous unfinished session available.
          reset()
          const files = await generateFiles(outputs)
          current = { destination, files, nextIndex: 0 }
          session = current
          update({ folderProgress: { completed: 0, total: files.length } })
        }
        while (current.nextIndex < current.files.length) {
          update({ progress: `PNG ${current.nextIndex + 1}/${current.files.length}を保存中…` })
          const file = current.files[current.nextIndex]
          await current.destination.write(file.name, file.blob)
          current.nextIndex += 1
          update({ folderProgress: { completed: current.nextIndex, total: current.files.length } })
        }
        reset()
      } else {
        const selectDestination = archive ? selectChartArchiveDestination : selectChartImageDestination
        const destination = await selectDestination(filename, chooseLocation ? picker : undefined)
        if (destination.type === 'cancelled') return
        if (archive) {
          const files = await generateFiles(outputs)
          update({ progress: 'ZIPを作成中…' })
          const blob = await createStoredZipArchive(files)
          if (destination.type === 'file') await destination.write(blob)
          else download(blob, /\.zip$/i.test(filename) ? filename : `${filename}.zip`)
        } else {
          const blob = await generate({ ...outputs[0], filename })
          if (destination.type === 'file') await destination.write(blob)
          else download(blob, /\.png$/i.test(filename) ? filename : `${filename}.png`)
        }
      }
      onClose()
    } catch {
      update({ error: folderExport
        ? `フォルダへの保存に失敗しました（${session?.nextIndex ?? 0}/${outputs.length}枚保存済み）。`
        : true })
    } finally {
      busy = false
      update({ saving: false, progress: '' })
    }
  }
  return { reset, save }
}

export async function generateChartImageBatchPng(output: ChartImageBatchOutput): Promise<Blob> {
  let result: Blob | null = null
  await saveComparisonChartImage({
    chart: <ChartImageFrame {...output.frame} />, filename: output.filename,
    width: getChartImageLayout(output.frame).width, output: output.output,
    writeBlob: async blob => { result = blob },
  })
  if (!result) throw new Error('グラフのPNG画像を作成できませんでした。')
  return result
}

/** The caller resets only when effective export settings change, never on preview changes. */
export function useChartImageBatchSave(options: BatchSaveOptions) {
  const [state, setState] = useState<BatchSaveState>(initialState)
  const controller = useRef<ReturnType<typeof createChartImageBatchSaveController> | null>(null)
  if (!controller.current) controller.current = createChartImageBatchSaveController({ generate: generateChartImageBatchPng, onState: setState })
  const picker = getChartImageSavePicker()
  const directoryPicker = getChartDirectorySavePicker()
  return {
    ...state, picker, directoryPicker,
    reset: () => controller.current!.reset(),
    save: (filename: string, chooseLocation: boolean, chooseNewFolder = false) =>
      controller.current!.save({ ...options, picker, directoryPicker }, filename, chooseLocation, chooseNewFolder),
  }
}
