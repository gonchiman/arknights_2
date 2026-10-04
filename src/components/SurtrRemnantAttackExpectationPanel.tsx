import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { SurtrRemnantAttackAssumptions, SurtrRemnantAttackModel } from '../lib/surtrRemnantAttacks'
import { calculateSurtrRemnantAttackExpectation } from '../lib/surtrRemnantExpectation'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { HelpPopover } from './HelpPopover'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { SurtrRemnantAttackExpectationTable, SurtrRemnantAttackExpectationConditions, type SurtrRemnantExpectationComparisonResult,
  type SurtrRemnantExpectationBlockingComparison, type SurtrRemnantAttackExpectationTableLayout } from './SurtrRemnantAttackExpectationTable'
import { SurtrRemnantAttackExpectationTableImagePreview, saveSurtrRemnantAttackExpectationTableImage,
  getSurtrRemnantAttackExpectationTableImageFilename, type SurtrRemnantAttackExpectationTableImageSnapshot } from './SurtrRemnantAttackExpectationTableImage'
import './SurtrRemnantAttackExpectationPanel.css'

interface Comparison {
  id: string
  label: string
  color: string
  model: SurtrRemnantAttackModel | null
}

export interface SurtrRemnantAttackExpectationPanelProps {
  comparison: readonly Comparison[]
  blockingComparison?: readonly { blocking: boolean; comparison: readonly Comparison[] }[]
  potential: number
  blocking: boolean
  assumptions: SurtrRemnantAttackAssumptions
  status: ReactNode
}

const format = (value: number, digits: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: digits })
const seconds = (value: number) => `${format(value, 6)} s`
interface ImageSnapshot extends SurtrRemnantAttackExpectationTableImageSnapshot { id: number; filename: string }

