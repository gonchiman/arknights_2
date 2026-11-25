import { createContext, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { downloadChartFile, getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { createChartImageFilename } from '../lib/chartImageFilename'
import type { MapSummary } from '../types/map'
import { ChartImageHeading } from './ChartImageFrame'
import { ChartImageSaveDialog } from './ChartImageSaveDialog'
import { OutputImageSaveButton } from './OutputImageSaveButton'
import { TdDeploymentContext, useTdDeployment } from './TdDeploymentContext'
import './TdMapImage.css'

export const TdMapSaveButtonTarget = createContext<HTMLSpanElement | null>(null)

interface MapSnapshot {
  filename: string
  image: ReactElement
}

function MapImageDialog({ snapshot, onClose }: { snapshot: MapSnapshot; onClose: () => void }) {
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null)
  const [error, setError] = useState<string | false>(false)
  const [saving, setSaving] = useState(false)
  const writing = useRef(false)
  const picker = getChartImageSavePicker()

  useEffect(() => {
    let closed = false
    let previewUrl: string | undefined
    async function prepare() {
      try {
        const { saveComparisonChartImage } = await import('./saveComparisonChartImage')
        if (closed) return
        await saveComparisonChartImage({
          chart: snapshot.image, filename: snapshot.filename, width: 640, output: { width: 1920 },
          writeBlob: async blob => {
            if (closed) return
            previewUrl = URL.createObjectURL(blob)
            setPreview({ blob, url: previewUrl })
          },
        })
      } catch {
        if (!closed) setError('マップ画像を作成できませんでした。閉じてもう一度お試しください。')
      }
    }
    void prepare()
    return () => {
      closed = true
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [snapshot])

  async function save(filename: string, chooseLocation: boolean) {
    if (!preview || writing.current) return
    writing.current = true
    setSaving(true)
    setError(false)
    try {
      const destination = await selectChartImageDestination(filename, chooseLocation ? picker : undefined)
      if (destination.type === 'cancelled') return
      if (destination.type === 'file') await destination.write(preview.blob)
      else downloadChartFile(preview.blob, /\.png$/i.test(filename) ? filename : `${filename}.png`)
      onClose()
    } catch {
      setError('画像を保存できませんでした。保存先を確認して、もう一度お試しください。')
    } finally {
      writing.current = false
      setSaving(false)
    }
  }
  return <ChartImageSaveDialog initialFilename={snapshot.filename} helpMode="none"
    canChooseLocation={Boolean(picker)} saving={saving} error={error} saveDisabled={!preview}
    progress={!preview && !error ? 'マップ画像を作成中…' : undefined}
    preview={preview && <img className="td-map-image-preview" src={preview.url} alt="保存するマップ画像" />}
    onClose={() => { if (!writing.current) onClose() }} onSave={filename => void save(filename, true)}
    additionalSaveAction={picker ? { label: 'ダウンロード', onSave: filename => void save(filename, false) } : undefined} />
}

export function TdMapImage({ map, filenameParts, caption, imageDetails, onOpen, children }: {
  map: MapSummary
  filenameParts: string[]
  caption?: string
  imageDetails?: ReactNode
  onOpen?: () => void
  children: ReactNode
}) {
  const buttonTarget = useContext(TdMapSaveButtonTarget)
  const deployment = useTdDeployment()
  const [snapshot, setSnapshot] = useState<MapSnapshot | null>(null)
  function open() {
    onOpen?.()
    setSnapshot({
      filename: createChartImageFilename(map.code, [map.name, ...filenameParts,
        ...(deployment?.placements.length ? [`味方${deployment.placements.length}人配置`] : [])]),
      image: <figure className="td-map-image">
        <ChartImageHeading title={`${map.code} ${map.name}`} conditions={caption} />
        <TdDeploymentContext.Provider value={deployment && { placements: deployment.placements, editing: false, facing: false, selectedOperator: null, targeting: null }}>
          {children}
        </TdDeploymentContext.Provider>
        {imageDetails}
      </figure>,
    })
  }
  return <>
    {buttonTarget && createPortal(
      <OutputImageSaveButton onClick={open} />,
      buttonTarget,
    )}
    {children}
    {snapshot && <MapImageDialog snapshot={snapshot} onClose={() => setSnapshot(null)} />}
  </>
}
