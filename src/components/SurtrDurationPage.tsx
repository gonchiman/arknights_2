import { useMemo, useRef, useState } from 'react'
import type { SkillRecord } from '../types/skill'
import { SURTR_OPERATOR_ID } from '../lib/surtrDps'
import { deriveSurtrDurationModel, calculateSurtrDuration, type SurtrDurationSettings, type SurtrDurationResult } from '../lib/surtrDuration'
import { buildSurtrDurationTimeline } from '../lib/surtrDurationTimeline'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules } from '../lib/operatorModules'
import { getModuleComparisonColors } from '../lib/moduleColors'
import { getSurtrDurationImageFilename } from '../lib/surtrDurationImageFilename'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { SURTR_HOME_LINK } from '../lib/navigation'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { SurtrDurationChart, SurtrDurationChartImage, SurtrDurationChartImagePreview,
  type SurtrDurationSeries } from './SurtrDurationChart'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import { SurtrDurationTimelineTable } from './SurtrDurationTimelineTable'
import './DamageCalculator.css'
import './SurtrS3Page.css'
import './SurtrDurationPage.css'

const skillLabel = (index: number) => index < 7 ? `ランク${index + 1}` : `特化${index - 6}`
const seconds = (value: number) => `${value.toFixed(1)} 秒`
const formatHp = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(value)
interface ImageSnapshot {
  id: number
  series: SurtrDurationSeries[]
  title: string
  conditions: string
  filename: string
}

