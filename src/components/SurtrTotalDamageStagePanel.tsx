import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { SkillRecord } from '../types/skill'
import type { SurtrDpsSettings } from '../lib/surtrDps'
import type { SurtrTotalDamageAssumptions } from '../lib/surtrTotalDamage'
import { buildSurtrStageMetricComparison, buildSurtrTotalDamageStageComparison, type SurtrStageMetric } from '../lib/surtrTotalDamageStageComparison'
import { getSkillLevelLabel } from '../lib/skillJsonAnalysis'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { resolveChartImageLabels, withChartImageLabelFilename, type ChartImageLabelOverrides } from '../lib/chartImageLabels'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { CategoryGroupedBarChart, type CategoryGroupedBarChartProps } from './CategoryGroupedBarChart'
import { CategoryGroupedBarImagePreview } from './CategoryGroupedBarImagePreview'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartImageLabelEditor } from './ChartImageLabelEditor'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './SurtrTotalDamageStagePanel.css'

type StageMetric = SurtrStageMetric | 'total-damage'
type ChartData = Pick<CategoryGroupedBarChartProps, 'groups' | 'legend' | 'conditionLabel' | 'showValues'> & { metric: StageMetric }
interface ImageSnapshot extends ChartData {
  filename: string
  digits: number
  labels: ChartImageLabelOverrides
}
const number = (value: number, digits = 0) => value.toLocaleString('ja-JP', { maximumFractionDigits: digits })
const validNumber = (draft: string, max: number) => draft.trim() !== '' && Number.isFinite(Number(draft)) && Number(draft) >= 0 && Number(draft) <= max
const moduleKey = (type: string | null) => type ?? 'none'
const METRICS = {
  'before-dps': { label: '素質2発動前のDPS', title: 'スルト S3 素質2発動前のDPS', axis: 'DPS', filename: 'スルト_S3発動前DPS_MOD段階比較' },
  'remnant-expected-damage': { label: '素質2発動中の総ダメージ期待値', title: 'スルト S3 素質2発動中の総ダメージ期待値', axis: '総ダメージ期待値', filename: 'スルト_S3発動中総ダメージ期待値_MOD段階比較' },
  'total-damage': { label: '全期間の総ダメージ', title: 'スルト S3 MOD段階別の総ダメージ', axis: '総ダメージ', filename: 'スルト_S3総ダメージ_MOD段階比較' },
} satisfies Record<StageMetric, { label: string; title: string; axis: string; filename: string }>
const labelDefaults = (chart: ChartData) => ({ title: METRICS[chart.metric].title, xAxis: 'MOD段階', yAxis: METRICS[chart.metric].axis, series: chart.legend })

function imageChartProps(image: ImageSnapshot): CategoryGroupedBarChartProps {
  const labels = resolveChartImageLabels(labelDefaults(image), image.labels)
  return {
    groups: image.groups.map(group => ({ ...group, bars: group.bars.map(bar => ({ ...bar, label: labels.seriesLabels[bar.id] ?? bar.label })) })),
    legend: image.legend.map(item => ({ ...item, label: labels.seriesLabels[item.id] ?? item.label })),
    categoryAxisLabel: labels.xAxis, metricLabel: labels.title, valueAxisLabel: labels.yAxis,
    conditionLabel: image.conditionLabel, showValues: image.showValues, valueTickCount: 6,
    formatValue: value => number(value, image.digits),
  }
}

