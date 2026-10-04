import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { SurtrDpsModel } from '../lib/surtrDps'
import type { SurtrRemnantAttackAssumptions, SurtrRemnantAttackModel } from '../lib/surtrRemnantAttacks'
import { buildSurtrRemnantExpectedDamagePoints } from '../lib/surtrRemnantExpectation'
import { getSurtrRemnantExpectationImageFilename } from '../lib/surtrRemnantExpectationImageFilename'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { SurtrDpsChart, type SurtrDpsChartSeries } from './SurtrDpsChart'
import { SurtrRemnantExpectationChartImage, SurtrRemnantExpectationChartImagePreview,
  type SurtrRemnantExpectationChartImageProps } from './SurtrRemnantExpectationChartImage'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './SurtrRemnantDamageExpectationPanel.css'

interface Comparison {
  id: string
  label: string
  color: string
  model: SurtrRemnantAttackModel | null
  dpsModel: SurtrDpsModel | null
}
interface ImageSnapshot extends SurtrRemnantExpectationChartImageProps { filename: string }
const format = (value: number, digits = 2) => value.toLocaleString('ja-JP', { maximumFractionDigits: digits })
const count = (value: number) => format(value, 4)

export function SurtrRemnantDamageExpectationPanel({ comparison, potential, blocking, assumptions, status }: {
  comparison: readonly Comparison[]
  potential: number
  blocking: boolean
  assumptions: SurtrRemnantAttackAssumptions
  status: ReactNode
}) {
  const [kind, setKind] = useState<'bar' | 'line'>('bar')
  const [resistanceStep, setResistanceStep] = useState(20)
  const [showValues, setShowValues] = useState(false)
  const [showResistanceRanks, setShowResistanceRanks] = useState(true)
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([])
  const [selectedResistance, setSelectedResistance] = useState<number | null>(60)
  const [image, setImage] = useState<ImageSnapshot | null>(null)
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const saveInProgress = useRef(false)
  const nextSnapshot = useRef(0)
  const picker = getChartImageSavePicker()
  const sampleStep = kind === 'line' ? 1 : resistanceStep
  const resistances = useMemo(() => Array.from({ length: 100 / sampleStep + 1 }, (_, index) => index * sampleStep), [sampleStep])
  const resistance = selectedResistance === null ? null : resistances.includes(selectedResistance) ? selectedResistance : resistances[0]
  const calculated = useMemo(() => comparison.flatMap(item => {
    if (!item.model || !item.dpsModel) return []
    return [{ ...item, points: buildSurtrRemnantExpectedDamagePoints(item.dpsModel, item.model, resistances, assumptions) }]
  }), [comparison, resistances, assumptions])
  const visible = calculated.filter(item => !hiddenSeries.includes(item.id))
  const series: SurtrDpsChartSeries[] = visible.map(item => ({ id: item.id, label: item.label, color: item.color, points: item.points }))
  const canOutput = !status && calculated.length === comparison.length && series.length > 0
    && series.every(item => item.points.every(point => point.value !== null))
  const toggleSeries = (id: string) => setHiddenSeries(previous => previous.includes(id)
    ? previous.filter(value => value !== id) : comparison.filter(item => !previous.includes(item.id)).length > 1 ? [...previous, id] : previous)
  const aspectRatio = aspect.preset !== 'auto' && [aspect.width, aspect.height].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(aspect.width) / Number(aspect.height) : undefined
  const openImage = () => {
    if (!canOutput) return
    setFeedback(null)
    setImage({ id: String(++nextSnapshot.current), series: structuredClone(series), kind, resistanceStep, resistances: [...resistances],
      potential, blocking, assumptions: { ...assumptions }, showValues, showResistanceRanks, digits: 0,
      filename: getSurtrRemnantExpectationImageFilename({ potential, blocking, modules: visible.map(item => item.label),
        resistances, ...assumptions, kind, showValues, showResistanceRanks, digits: 0 }),
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
        chart: <SurtrRemnantExpectationChartImage {...image} aspectRatio={ratio} />,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded'); setImage(null)
    } catch { setFeedback('failed') }
    finally { saveInProgress.current = false; setSaving(false) }
  }
  return <>
    <CollapsibleCalculatorPanel id="surtr-remnant-expected-damage" number="04" title="総ダメージの期待値計算"
      summary="期待命中回数 × 1回のダメージ" collapsedLabel="結果を表示" className="surtr-s3-output-panel surtr-remnant-damage-expectation-panel"
      headerActions={<>
        <label className="surtr-s3-output-control"><span>グラフ</span><select aria-label="期待値のグラフ" value={kind}
          onChange={event => setKind(event.target.value as 'bar' | 'line')}><option value="bar">集合棒グラフ</option><option value="line">折れ線グラフ</option></select></label>
        {kind === 'bar' && <><label className="surtr-s3-output-control"><span>術耐性の刻み</span><select aria-label="期待値の術耐性の刻み" value={resistanceStep}
          onChange={event => setResistanceStep(Number(event.target.value))}><option value="20">20</option><option value="50">50</option></select></label>
          <label className="surtr-s3-values-toggle"><input type="checkbox" checked={showValues} onChange={event => setShowValues(event.target.checked)} />数値を表示</label></>}
        <label className="surtr-s3-values-toggle"><input type="checkbox" checked={showResistanceRanks}
          onChange={event => setShowResistanceRanks(event.target.checked)} />術耐性ランク表示</label>
      </>}>
      {status || (!canOutput ? <p role="alert">期待値の計算に必要なデータを取得できませんでした。</p> : <>
        <div className="surtr-remnant-damage-expectation-heading"><h3>期待命中回数 × 1回のダメージ</h3>
          <label className="surtr-s3-output-control"><span>術耐性</span><select aria-label="期待総ダメージの術耐性" value={resistance ?? ''}
            onChange={event => setSelectedResistance(event.target.value === '' ? null : Number(event.target.value))}>
            <option value="">未選択</option>{resistances.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
        <div className="surtr-s3-table-wrap"><table className="surtr-s3-table surtr-remnant-damage-expectation-table" aria-label="総ダメージ期待値の計算">
          <thead><tr><th scope="col">装備</th><th scope="col">期待命中回数</th><th scope="col">× 1回のダメージ</th><th scope="col">≈ 総ダメージ期待値</th></tr></thead>
          <tbody>{visible.map(item => {
            const point = item.points.find(value => value.x === resistance)
            return <tr key={item.id}><th scope="row"><span className="surtr-s3-column-label"><i aria-hidden="true" style={{ backgroundColor: item.color }} />{item.label}</span></th>
              <td>{point?.expectedHitCount == null ? '—' : `${count(point.expectedHitCount)} 回`}</td>
              <td>{point?.perHit == null ? '—' : format(point.perHit)}</td>
              <td><strong>{point?.value == null ? '—' : format(point.value)}</strong></td></tr>
          })}</tbody>
        </table></div>
        <div className="surtr-remnant-expectation-graph">
          <div className="surtr-remnant-chart-toolbar">
            <div className="surtr-remnant-chart-legend" role="group" aria-label="期待値で表示する装備">
              {comparison.map(item => <button type="button" key={item.id} aria-pressed={!hiddenSeries.includes(item.id)} onClick={() => toggleSeries(item.id)}>
                <i aria-hidden="true" style={{ backgroundColor: item.color }} />{item.label}
              </button>)}
            </div>
            <div className="surtr-remnant-chart-actions"><button type="button" className="button secondary" onClick={openImage} aria-haspopup="dialog">画像を保存</button></div>
          </div>
          <SurtrDpsChart series={series} kind={kind} barStep={resistanceStep} resistanceRange={{ min: 0, max: 100 }} showLegend={false}
            gridStyle="dashed" precision={0} showValues={showValues} showResistanceRanks={showResistanceRanks}
            title="余燼中の総ダメージ期待値" valueAxisLabel="総ダメージ期待値" yAxis={{ mode: 'zero' }}
            selectedResistance={resistance} onSelectResistance={setSelectedResistance} />
        </div>
      </>)}
      {feedback && feedback !== 'failed' && <p className="surtr-s3-status" role="status">{feedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    </CollapsibleCalculatorPanel>
    {image && <ChartImageSaveDialog initialFilename={image.filename} getDefaultFilename={ratio => withChartImageAspect(image.filename, ratio)} aspect={aspect} onAspectChange={setAspect}
      canChooseLocation={!!picker} saving={saving} error={feedback === 'failed'} helpMode="popover"
      onClose={() => { if (!saveInProgress.current) { setImage(null); setFeedback(null) } }} onSave={(filename, ratio) => void saveImage(filename, ratio)}
      preview={<SurtrRemnantExpectationChartImagePreview key={`${image.id}:${aspectRatio ?? 'auto'}`} {...image} aspectRatio={aspectRatio} />} />}
  </>
}