export function SurtrDurationPage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]; loading: boolean; error: string | null; onRetry: () => void
}) {
  const record = rows.find(row => row.operatorId === SURTR_OPERATOR_ID && row.skillIndex === 3)
  const [skillLevelIndex, setSkillLevelIndex] = useState(9)
  const [potential, setPotential] = useState(1)
  const [selectedModuleId, setSelectedModuleId] = useState('')
  const [moduleLevels, setModuleLevels] = useState<Record<string, number>>({})
  const [timelineStep, setTimelineStep] = useState<1 | 5>(1)
  const [timelineSelection, setTimelineSelection] = useState<{ result: SurtrDurationResult; time: number } | null>(null)
  const [image, setImage] = useState<ImageSnapshot | null>(null)
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const saveInProgress = useRef(false)
  const nextSnapshot = useRef(0)
  const picker = getChartImageSavePicker()
  const settings = useMemo<SurtrDurationSettings>(() => ({
    level: record?.operatorProfile.phases[2]?.maxLevel ?? 90, trust: 100, potential,
    skillLevelIndex: Math.min(skillLevelIndex, Math.max(0, (record?.skillLevels.length ?? 10) - 1)),
  }), [record, potential, skillLevelIndex])
  const choices = useMemo(() => [
    { id: '', label: '未装備', type: null as string | null, levels: [] as number[] },
    ...getOperatorModules(record?.operatorProfile ?? {}).flatMap((module, index) => {
      const type = module.typeName2?.trim().toUpperCase()
      return type === 'X' || type === 'Y'
        ? [{ id: getOperatorModuleId(module, index), label: `MOD ${type}`, type, levels: getOperatorModuleLevels(module) }]
        : []
    }),
  ], [record])
  const selectedChoice = choices.find(choice => choice.id === selectedModuleId) ?? choices[0]
  const comparison = useMemo(() => {
    if (!record) return []
    const selected = [selectedChoice]
    const colors = getModuleComparisonColors(selected.map(choice => ({ moduleType: choice.type, potential })))
    return selected.map((choice, index) => {
      const level = moduleLevels[choice.id] ?? choice.levels.at(-1) ?? 3
      const model = deriveSurtrDurationModel(record, settings, choice.id, level)
      return { id: choice.id || 'none', label: choice.id ? `${choice.label} Lv.${level}` : choice.label,
        model, result: model ? calculateSurtrDuration(model) : null, color: colors[index] }
    })
  }, [record, selectedChoice, potential, moduleLevels, settings])
  const series = useMemo<SurtrDurationSeries[]>(() => comparison.flatMap(item => item.result
    ? [{ id: item.id, label: item.label, color: item.color, ...item.result }] : []), [comparison])
  const calculation = comparison[0]
  const timelineRows = useMemo(() => calculation?.model && calculation.result
    ? buildSurtrDurationTimeline(calculation.model, calculation.result, timelineStep) : [], [calculation, timelineStep])
  const selectedTimelineRow = timelineSelection?.result === calculation?.result
    ? timelineRows.find(row => row.time === timelineSelection?.time) : undefined
  const invalid = comparison.some(item => !item.result)
  const label = skillLabel(settings.skillLevelIndex)
  const title = 'HPの推移（推定）'
  const aspectRatio = aspect.preset !== 'auto' && [aspect.width, aspect.height].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(aspect.width) / Number(aspect.height) : undefined
  const openImage = () => {
    if (!series.length || invalid) return
    setFeedback(null)
    setImage({ id: ++nextSnapshot.current, series,
      title: `スルト S3 ${title}`, conditions: `${label}・潜在${potential}・外部回復なし`,
      filename: getSurtrDurationImageFilename({ ...settings, skillLevelLabel: label, modules: series.map(item => item.label) }),
    })
  }
  const saveImage = async (filename: string, ratio?: number) => {
    if (!image || saveInProgress.current) return
    saveInProgress.current = true
    setSaving(true)
    setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({ filename,
        width: getChartImageLayout({ naturalChartHeight: 334, aspectRatio: ratio }).width,
        chart: <SurtrDurationChartImage {...image} aspectRatio={ratio} />,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
      setImage(null)
    } catch { setFeedback('failed') }
    finally { saveInProgress.current = false; setSaving(false) }
  }
  const status = error ? <div className="error-box" role="alert">{error}<button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></div>
    : <p className="surtr-s3-status" role="status">{loading ? 'スルトのデータを読み込み中…' : 'スルトS3のデータを取得できませんでした。'}</p>

  return <section className="calculator-page surtr-s3-page surtr-duration-page" aria-labelledby="surtr-duration-title">
    <div className="page-heading-with-breadcrumbs">
      <PageBreadcrumbs parents={[SURTR_HOME_LINK]} current="S3 継続時間" />
      <header className="page-intro"><h1 id="surtr-duration-title">S3 継続時間<span className="surtr-s3-subtitle">発動から退場まで</span></h1></header>
    </div>
    <CollapsibleCalculatorPanel id="surtr-duration-info" number="01" title="オペレーター情報" defaultOpen={false}
      summary={`スルト・昇進2 Lv.${settings.level}・信頼100`} collapsedLabel="情報を表示">
      {record ? <div className="surtr-s3-table-wrap"><table className="surtr-s3-table" aria-label="スルトのHPと余燼">
        <thead><tr><th scope="col">装備</th><th scope="col">発動前の最大HP</th><th scope="col">スキル中の最大HP</th><th scope="col">余燼の持続時間</th></tr></thead>
        <tbody>{comparison.map(item => <tr key={item.id}><th scope="row">{item.label}</th>
          <td>{item.model ? formatHp(item.model.baseMaxHp) : '—'}</td><td>{item.model ? formatHp(item.model.maxHp) : '—'}</td>
          <td>{item.model ? seconds(item.model.remnantDuration) : '—'}</td>
        </tr>)}</tbody>
      </table></div> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-duration-settings" number="02" title="計算設定" summary={`${label}・潜在${potential}・${comparison[0]?.label ?? selectedChoice.label}`} collapsedLabel="設定を表示">
      {record ? <>
        <div className="surtr-duration-fields">
          <label className="calculator-field"><span>スキルレベル</span><select aria-label="スキルレベル" value={settings.skillLevelIndex} onChange={event => setSkillLevelIndex(Number(event.target.value))}>
            {record.skillLevels.map((_, index) => <option key={index} value={index}>{skillLabel(index)}</option>)}
          </select></label>
          <label className="calculator-field"><span>潜在</span><select aria-label="潜在" value={potential} onChange={event => setPotential(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>潜在{value}</option>)}
          </select></label>
        </div>
        <fieldset className="surtr-s3-mods surtr-duration-mods"><legend>MOD選択</legend>
          <div className="surtr-s3-segments surtr-duration-module-buttons">
            {choices.map(choice => <button key={choice.id} type="button" aria-pressed={selectedChoice.id === choice.id}
              onClick={() => setSelectedModuleId(choice.id)}>{choice.label}</button>)}
          </div>
          <label className="surtr-duration-module-level"><span>レベル</span>
            <select aria-label="MODレベル" disabled={!selectedChoice.id}
              value={selectedChoice.id ? moduleLevels[selectedChoice.id] ?? selectedChoice.levels.at(-1) ?? 3 : ''}
              onChange={event => setModuleLevels(previous => ({ ...previous, [selectedChoice.id]: Number(event.target.value) }))}>
              {selectedChoice.id
                ? selectedChoice.levels.map(level => <option key={level} value={level}>Lv.{level}</option>)
                : <option value="">—</option>}
            </select>
          </label>
        </fieldset>
        <dl className="surtr-duration-baseline"><div><dt>外部回復</dt><dd>なし</dd></div><div><dt>被ダメージ</dt><dd>なし</dd></div><div><dt>外部HPバフ</dt><dd>なし</dd></div></dl>
        <details className="surtr-s3-assumptions"><summary>計算条件</summary>
          <p>S3の発動操作を0秒とし、準備時間0.6秒の後に最大HP増加・全回復を反映します。自動退場までを対象とし、手動撤退は含めません。</p>
          <p>スキル中の最大HPに対し、毎秒の減少率が0から60秒で20%まで増えるモデルです。効果開始から0.2秒ごとにHPを減らし、致死量に達するとHP1で余燼へ移行します。</p>
          <p>ゲームデータと公開されている挙動に基づく推定です。初回の減少タイミング、内部の丸め、余燼の発動・退場フレームは実機未検証です。HP推移は発動直前を全快とし、その時点の最大HPに対する割合で表示します。</p>
          <p><a href="https://prts.wiki/w/%E5%8F%B2%E5%B0%94%E7%89%B9%E5%B0%94" target="_blank" rel="noreferrer">減少間隔・準備時間の参照元</a></p>
        </details>
      </> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-duration-output" number="03" title="計算結果" summary={title} collapsedLabel="結果を表示" className="surtr-s3-output-panel">
      {!record ? status : invalid ? <p role="alert">計算に必要なデータを取得できませんでした。</p>
        : !series.length ? <p className="surtr-s3-status" role="status">装備を選択してください。</p>
          : <div className="surtr-s3-results-layout">
            <section className="surtr-s3-chart-section" aria-labelledby="surtr-duration-chart-title">
              <div className="surtr-s3-result-heading"><h3 id="surtr-duration-chart-title">{title}</h3>
                <button type="button" className="button secondary" aria-label="グラフをPNG画像で保存" aria-haspopup="dialog" onClick={openImage}>画像を保存</button>
              </div>
              <div className="surtr-s3-chart-area"><SurtrDurationChart series={series} title={title} selection={selectedTimelineRow} /></div>
            </section>
            <div className="surtr-s3-table-wrap"><table className="surtr-s3-table surtr-duration-result-table" aria-label="S3発動から退場までの推定時間">
              <thead><tr><th scope="col">装備</th><th scope="col">余燼発動まで</th><th scope="col">余燼中</th><th scope="col">退場まで</th></tr></thead>
              <tbody>{series.map(item => <tr key={item.id}><th scope="row"><span className="surtr-s3-column-label"><i style={{ backgroundColor: item.color }} />{item.label}</span></th>
                <td>{seconds(item.remnantStart)}</td><td>{seconds(item.remnantDuration)}</td><td><strong>{seconds(item.retreatTime)}</strong></td>
              </tr>)}</tbody>
            </table></div>
            <SurtrDurationTimelineTable key={`${calculation?.label}:${potential}:${settings.skillLevelIndex}`}
              rows={timelineRows} step={timelineStep} onStepChange={setTimelineStep} selectedTime={selectedTimelineRow?.time}
              onSelect={row => { if (calculation?.result) setTimelineSelection({ result: calculation.result, time: row.time }) }} />
          </div>}
      {feedback && feedback !== 'failed' && <p className="surtr-s3-status" role="status">{feedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    </CollapsibleCalculatorPanel>
    {image && <ChartImageSaveDialog initialFilename={image.filename} getDefaultFilename={ratio => withChartImageAspect(image.filename, ratio)} aspect={aspect} onAspectChange={setAspect}
      canChooseLocation={!!picker} saving={saving} error={feedback === 'failed'} helpMode="popover"
      onClose={() => { if (!saveInProgress.current) { setImage(null); setFeedback(null) } }} onSave={(filename, ratio) => void saveImage(filename, ratio)}
      preview={<SurtrDurationChartImagePreview key={`${image.id}:${aspectRatio ?? 'auto'}`} {...image} aspectRatio={aspectRatio} />} />}
  </section>
}