export function SurtrRemnantAttackExpectationPanel({
  comparison, blockingComparison, potential, blocking, assumptions, status,
}: SurtrRemnantAttackExpectationPanelProps) {
  const [layout, setLayout] = useState<SurtrRemnantAttackExpectationTableLayout>(blockingComparison ? 'block-comparison' : 'horizontal')
  const [digits, setDigits] = useState(4)
  const [image, setImage] = useState<ImageSnapshot | null>(null)
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const saveInProgress = useRef(false)
  const nextSnapshot = useRef(0)
  const picker = getChartImageSavePicker()
  const calculate = (items: readonly Comparison[]) => items.map(item => ({ ...item,
    expectation: item.model ? calculateSurtrRemnantAttackExpectation(item.model, assumptions) : null,
  }))
  const calculated = useMemo(() => calculate(comparison), [comparison, assumptions])
  const calculatedBlocking = useMemo(() => blockingComparison?.map(group => ({
    blocking: group.blocking, comparison: calculate(group.comparison),
  })), [blockingComparison, assumptions])
  const compareBlocking = layout === 'block-comparison' || layout === 'block-details'
  const validComparison = (items: typeof calculated) => items.length > 0 && items.every(item => item.expectation !== null)
  const canCalculate = compareBlocking
    ? !!calculatedBlocking && calculatedBlocking.length === 2 && calculatedBlocking.some(group => !group.blocking)
      && calculatedBlocking.some(group => group.blocking) && calculatedBlocking.every(group => validComparison(group.comparison))
    : validComparison(calculated)
  const toTableComparison = (items: typeof calculated): SurtrRemnantExpectationComparisonResult[] => items.flatMap(item => item.expectation && item.model ? [{
    id: item.id, label: item.label, color: item.color, model: item.model, expectation: item.expectation,
  }] : [])
  const tableComparison = toTableComparison(calculated)
  const tableBlockingComparison: SurtrRemnantExpectationBlockingComparison[] | undefined = calculatedBlocking?.map(group => ({
    blocking: group.blocking, comparison: toTableComparison(group.comparison),
  }))
  const aspectRatio = aspect.preset !== 'auto' && [aspect.width, aspect.height].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(aspect.width) / Number(aspect.height) : undefined
  const aspectError = aspectRatio !== undefined && (aspectRatio < 0.1 || aspectRatio > 10)
    ? '幅÷高さが0.1〜10になる縦横比を指定してください。' : undefined
  const openImage = () => {
    if (status || !canCalculate) return
    setFeedback(null)
    const snapshot = { comparison: structuredClone(tableComparison),
      blockingComparison: compareBlocking ? structuredClone(tableBlockingComparison) : undefined,
      potential, blocking, assumptions: { ...assumptions }, layout, digits }
    setImage({ ...snapshot, id: ++nextSnapshot.current, filename: getSurtrRemnantAttackExpectationTableImageFilename(snapshot) })
  }
  const saveImage = async (filename: string, ratio?: number) => {
    if (!image || saveInProgress.current) return
    saveInProgress.current = true; setSaving(true); setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveSurtrRemnantAttackExpectationTableImage({ snapshot: image, filename, aspectRatio: ratio,
        writeBlob: destination.type === 'file' ? destination.write : undefined })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded'); setImage(null)
    } catch { setFeedback('failed') }
    finally { saveInProgress.current = false; setSaving(false) }
  }

  return <><CollapsibleCalculatorPanel id="surtr-remnant-expectation" number="03" title="攻撃回数の期待値計算"
    summary="期待命中回数" collapsedLabel="結果を表示"
    className="surtr-s3-output-panel surtr-remnant-attack-expectation-panel">
    {status || (!canCalculate ? <p role="alert">期待値の計算に必要なデータを取得できませんでした。</p> : <>
      <div className="surtr-remnant-attack-expectation-heading">
        <h3>命中回数の期待値</h3>
        <div className="surtr-remnant-attack-expectation-tools">
        <label className="surtr-s3-output-control"><span>表示する表</span><select aria-label="期待回数の表示形式" value={layout}
          onChange={event => setLayout(event.target.value as SurtrRemnantAttackExpectationTableLayout)}>
          {blockingComparison && <><option value="block-comparison">ブロック条件別</option><option value="block-details">計算条件付き</option></>}
          <option value="horizontal">計算内訳（横並び）</option><option value="vertical">計算内訳（縦並び）</option>
        </select></label>
        <label className="surtr-s3-output-control"><span>期待値の小数点以下</span><select aria-label="期待値の小数点以下の桁数" value={digits}
          onChange={event => setDigits(Number(event.target.value))}>
          {[0, 1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}桁</option>)}
        </select></label>
        <HelpPopover label="期待回数の計算の前提" triggerText="残りCT：一様分布" mode="dialog">
          <p>各装備の発動前の攻撃間隔を、残りCTの一様分布の範囲にします。範囲の長さから回数別の確率を求め、回数 × 確率を合計します。</p>
          <p>一様分布は比較のための仮定です。範囲内に攻撃対象が居続ける条件で計算します。すでに進行中の攻撃やゲーム内のフレーム処理は含みません。</p>
          <p>[ ] は端点を含み、( ) は端点を含みません。CTは小数6桁までの概数です。確率の計算欄は「CT範囲の長さ ÷ 発動前の攻撃間隔」を示します。計算には丸める前の値を使い、CT表の刻みは使いません。単独の端点が選ばれる確率は0です。</p>
          <p>潜在{potential}・{compareBlocking ? 'ブロック状態比較' : blocking ? 'ブロック中' : '非ブロック'}・予備動作{seconds(assumptions.windup)}・
            {assumptions.ctCarry === 'time' ? 'CT秒数維持' : 'CT割合維持'}・撤退同時の命中{assumptions.includeRetreatHit ? 'を含む' : 'を含まない'}</p>
        </HelpPopover>
        <button type="button" className="button secondary" onClick={openImage} aria-haspopup="dialog">画像を保存</button>
        </div>
      </div>
      <SurtrRemnantAttackExpectationTable comparison={tableComparison} blockingComparison={tableBlockingComparison} layout={layout} digits={digits}
        footer={<SurtrRemnantAttackExpectationConditions potential={potential} blocking={compareBlocking ? undefined : blocking} assumptions={assumptions} />} />
    </>)}
    {feedback && feedback !== 'failed' && <p className="surtr-s3-status" role="status">{feedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
  </CollapsibleCalculatorPanel>
  {image && <ChartImageSaveDialog initialFilename={image.filename} getDefaultFilename={ratio => withChartImageAspect(image.filename, ratio)}
    aspect={aspect} onAspectChange={setAspect} aspectError={aspectError} helpMode="popover"
    canChooseLocation={!!picker} saving={saving} error={feedback === 'failed'}
    onClose={() => { if (!saveInProgress.current) { setImage(null); setFeedback(null) } }} onSave={(filename, ratio) => void saveImage(filename, ratio)}
    preview={<SurtrRemnantAttackExpectationTableImagePreview key={`${image.id}:${aspectRatio ?? 'auto'}`} {...image} aspectRatio={aspectError ? undefined : aspectRatio} />} />}
  </>
}
