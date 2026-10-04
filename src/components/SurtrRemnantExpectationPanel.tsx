import { useMemo, useRef, useState, type ReactNode, type MouseEvent } from 'react'
import type { SurtrDpsModel } from '../lib/surtrDps'
import type { SurtrRemnantAttackAssumptions, SurtrRemnantAttackModel } from '../lib/surtrRemnantAttacks'
import { calculateSurtrRemnantAttackExpectation, buildSurtrRemnantExpectedDamagePoints,
  type SurtrRemnantAttackExpectation } from '../lib/surtrRemnantExpectation'
import { getSurtrRemnantExpectationImageFilename } from '../lib/surtrRemnantExpectationImageFilename'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { HelpPopover } from './HelpPopover'
import { SurtrDpsChart, type SurtrDpsChartSeries } from './SurtrDpsChart'
import { SurtrRemnantExpectationChartImage, SurtrRemnantExpectationChartImagePreview,
  type SurtrRemnantExpectationChartImageProps } from './SurtrRemnantExpectationChartImage'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './SurtrRemnantExpectationPanel.css'

interface Comparison {
  id: string
  label: string
  color: string
  model: SurtrRemnantAttackModel | null
  dpsModel: SurtrDpsModel | null
}
interface DetailSnapshot {
  label: string
  result: SurtrRemnantAttackExpectation
  potential: number
  blocking: boolean
  assumptions: SurtrRemnantAttackAssumptions
}
interface ImageSnapshot extends SurtrRemnantExpectationChartImageProps { filename: string }
const format = (value: number, digits = 2) => value.toLocaleString('ja-JP', { maximumFractionDigits: digits })
const count = (value: number) => format(value, 4)
const percent = (value: number) => `${format(value * 100, 4)}%`

