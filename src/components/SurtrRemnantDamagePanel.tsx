import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { SurtrDpsModel } from '../lib/surtrDps'
import type { SurtrRemnantAttackAssumptions, SurtrRemnantAttackModel } from '../lib/surtrRemnantAttacks'
import { buildSurtrRemnantDamagePoints } from '../lib/surtrRemnantDamage'
import { getSurtrRemnantDamageImageFilename } from '../lib/surtrRemnantDamageImageFilename'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GroupedResistanceComparisonChart, type GroupedResistanceComparisonSeries } from './GroupedResistanceComparisonChart'
import { SurtrRemnantDamageChartImage, SurtrRemnantDamageChartImagePreview, type SurtrRemnantDamageChartImageProps } from './SurtrRemnantDamageChartImage'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './SurtrRemnantDamagePanel.css'

export interface SurtrRemnantDamageComparison {
  id: string
  label: string
  color: string
  model: SurtrRemnantAttackModel | null
  dpsModel: SurtrDpsModel | null
}

const CT_PRESETS = {
  three: [0, 0.5, 1],
  five: [0, 0.3, 0.6, 0.9, 1.2],
} as const
const CT_AXIS = { label: '残りCT', formatValue: (value: number) => `${value.toFixed(2)} s`, minimum: 0 }
const formatDamage = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 2 })
interface ImageSnapshot extends SurtrRemnantDamageChartImageProps { filename: string }