export function SurtrTotalDamageStagePanel({ record, settings, assumptions, firstAttackDraft, hitDelayDraft, status }: {
  record: SkillRecord | undefined
  settings: SurtrDpsSettings
  assumptions: SurtrTotalDamageAssumptions
  firstAttackDraft: string
  hitDelayDraft: string
  status: ReactNode
}) {
  const [metric, setMetric] = useState<StageMetric>('before-dps')
  const [timeDraft, setTimeDraft] = useState('25')
  const [resistanceDraft, setResistanceDraft] = useState('0')
  const [hidden, setHidden] = useState<string[]>([])
  const [digits, setDigits] = useState(0)
  const [showValues, setShowValues] = useState(true)
  const [image, setImage] = useState<ImageSnapshot | null>(null)
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const savingRef = useRef(false)
  const picker = getChartImageSavePicker()
  const timeError = metric === 'total-damage' && !validNumber(timeDraft, 3600) ? '素質2発動までの時間は0〜3600秒で入力してください。' : null
  const resistanceError = !validNumber(resistanceDraft, 100) || !Number.isInteger(Number(resistanceDraft))
    ? '術耐性は0〜100の整数で入力してください。' : null
  const timingInputError = metric === 'total-damage' && !validNumber(firstAttackDraft, 3600) ? '最初の攻撃開始は0〜3600秒で入力してください。'
    : metric !== 'before-dps' && !validNumber(hitDelayDraft, 3600) ? '命中までの時間は0〜3600秒で入力してください。' : null
  const inputError = timeError ?? resistanceError ?? timingInputError
  const comparison = useMemo(() => {
    if (!record || inputError) return []
    if (metric !== 'total-damage') return buildSurtrStageMetricComparison(record, settings, Number(resistanceDraft), assumptions, metric)
    return buildSurtrTotalDamageStageComparison(record, settings, Number(timeDraft), Number(resistanceDraft), assumptions)
      .map(group => ({ ...group, bars: group.bars.map(bar => ({ ...bar, value: bar.result?.totalDamage ?? null })) }))
  }, [record, settings, timeDraft, resistanceDraft, assumptions, inputError, metric])
  const visible = comparison.map(group => ({ ...group, bars: group.bars.filter(bar => !hidden.includes(moduleKey(bar.moduleType))) }))
    .filter(group => group.bars.length > 0)
  const delayLimits = visible.flatMap(group => group.bars.flatMap(bar => bar.hitDelayLimit === null ? [] : [bar.hitDelayLimit]))
  const delayLimit = delayLimits.length ? Math.min(...delayLimits) : null
  const timingError = timingInputError ?? (metric !== 'before-dps' && delayLimit !== null && assumptions.hitDelay > delayLimit + 1e-8
    ? `命中までの時間は、比較する段階の攻撃間隔（${number(delayLimit, 4)}秒）以下にしてください。` : null)
  const validationError = inputError ?? timingError
  const groups = visible.map(group => ({ id: group.id, label: group.label, bars: group.bars.map(bar => ({
    id: moduleKey(bar.moduleType), label: bar.label, color: bar.color, value: bar.value,
  })) }))
  const legend = [...new Map(visible.flatMap(group => group.bars.map(bar => [moduleKey(bar.moduleType), {
    id: moduleKey(bar.moduleType), label: bar.moduleType === null ? '未装備' : `MOD ${bar.moduleType}`, color: bar.color,
  }] as const))).values()]
  const ready = !validationError && visible.some(group => group.bars.some(bar => bar.value !== null))
  const skillLabel = getSkillLevelLabel(settings.skillLevelIndex, record?.skillLevels.length ?? 10)
  const conditions = [
    skillLabel,
    `術耐性 ${resistanceDraft}${metric === 'total-damage' ? `・素質2発動まで ${timeDraft}秒` : ''}`,
    settings.blocking ? '対象を自身でブロック' : '未ブロック',
    ...(metric === 'remnant-expected-damage' ? ['残りCT一様'] : []),
  ]
  const chartProps: CategoryGroupedBarChartProps = { groups, legend, categoryAxisLabel: 'MOD段階',
    metricLabel: METRICS[metric].title, valueAxisLabel: METRICS[metric].axis,
    conditionLabel: conditions.join('・'), showValues, valueTickCount: 6, formatValue: value => number(value, digits) }
  const openImage = () => {
    if (!ready) return
    setFeedback(null)
    setImage({ metric, groups: structuredClone(groups), legend: structuredClone(legend), conditionLabel: conditions.join('・'), showValues, digits, labels: {},
      filename: createChartImageFilename(METRICS[metric].filename, [
        skillLabel, `術耐性${Number(resistanceDraft)}`, ...(metric === 'total-damage' ? [`素質2発動${Number(timeDraft)}s`] : []),
        ['none', 'X', 'Y'].filter(type => !hidden.includes(type)).map(type => type === 'none' ? '未装備' : `${type}Lv1-3`).join('-'),
        `E2Lv${settings.level}-信頼${settings.trust}-潜在${settings.potential}`, settings.blocking ? '対象ブロック' : '未ブロック',
        ...(metric === 'total-damage' ? [`初攻${assumptions.firstAttackStart}s-命中${assumptions.hitDelay}s`,
          assumptions.ctCarry === 'time' ? 'CT秒維持' : 'CT割合維持', assumptions.includeRetreatHit ? '退場時含む' : '退場時除外']
          : metric === 'remnant-expected-damage' ? ['残りCT一様', `命中${assumptions.hitDelay}s`,
            assumptions.ctCarry === 'time' ? 'CT秒維持' : 'CT割合維持'] : []),
        showValues ? '数値あり' : '数値なし', `${digits}桁`,
      ]),
    })
  }
  const saveImage = async (filename: string, ratio?: number) => {
    if (!image || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({ filename,
        width: getChartImageLayout({ naturalChartHeight: 334, aspectRatio: ratio }).width,
        chart: <CategoryGroupedBarChart {...imageChartProps(image)} imageOutput aspectRatio={ratio} />,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
      setImage(null)
    } catch { setFeedback('failed') }
    finally { savingRef.current = false; setSaving(false) }
  }
  const aspectRatio = aspect.preset !== 'auto' && [aspect.width, aspect.height].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(aspect.width) / Number(aspect.height) : undefined

  return <>
    <CollapsibleCalculatorPanel id="surtr-total-damage-stages" number="05" title="MOD段階比較"
      summary={METRICS[metric].label} collapsedLabel="グラフを表示" className="surtr-s3-output-panel surtr-total-stage-panel"
      headerActions={<>
        <label className="surtr-s3-output-control"><span>小数点以下</span><select aria-label="段階比較の小数点以下" value={digits}
          onChange={event => setDigits(Number(event.target.value))}>{[0, 1, 2, 3].map(value => <option key={value} value={value}>{value}桁</option>)}</select></label>
        <label className="surtr-s3-values-toggle"><input type="checkbox" checked={showValues} onChange={event => setShowValues(event.target.checked)} />数値を表示</label>
      </>}>
      <div className="surtr-total-stage-controls">
        <label className="calculator-field surtr-total-stage-metric"><span>計算対象</span><select aria-label="段階比較の計算対象" value={metric} onChange={event => { setMetric(event.target.value as StageMetric); setFeedback(null) }}>
          {(Object.keys(METRICS) as StageMetric[]).map(value => <option key={value} value={value}>{METRICS[value].label}</option>)}
        </select></label>
        {metric === 'total-damage' && <label className="calculator-field"><span>素質2発動までの時間（秒）</span><input type="number" min={0} max={3600} step="any" value={timeDraft}
          aria-invalid={!!timeError} aria-describedby={timeError ? 'surtr-stage-time-error' : undefined} onChange={event => setTimeDraft(event.target.value)} /></label>}
        <label className="calculator-field"><span>敵の術耐性</span><input type="number" min={0} max={100} step={1} value={resistanceDraft}
          aria-invalid={!!resistanceError} aria-describedby={resistanceError ? 'surtr-stage-resistance-error' : undefined} onChange={event => setResistanceDraft(event.target.value)} /></label>
        <fieldset className="surtr-total-stage-modules"><legend>比較するMOD（全段階）</legend><div>
          {(['none', 'X', 'Y'] as const).map(type => <label key={type}><input type="checkbox" checked={!hidden.includes(type)}
            disabled={!hidden.includes(type) && hidden.length === 2}
            onChange={event => setHidden(previous => event.target.checked ? previous.filter(value => value !== type) : [...previous, type])} />
            {type === 'none' ? '未装備' : `MOD ${type}`}</label>)}
        </div></fieldset>
      </div>
      {timeError && <p id="surtr-stage-time-error" role="alert" className="surtr-s3-axis-error">{timeError}</p>}
      {resistanceError && <p id="surtr-stage-resistance-error" role="alert" className="surtr-s3-axis-error">{resistanceError}</p>}
      {timingError && <p role="alert" className="surtr-s3-axis-error">{timingError}</p>}
      {!record ? status : validationError ? <p role="status">計算条件を確認してください。</p> : !ready
        ? <p role="alert">この条件では{METRICS[metric].label}を計算できませんでした。</p> : <>
          <div className="surtr-total-stage-actions"><button type="button" className="button secondary" onClick={openImage}
            aria-label="MOD段階比較をPNG画像で保存" aria-haspopup="dialog">画像を保存</button></div>
          <CategoryGroupedBarChart {...chartProps} />
          {visible.some(group => group.bars.some(bar => bar.value === null)) && <p className="surtr-s3-status">—：未開放または計算データなし</p>}
        </>}
      {feedback && feedback !== 'failed' && <p role="status" className="surtr-s3-status">{feedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    </CollapsibleCalculatorPanel>
    {image && <ChartImageSaveDialog initialFilename={withChartImageAspect(image.filename)}
      getDefaultFilename={ratio => withChartImageAspect(withChartImageLabelFilename(image.filename, labelDefaults(image), image.labels), ratio)}
      aspect={aspect} onAspectChange={setAspect} canChooseLocation={!!picker} saving={saving} error={feedback === 'failed'} helpMode="popover"
      onClose={() => { if (!savingRef.current) { setImage(null); setFeedback(null) } }} onSave={(filename, ratio) => void saveImage(filename, ratio)}
      options={<ChartImageLabelEditor defaults={labelDefaults(image)} value={image.labels} disabled={saving}
        onChange={labels => setImage(previous => previous ? { ...previous, labels } : null)} />}
      preview={<CategoryGroupedBarImagePreview chartProps={imageChartProps(image)} aspectRatio={aspectRatio} />} />}
  </>
}