function ExpectationDetail({ snapshot, onClose }: { snapshot: DetailSnapshot; onClose: () => void }) {
  const { result, assumptions } = snapshot
  return <GoldenglowDetailModal title={`${snapshot.label}：命中回数の期待値`} closeLabel="期待値の詳細を閉じる"
    onClose={onClose} closeOnContextMenu className="surtr-remnant-expectation-detail">
    <p>残りCTが0〜{format(result.remainingCtLimit, 6)} sの一様分布であると仮定します。</p>
    <p>潜在{snapshot.potential}・{snapshot.blocking ? 'ブロック中' : '非ブロック'}・予備動作{format(assumptions.windup)} s・
      {assumptions.ctCarry === 'time' ? 'CT秒数維持' : 'CT割合維持'}</p>
    <div className="surtr-s3-table-wrap"><table className="surtr-s3-table">
      <thead><tr><th scope="col">命中回数</th><th scope="col">確率</th><th scope="col">回数 × 確率</th></tr></thead>
      <tbody>{result.probabilities.map(item => <tr key={item.hitCount}>
        <th scope="row">{item.hitCount} 回</th><td>{percent(item.probability)}</td><td>{count(item.contribution)} 回</td>
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">合計</th><td>{percent(result.probabilities.reduce((sum, item) => sum + item.probability, 0))}</td>
        <td><strong>{count(result.expectedHitCount)} 回</strong></td></tr></tfoot>
    </table></div>
    <details className="surtr-s3-assumptions"><summary>CT範囲と計算の前提</summary>
      <ul>{result.probabilities.flatMap(item => item.ctRanges.map((range, index) => <li key={`${item.hitCount}:${index}`}>
        {format(range.from, 6)}〜{format(range.to, 6)} s：{item.hitCount}回
      </li>))}</ul>
      <p>確率はCT範囲の長さを発動前の攻撃間隔で割った値です。計算には丸める前の値を使います。範囲の端点だけを取る確率は0です。</p>
      <p>発動時にCTが残っている状態から計算します。すでに進行中の攻撃や、ゲーム内のフレーム単位の処理は含みません。一様分布は実測した分布ではなく、比較のための仮定です。</p>
      <p>総ダメージ期待値は、この命中回数の期待値に単体への1回分のダメージを掛けた値です。範囲内に攻撃対象が居続ける条件で計算します。</p>
    </details>
  </GoldenglowDetailModal>
}

export function SurtrRemnantExpectationPanel({ comparison, potential, blocking, assumptions, status }: {
  comparison: readonly Comparison[]
  potential: number
  blocking: boolean
  assumptions: SurtrRemnantAttackAssumptions
  status: ReactNode
}) {
  const [kind, setKind] = useState<'bar' | 'line'>('bar')
  const [resistanceStep, setResistanceStep] = useState(20)
  const [showValues, setShowValues] = useState(false)
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([])
  const [selectedResistance, setSelectedResistance] = useState<number | null>(60)
  const [detail, setDetail] = useState<DetailSnapshot | null>(null)
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
    const expectation = calculateSurtrRemnantAttackExpectation(item.model, assumptions)
    if (!expectation) return []
    return [{ ...item, expectation, points: buildSurtrRemnantExpectedDamagePoints(item.dpsModel, item.model, resistances, assumptions) }]
  }), [comparison, resistances, assumptions])
  const visible = calculated.filter(item => !hiddenSeries.includes(item.id))
  const series: SurtrDpsChartSeries[] = visible.map(item => ({ id: item.id, label: item.label, color: item.color, points: item.points }))
  const canOutput = !status && calculated.length === comparison.length && series.length > 0
    && series.every(item => item.points.every(point => point.value !== null))
  const toggleSeries = (id: string) => setHiddenSeries(previous => previous.includes(id)
    ? previous.filter(value => value !== id) : comparison.filter(item => !previous.includes(item.id)).length > 1 ? [...previous, id] : previous)
  const openDetail = (event: MouseEvent<HTMLTableRowElement>, item: typeof calculated[number]) => {
    event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
    setDetail({ label: item.label, result: structuredClone(item.expectation), potential, blocking, assumptions: { ...assumptions } })
  }
  const aspectRatio = aspect.preset !== 'auto' && [aspect.width, aspect.height].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(aspect.width) / Number(aspect.height) : undefined
  const openImage = () => {
    if (!canOutput) return
    setFeedback(null)
    setImage({ id: String(++nextSnapshot.current), series: structuredClone(series), kind, resistanceStep, resistances: [...resistances],
      potential, blocking, assumptions: { ...assumptions }, showValues, digits: 0,
      filename: getSurtrRemnantExpectationImageFilename({ potential, blocking, modules: visible.map(item => item.label),
        resistances, ...assumptions, kind, showValues, digits: 0 }),
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
    <CollapsibleCalculatorPanel id="surtr-remnant-damage" number="03" title="余燼の期待値比較"
      summary="命中回数・総ダメージの期待値" collapsedLabel="結果を表示" className="surtr-s3-output-panel surtr-remnant-expectation-panel"
      headerActions={<>
        <label className="surtr-s3-output-control"><span>グラフ</span><select aria-label="期待値のグラフ" value={kind}
          onChange={event => setKind(event.target.value as 'bar' | 'line')}><option value="bar">集合棒グラフ</option><option value="line">折れ線グラフ</option></select></label>
        {kind === 'bar' && <><label className="surtr-s3-output-control"><span>術耐性の刻み</span><select aria-label="期待値の術耐性の刻み" value={resistanceStep}
          onChange={event => setResistanceStep(Number(event.target.value))}><option value="20">20</option><option value="50">50</option></select></label>
          <label className="surtr-s3-values-toggle"><input type="checkbox" checked={showValues} onChange={event => setShowValues(event.target.checked)} />数値を表示</label></>}
      </>}>
      {status || (!canOutput ? <p role="alert">期待値の計算に必要なデータを取得できませんでした。</p> : <>
        <div className="surtr-remnant-expectation-heading"><h3>命中回数の期待値</h3>
          <HelpPopover label="期待値の計算の前提" triggerText="残りCT：一様分布" mode="dialog">
            <p>各装備の発動前の攻撃間隔を、残りCTの一様分布の範囲にします。回数別の確率を求め、回数 × 確率を合計します。</p>
            <p>一様分布は比較のための仮定です。CT表の刻みを変えても期待値は変わりません。装備の行を選ぶと計算の内訳を確認できます。</p>
          </HelpPopover>
        </div>
        <div className="surtr-s3-table-wrap"><table className="surtr-s3-table surtr-s3-result-table surtr-remnant-expectation-table" aria-label="命中回数の期待値">
          <thead><tr><th scope="col">装備</th><th scope="col">期待命中回数</th><th scope="col">回数別の確率</th></tr></thead>
          <tbody>{calculated.map(item => <tr key={item.id} onClick={event => openDetail(event, item)}>
            <th scope="row"><button type="button" className="surtr-s3-table-resistance" aria-haspopup="dialog" aria-label={`${item.label}の期待値の詳細`}>
              <span className="surtr-s3-column-label"><i aria-hidden="true" style={{ backgroundColor: item.color }} />{item.label}</span><span aria-hidden="true">›</span>
            </button></th><td><strong>{count(item.expectation.expectedHitCount)}</strong> 回</td>
            <td><span className="surtr-remnant-expectation-probabilities">{item.expectation.probabilities.map(probability =>
              <span key={probability.hitCount}>{probability.hitCount}回：{percent(probability.probability)}</span>)}</span></td>
          </tr>)}</tbody>
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
            gridStyle="dashed" precision={0} showValues={showValues} showResistanceRanks={false}
            title="余燼中の総ダメージ期待値" valueAxisLabel="総ダメージ期待値" yAxis={{ mode: 'zero' }}
            selectedResistance={resistance} onSelectResistance={setSelectedResistance} />
          <div className="surtr-remnant-expectation-readout">
            <label className="surtr-s3-output-control"><span>術耐性</span><select aria-label="期待総ダメージの術耐性" value={resistance ?? ''}
              onChange={event => setSelectedResistance(event.target.value === '' ? null : Number(event.target.value))}>
              <option value="">未選択</option>{resistances.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            {visible.map(item => {
              const point = item.points.find(value => value.x === resistance)
              return <div className="surtr-s3-readout-value" key={item.id}><span><i aria-hidden="true" style={{ backgroundColor: item.color }} />{item.label}</span>
                <strong>{point?.value == null ? '—' : format(point.value)}</strong>
                <span>{point?.value == null ? '—' : `${count(point.expectedHitCount!)}回 × ${format(point.perHit!)}`}</span></div>
            })}
          </div>
        </div>
      </>)}
      {feedback && feedback !== 'failed' && <p className="surtr-s3-status" role="status">{feedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    </CollapsibleCalculatorPanel>
    {detail && <ExpectationDetail snapshot={detail} onClose={() => setDetail(null)} />}
    {image && <ChartImageSaveDialog initialFilename={image.filename} getDefaultFilename={ratio => withChartImageAspect(image.filename, ratio)} aspect={aspect} onAspectChange={setAspect}
      canChooseLocation={!!picker} saving={saving} error={feedback === 'failed'} helpMode="popover"
      onClose={() => { if (!saveInProgress.current) { setImage(null); setFeedback(null) } }} onSave={(filename, ratio) => void saveImage(filename, ratio)}
      preview={<SurtrRemnantExpectationChartImagePreview key={`${image.id}:${aspectRatio ?? 'auto'}`} {...image} aspectRatio={aspectRatio} />} />}
  </>
}