export function SurtrRemnantDamagePanel({ comparison, potential, blocking, assumptions, status }: {
  comparison: readonly SurtrRemnantDamageComparison[]
  potential: number
  blocking: boolean
  assumptions: SurtrRemnantAttackAssumptions
  status: ReactNode
}) {
  const [ctPreset, setCtPreset] = useState<keyof typeof CT_PRESETS>('three')
  const [resistanceStep, setResistanceStep] = useState(20)
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([])
  const [selectedCt, setSelectedCt] = useState(0.5)
  const [selectedResistance, setSelectedResistance] = useState(60)
  const [image, setImage] = useState<ImageSnapshot | null>(null)
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const saveInProgress = useRef(false)
  const nextSnapshot = useRef(0)
  const picker = getChartImageSavePicker()
  const cts: readonly number[] = CT_PRESETS[ctPreset]
  const resistances = useMemo(() => Array.from({ length: 100 / resistanceStep + 1 }, (_, index) => index * resistanceStep), [resistanceStep])
  const ct = cts.includes(selectedCt) ? selectedCt : cts[0]
  const resistance = resistances.includes(selectedResistance) ? selectedResistance : resistances[0]
  const calculated = useMemo(() => comparison.flatMap(item => item.model && item.dpsModel
    ? [{ ...item, points: buildSurtrRemnantDamagePoints(item.dpsModel, item.model, cts, resistances, assumptions) }]
    : []), [comparison, cts, resistances, assumptions])
  const visible = calculated.filter(item => !hiddenSeries.includes(item.id))
  const series: GroupedResistanceComparisonSeries[] = visible.map(item => ({
    id: item.id, label: item.label, color: item.color, moduleType: item.model!.moduleType, potential,
    points: item.points.map(point => ({ groupValue: point.remainingCt, resistance: point.enemyResistance, value: point.value })),
  }))
  const canOutput = !status && calculated.length === comparison.length && series.length > 0
  const selectPoint = (nextCt: number, nextResistance: number) => { setSelectedCt(nextCt); setSelectedResistance(nextResistance) }
  const toggleSeries = (id: string) => setHiddenSeries(previous => previous.includes(id)
    ? previous.filter(value => value !== id) : previous.length < comparison.length - 1 ? [...previous, id] : previous)
  const aspectRatio = aspect.preset !== 'auto' && [aspect.width, aspect.height].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(aspect.width) / Number(aspect.height) : undefined
  const openImage = () => {
    if (!canOutput) return
    setFeedback(null)
    setImage({ id: String(++nextSnapshot.current), series, cts: [...cts], resistances: [...resistances], potential, blocking,
      assumptions: { ...assumptions }, filename: getSurtrRemnantDamageImageFilename({
        potential, blocking, modules: visible.map(item => item.label), cts, resistances, ...assumptions,
      }),
    })
  }
  const saveImage = async (filename: string, ratio?: number) => {
    if (!image || saveInProgress.current) return
    saveInProgress.current = true; setSaving(true); setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({ filename,
        width: getChartImageLayout({ naturalChartHeight: 334, aspectRatio: ratio }).width,
        chart: <SurtrRemnantDamageChartImage {...image} aspectRatio={ratio} />,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded'); setImage(null)
    } catch { setFeedback('failed') }
    finally { saveInProgress.current = false; setSaving(false) }
  }

  return <>
    <CollapsibleCalculatorPanel id="surtr-remnant-damage" number="03" title="余燼中の総ダメージ"
      summary="残りCT・術耐性別の総ダメージ" collapsedLabel="結果を表示" className="surtr-s3-output-panel surtr-remnant-damage-panel"
      headerActions={<>
        <label className="surtr-s3-output-control"><span>比較CT</span><select aria-label="総ダメージの比較CT" value={ctPreset}
          onChange={event => setCtPreset(event.target.value as keyof typeof CT_PRESETS)}>
          <option value="three">0／0.5／1.0 s</option><option value="five">0／0.3／0.6／0.9／1.2 s</option>
        </select></label>
        <label className="surtr-s3-output-control"><span>術耐性の刻み</span><select aria-label="総ダメージの術耐性の刻み" value={resistanceStep}
          onChange={event => setResistanceStep(Number(event.target.value))}>
          <option value="20">20</option><option value="50">50</option>
        </select></label>
      </>}>
      {status || (calculated.length !== comparison.length ? <p role="alert">総ダメージの計算に必要なデータを取得できませんでした。</p> : <>
        <div className="surtr-remnant-chart-toolbar">
          <div className="surtr-remnant-chart-legend" role="group" aria-label="総ダメージで表示する装備">
            {comparison.map(item => <button type="button" key={item.id} aria-pressed={!hiddenSeries.includes(item.id)} onClick={() => toggleSeries(item.id)}>
              <i aria-hidden="true" style={{ backgroundColor: item.color }} />{item.label}
            </button>)}
          </div>
          <div className="surtr-remnant-chart-actions">
            <span className="surtr-remnant-damage-conditions">潜在{potential}・{blocking ? 'ブロック中' : '非ブロック'}・単体</span>
            <button type="button" className="button secondary" onClick={openImage} disabled={!canOutput} aria-haspopup="dialog">画像を保存</button>
          </div>
        </div>
        <GroupedResistanceComparisonChart series={series} groupValues={cts} resistanceValues={resistances} groupAxis={CT_AXIS}
          metric="total" baselineId="" digits={0} selectedGroup={ct} selectedResistance={resistance} onSelectPoint={selectPoint}
          gridStyle="dashed" showMissingValues missingValueLabel="—（範囲外）" showLegend={false} showReadout={false} />
        <div className="surtr-remnant-damage-readout">
          <label className="surtr-s3-output-control"><span>残りCT</span><select aria-label="総ダメージの残りCT" value={ct} onChange={event => setSelectedCt(Number(event.target.value))}>
            {cts.map(value => <option key={value} value={value}>{value.toFixed(2)} s</option>)}
          </select></label>
          <label className="surtr-s3-output-control"><span>術耐性</span><select aria-label="総ダメージの術耐性" value={resistance} onChange={event => setSelectedResistance(Number(event.target.value))}>
            {resistances.map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <div className="surtr-remnant-damage-values" aria-live="polite">{visible.map(item => {
            const point = item.points.find(value => value.remainingCt === ct && value.enemyResistance === resistance)
            return <div className="surtr-s3-readout-value" key={item.id}>
              <span><i aria-hidden="true" style={{ backgroundColor: item.color }} />{item.label}</span>
              <strong>{point?.value == null ? '—' : formatDamage(point.value)}</strong>
              <span>{point?.value == null ? 'CT範囲外' : `${point.hitCount}回 × ${formatDamage(point.perHit!)}`}</span>
            </div>
          })}</div>
        </div>
      </>)}
      {feedback && feedback !== 'failed' && <p className="surtr-s3-status" role="status">{feedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    </CollapsibleCalculatorPanel>
    {image && <ChartImageSaveDialog initialFilename={image.filename} getDefaultFilename={ratio => withChartImageAspect(image.filename, ratio)} aspect={aspect} onAspectChange={setAspect}
      canChooseLocation={!!picker} saving={saving} error={feedback === 'failed'} helpMode="popover"
      onClose={() => { if (!saveInProgress.current) { setImage(null); setFeedback(null) } }} onSave={(filename, ratio) => void saveImage(filename, ratio)}
      preview={<SurtrRemnantDamageChartImagePreview key={`${image.id}:${aspectRatio ?? 'auto'}`} {...image} aspectRatio={aspectRatio} />} />}
  </>
}
