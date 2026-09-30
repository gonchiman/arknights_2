import { useMemo, useRef, useState } from 'react'
import type { SkillRecord } from '../types/skill'
import { SURTR_OPERATOR_ID, deriveSurtrDpsModel, buildSurtrDpsCurve, type SurtrDpsSettings } from '../lib/surtrDps'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules, isOperatorModuleUnlocked } from '../lib/operatorModules'
import { getModuleComparisonColors } from '../lib/moduleColors'
import { getSurtrDpsImageFilename } from '../lib/surtrDpsImageFilename'
import { transformSurtrDpsSeries, getSurtrDpsOutputTsv, type SurtrDpsMetric } from '../lib/surtrDpsOutput'
import { writeClipboardText } from '../lib/clipboard'
import { isValidHpChartYAxisRange } from '../lib/goldenglowTargetSwitchHpAxis'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { SURTR_HOME_LINK } from '../lib/navigation'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { SurtrDpsChart, SurtrDpsChartImage, SurtrDpsChartImagePreview, type SurtrDpsChartSeries, type SurtrDpsChartKind, type SurtrDpsChartYAxis } from './SurtrDpsChart'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './DamageCalculator.css'
import './SurtrS3Page.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(value)
const skillLabel = (index: number) => index < 7 ? `ランク${index + 1}` : `特化${index - 6}`
const tableResistances = Array.from({ length: 11 }, (_, index) => index * 10)
interface ImageSnapshot {
  id: number; series: SurtrDpsChartSeries[]; conditions: string; filename: string
  kind: SurtrDpsChartKind; barStep: number; metric: SurtrDpsMetric; title: string
  gridStyle: 'none' | 'dashed' | 'solid'; precision: number; yAxis: SurtrDpsChartYAxis; selectedResistance: number | null
}

export function SurtrS3Page({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const record = rows.find(row => row.operatorId === SURTR_OPERATOR_ID && row.skillIndex === 3)
  const [settings, setSettings] = useState<SurtrDpsSettings>({ level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false })
  const [excluded, setExcluded] = useState<string[]>([])
  const [moduleLevels, setModuleLevels] = useState<Record<string, number>>({})
  const [chartKind, setChartKind] = useState<SurtrDpsChartKind>('bar')
  const [barStep, setBarStep] = useState(20)
  const [gridStyle, setGridStyle] = useState<'none' | 'dashed' | 'solid'>('solid')
  const [precision, setPrecision] = useState(0)
  const [metric, setMetric] = useState<SurtrDpsMetric>('total')
  const [differenceMetric, setDifferenceMetric] = useState<'difference' | 'percent'>('difference')
  const [requestedBaselineId, setRequestedBaselineId] = useState('none')
  const [selectedResistance, setSelectedResistance] = useState<number | null>(null)
  const [yAxisMode, setYAxisMode] = useState<SurtrDpsChartYAxis['mode']>('zero')
  const [yAxisDraft, setYAxisDraft] = useState({ min: '0', max: '4000' })
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; ok: boolean } | null>(null)
  const [copying, setCopying] = useState(false)
  const [image, setImage] = useState<ImageSnapshot | null>(null)
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [imageFeedback, setImageFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const saveInProgress = useRef(false)
  const nextSnapshot = useRef(0)
  const picker = getChartImageSavePicker()
  const maximumLevel = record?.operatorProfile.phases[2]?.maxLevel ?? 90
  const effectiveSettings = useMemo(() => ({ ...settings,
    level: Math.min(maximumLevel, settings.level),
    skillLevelIndex: Math.min(settings.skillLevelIndex, Math.max(0, (record?.skillLevels.length ?? 10) - 1)),
  }), [settings, maximumLevel, record])
  const choices = useMemo(() => [
    { id: '', type: null as string | null, label: '未装備', levels: [] as number[], unlocked: true },
    ...getOperatorModules(record?.operatorProfile ?? {}).flatMap((module, index) => {
      const type = module.typeName2?.trim().toUpperCase()
      if (type !== 'X' && type !== 'Y') return []
      return [{ id: getOperatorModuleId(module, index), type, label: `MOD ${type}`,
        levels: getOperatorModuleLevels(module),
        unlocked: isOperatorModuleUnlocked(module, 2, effectiveSettings.level) }]
    }),
  ], [record, effectiveSettings.level])
  const comparison = useMemo(() => {
    if (!record) return []
    const selected = choices.filter(choice => choice.unlocked && !excluded.includes(choice.id))
    const colors = getModuleComparisonColors(selected.map(choice => ({ moduleType: choice.type, potential: effectiveSettings.potential })))
    return selected.map((choice, index) => {
      const level = moduleLevels[choice.id] ?? choice.levels.at(-1) ?? 3
      const model = deriveSurtrDpsModel(record, effectiveSettings, choice.id, level)
      return { ...choice, model, label: choice.id ? `${choice.label} Lv.${level}` : choice.label,
        color: colors[index], points: model ? buildSurtrDpsCurve(model).map(point => ({ x: point.resistance, value: point.dps })) : [] }
    })
  }, [record, choices, excluded, effectiveSettings, moduleLevels])
  const series = useMemo<SurtrDpsChartSeries[]>(() => comparison.filter(item => item.model).map(item => ({
    id: item.id || 'none', label: item.label, color: item.color, points: item.points,
  })), [comparison])
  const invalidModels = comparison.filter(item => !item.model)
  const baseline = series.find(item => item.id === requestedBaselineId) ?? series[0]
  const effectiveMetric = series.length > 1 ? metric : 'total'
  const outputSeries = useMemo(() => transformSurtrDpsSeries(series, effectiveMetric, baseline?.id ?? ''), [series, effectiveMetric, baseline?.id])
  const chartSeries = effectiveMetric === 'total' ? outputSeries : outputSeries.filter(item => item.id !== baseline?.id)
  const outputTitle = effectiveMetric === 'total' ? 'DPS' : effectiveMetric === 'difference' ? `${baseline?.label}とのDPS差` : `${baseline?.label}からの増加率`
  const outputResistances = useMemo(() => [...new Set([...tableResistances, ...(selectedResistance === null ? [] : [selectedResistance])])].sort((a, b) => a - b), [selectedResistance])
  const outputFormatter = useMemo(() => new Intl.NumberFormat('ja-JP', { minimumFractionDigits: precision, maximumFractionDigits: precision }), [precision])
  const formatOutput = (value: number | null | undefined) => {
    if (value == null) return '—'
    const rounded = Number(value.toFixed(precision))
    return `${outputFormatter.format(rounded === 0 ? 0 : rounded)}${effectiveMetric === 'percent' ? '%' : ''}`
  }
  const tableText = invalidModels.length ? '' : getSurtrDpsOutputTsv(outputSeries, outputResistances, precision, effectiveMetric)
  const copyState = copyFeedback?.text === tableText ? copyFeedback.ok : null
  const yAxis: SurtrDpsChartYAxis = chartKind === 'bar' ? { mode: 'zero' } : {
    mode: yAxisMode, ...(yAxisMode === 'manual' ? { min: Number(yAxisDraft.min), max: Number(yAxisDraft.max) } : {}),
  }
  const yAxisError = yAxis.mode === 'manual' && (!yAxisDraft.min.trim() || !yAxisDraft.max.trim()
    || !isValidHpChartYAxisRange({ min: yAxis.min!, max: yAxis.max! }))
    ? '最小値より大きい最大値を入力してください。' : ''
  const changeMetric = (next: SurtrDpsMetric) => { setMetric(next); setYAxisMode('zero') }
  const selectResistance = (value: number | null) => setSelectedResistance(previous => previous === value ? null : value)
  const copyTable = async () => {
    if (!tableText || copying) return
    setCopying(true)
    try { await writeClipboardText(tableText); setCopyFeedback({ text: tableText, ok: true }) }
    catch { setCopyFeedback({ text: tableText, ok: false }) }
    finally { setCopying(false) }
  }
  const label = skillLabel(effectiveSettings.skillLevelIndex)
  const blockLabel = effectiveSettings.blocking ? '対象を自身でブロック' : '未ブロック'
  const update = <K extends keyof SurtrDpsSettings>(key: K, value: SurtrDpsSettings[K]) => setSettings(previous => ({ ...previous, [key]: value }))
  const aspectRatio = aspect.preset !== 'auto' && [aspect.width, aspect.height].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(aspect.width) / Number(aspect.height) : undefined
  const openImage = () => {
    setImageFeedback(null)
    if (!chartSeries.length || invalidModels.length || yAxisError) return
    setImage({ id: ++nextSnapshot.current, series: chartSeries, kind: chartKind, barStep,
      title: `スルト S3 ${outputTitle}`, metric: effectiveMetric, gridStyle, precision, yAxis, selectedResistance,
      conditions: `${label}・${blockLabel}`,
      filename: getSurtrDpsImageFilename({ ...effectiveSettings, skillLevelLabel: label, modules: series.map(item => item.label), kind: chartKind, barStep,
        metric: effectiveMetric, baselineLabel: baseline?.label, gridStyle, precision, yAxis, selectedResistance }),
    })
  }
  const saveImage = async (filename: string, ratio?: number) => {
    if (!image || saveInProgress.current) return
    saveInProgress.current = true
    setSaving(true)
    setImageFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({ filename,
        width: getChartImageLayout({ naturalChartHeight: 334, aspectRatio: ratio }).width,
        chart: <SurtrDpsChartImage {...image} aspectRatio={ratio} />,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setImageFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
      setImage(null)
    } catch { setImageFeedback('failed') }
    finally { saveInProgress.current = false; setSaving(false) }
  }
  const status = error ? <div className="error-box" role="alert">{error}<button className="button secondary" type="button" onClick={onRetry}>再読み込み</button></div>
    : <p className="surtr-s3-status" role="status">{loading ? 'スルトのデータを読み込み中…' : 'スルトS3のデータを取得できませんでした。'}</p>

  return <section className="calculator-page surtr-s3-page" aria-labelledby="surtr-s3-title">
    <div className="page-heading-with-breadcrumbs">
      <PageBreadcrumbs parents={[SURTR_HOME_LINK]} current="S3分析" />
      <header className="page-intro"><h1 id="surtr-s3-title">S3分析<span className="surtr-s3-subtitle">ラグナロク</span></h1></header>
    </div>
    <CollapsibleCalculatorPanel id="surtr-s3-info" number="01" title="オペレーター情報" defaultOpen={false}
      summary="スルト・昇進2" collapsedLabel="情報を表示">
      {record && comparison.length > 0 ? <div className="surtr-s3-table-wrap"><table className="surtr-s3-table" aria-label="スキル中のステータス">
        <thead><tr><th scope="col">スキル中のステータス</th>{comparison.map(item => <th key={item.id} scope="col">{item.label}</th>)}</tr></thead>
        <tbody>{[
          { label: '攻撃力', value: (item: typeof comparison[number]) => item.model ? format(item.model.effectiveAttack) : '—' },
          { label: '攻撃速度', value: (item: typeof comparison[number]) => item.model ? format(item.model.attackSpeed) : '—' },
          { label: '攻撃間隔（秒）', value: (item: typeof comparison[number]) => item.model ? format(item.model.attackInterval) : '—' },
          { label: '術耐性無視', value: (item: typeof comparison[number]) => item.model ? format(item.model.resistanceIgnore) : '—' },
          { label: '術脆弱', value: (item: typeof comparison[number]) => item.model ? `${format(item.model.artsFragility * 100)}%` : '—' },
        ].map(row => <tr key={row.label}><th scope="row">{row.label}</th>{comparison.map(item => <td key={item.id}>{row.value(item)}</td>)}</tr>)}</tbody>
      </table></div> : record ? <p role="status">比較するMODを選択してください。</p> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-s3-settings" number="02" title="比較条件"
      summary={`${label}・潜在${effectiveSettings.potential}・${blockLabel}`} collapsedLabel="設定を表示">
      {record ? <>
        <div className="surtr-s3-fields">
          <label className="calculator-field"><span>レベル（昇進2）</span><input aria-label="レベル（昇進2）" type="number" min={1} max={maximumLevel} step={1} value={effectiveSettings.level}
            onChange={event => update('level', Math.max(1, Math.min(maximumLevel, Math.trunc(Number(event.target.value)) || 1)))} /></label>
          <label className="calculator-field"><span>信頼度</span><input aria-label="信頼度" type="number" min={0} max={100} step={1} value={effectiveSettings.trust}
            onChange={event => update('trust', Math.max(0, Math.min(100, Math.trunc(Number(event.target.value)) || 0)))} /></label>
          <label className="calculator-field"><span>スキルレベル</span><select aria-label="スキルレベル" value={effectiveSettings.skillLevelIndex} onChange={event => update('skillLevelIndex', Number(event.target.value))}>
            {record.skillLevels.map((_, index) => <option key={index} value={index}>{skillLabel(index)}</option>)}</select></label>
          <label className="calculator-field"><span>潜在</span><select aria-label="潜在" value={effectiveSettings.potential} onChange={event => update('potential', Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map(rank => <option key={rank} value={rank}>潜在{rank}</option>)}</select></label>
        </div>
        <fieldset className="surtr-s3-mods"><legend>比較するMOD</legend>{choices.map(choice => <div key={choice.id} className="surtr-s3-mod">
          <label><input type="checkbox" checked={choice.unlocked && !excluded.includes(choice.id)} disabled={!choice.unlocked}
            onChange={event => setExcluded(previous => event.target.checked ? previous.filter(id => id !== choice.id) : [...previous, choice.id])} />
            {choice.label}{!choice.unlocked && <span className="surtr-s3-locked">Lv.60で解放</span>}</label>
          {choice.id && <select aria-label={`${choice.label}のレベル`} disabled={!choice.unlocked || excluded.includes(choice.id)} value={moduleLevels[choice.id] ?? choice.levels.at(-1) ?? 3}
            onChange={event => setModuleLevels(previous => ({ ...previous, [choice.id]: Number(event.target.value) }))}>
            {choice.levels.map(level => <option key={level} value={level}>Lv.{level}</option>)}</select>}
        </div>)}</fieldset>
        <div className="surtr-s3-block-setting"><span>ブロック状態</span><div className="surtr-s3-segments" role="group" aria-label="ブロック状態">
          <button type="button" aria-pressed={!effectiveSettings.blocking} onClick={() => update('blocking', false)}>未ブロック</button>
          <button type="button" aria-pressed={effectiveSettings.blocking} onClick={() => update('blocking', true)}>対象を自身でブロック</button>
        </div></div>
        <details className="surtr-s3-assumptions"><summary>計算条件</summary>
          <p>敵1体への連続攻撃を想定した理論DPSです。素質2「余燼」は含めません。通常時の素質1、MODの攻撃力・特性を反映し、外部バフとフレーム単位の攻撃間隔の丸めは含めません。</p>
          <p>未ブロックはスルトが誰もブロックしていない状態です。「対象を自身でブロック」は攻撃対象をスルト自身がブロックしている状態です。</p>
        </details>
      </> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-s3-output" number="03" title="計算結果" summary={outputTitle} collapsedLabel="結果を表示" className="surtr-s3-output-panel"
      headerActions={<>
        <label className="surtr-s3-output-control"><span>グラフ</span><select aria-label="グラフの表示形式" value={chartKind} onChange={event => setChartKind(event.target.value as SurtrDpsChartKind)}>
          <option value="bar">棒グラフ</option><option value="line">折れ線</option>
        </select></label>
        {chartKind === 'bar' && <label className="surtr-s3-output-control"><span>術耐性の刻み</span><select aria-label="術耐性の刻み" value={barStep} onChange={event => setBarStep(Number(event.target.value))}>
          <option value={10}>10</option><option value={20}>20</option>
        </select></label>}
        <label className="surtr-s3-output-control"><span>横の目盛線</span><select aria-label="横の目盛線" value={gridStyle} onChange={event => setGridStyle(event.target.value as typeof gridStyle)}>
          <option value="none">なし</option><option value="dashed">破線</option><option value="solid">実線</option>
        </select></label>
        <details className="surtr-s3-comparison-options" onKeyDown={event => {
          if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }
        }}><summary>比較表示</summary><div className="surtr-s3-comparison-popover">
          <label className="surtr-s3-difference-toggle"><input type="checkbox" checked={effectiveMetric !== 'total'} disabled={series.length < 2}
            onChange={event => changeMetric(event.target.checked ? differenceMetric : 'total')} />基準との差</label>
          {effectiveMetric !== 'total' && <>
            <label className="calculator-field"><span>基準の装備</span><select aria-label="基準の装備" value={baseline?.id ?? ''} onChange={event => { setRequestedBaselineId(event.target.value); setYAxisMode('zero') }}>
              {series.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
            <label className="calculator-field"><span>表示</span><select aria-label="比較の表示方法" value={effectiveMetric} onChange={event => {
              const next = event.target.value as 'difference' | 'percent'; setDifferenceMetric(next); changeMetric(next)
            }}><option value="difference">DPS差</option><option value="percent">増加率（%）</option></select></label>
          </>}
        </div></details>
        <label className="surtr-s3-output-control"><span>小数点以下</span><select aria-label="出力の小数点以下の桁数" value={precision} onChange={event => setPrecision(Number(event.target.value))}>
          {[0, 1, 2, 3].map(value => <option key={value} value={value}>{value}桁</option>)}
        </select></label>
      </>}>
      {!record ? status : invalidModels.length ? <p role="alert">{invalidModels.map(item => item.label).join('・')}の計算に必要なデータを取得できませんでした。</p>
        : !series.length ? <p className="surtr-s3-status" role="status">比較するMODを選択してください。</p> : <div className="surtr-s3-results-layout">
          <section className="surtr-s3-chart-section" aria-labelledby="surtr-s3-chart-title">
            <div className="surtr-s3-result-heading">
              <h3 id="surtr-s3-chart-title">{outputTitle}</h3>
              <div className="surtr-s3-result-actions">
                {chartKind === 'line' && <>
                  <label className="surtr-s3-output-control"><span>縦軸</span><select aria-label="縦軸の表示範囲" value={yAxisMode} onChange={event => setYAxisMode(event.target.value as typeof yAxisMode)}>
                    <option value="zero">{effectiveMetric === 'total' ? '0から' : '0を含む'}</option><option value="auto">データに合わせる</option><option value="manual">範囲を指定</option>
                  </select></label>
                  {yAxisMode === 'manual' && <div className="surtr-s3-axis-bounds" role="group" aria-label="縦軸の範囲指定">
                    {(['min', 'max'] as const).map(bound => <label className="surtr-s3-output-control" key={bound}><span>{bound === 'min' ? '最小' : '最大'}</span>
                      <input type="number" step="any" aria-label={`縦軸の${bound === 'min' ? '最小値' : '最大値'}`} value={yAxisDraft[bound]} aria-invalid={!!yAxisError} aria-describedby={yAxisError ? 'surtr-s3-axis-error' : undefined}
                        onChange={event => setYAxisDraft(previous => ({ ...previous, [bound]: event.target.value }))} />
                    </label>)}
                  </div>}
                </>}
                <button className="button secondary" type="button" disabled={!chartSeries.length || !!yAxisError} onClick={openImage} aria-label="グラフをPNG画像で保存" aria-haspopup="dialog">画像を保存</button>
              </div>
              {yAxisError && <p className="surtr-s3-axis-error" id="surtr-s3-axis-error" role="alert">{yAxisError}</p>}
            </div>
            <div className="surtr-s3-chart-area"><SurtrDpsChart series={chartSeries} kind={chartKind} barStep={barStep} gridStyle={gridStyle} precision={precision}
              metric={effectiveMetric} yAxis={yAxis} selectedResistance={selectedResistance} onSelectResistance={setSelectedResistance} /></div>
            <div className="surtr-s3-readout">
              <label className="surtr-s3-output-control"><span>術耐性</span><select aria-label="選択する術耐性" value={selectedResistance ?? ''} onChange={event => setSelectedResistance(event.target.value === '' ? null : Number(event.target.value))}>
                <option value="">選択</option>{Array.from({ length: 101 }, (_, index) => <option key={index} value={index}>{index}</option>)}
              </select></label>
              {chartSeries.map(item => <span className="surtr-s3-readout-value" key={item.id}><span><i style={{ backgroundColor: item.color }} />{item.label}</span>
                <strong>{formatOutput(item.points.find(point => point.x === selectedResistance)?.value)}</strong></span>)}
            </div>
          </section>
          <section className="surtr-s3-table-section" aria-labelledby="surtr-s3-table-title">
            <div className="surtr-s3-result-heading"><h3 id="surtr-s3-table-title">数値表</h3>
              <button type="button" className="button secondary" aria-label="数値表をコピー" disabled={!tableText || copying} onClick={() => void copyTable()}>
                {copying ? 'コピー中…' : copyState === true ? 'コピー済み' : copyState === false ? 'コピー失敗' : '表をコピー'}
              </button>
            </div>
            <span className="visually-hidden" role="status">{copyState === true ? '数値表をコピーしました。' : copyState === false ? '数値表をコピーできませんでした。' : ''}</span>
            <div className="surtr-s3-table-wrap surtr-s3-result-table"><table className="surtr-s3-table" aria-label={`術耐性ごとの${outputTitle}`}>
              <thead><tr><th scope="col">術耐性</th>{outputSeries.map(item => <th key={item.id} scope="col"><span className="surtr-s3-column-label"><i style={{ backgroundColor: item.color }} />{item.label}</span>
                {effectiveMetric !== 'total' && item.id === baseline?.id && <span className="surtr-s3-baseline-label">基準</span>}</th>)}</tr></thead>
              <tbody>{outputResistances.map(resistance => <tr key={resistance} className={selectedResistance === resistance ? 'is-selected' : undefined}
                onClick={event => {
                  if (event.target instanceof Element && event.target.closest('button')) return
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true }); selectResistance(resistance)
                }}>
                <th scope="row"><button type="button" className="surtr-s3-table-resistance" aria-label={`術耐性 ${resistance}を選択`} aria-pressed={selectedResistance === resistance} onClick={() => selectResistance(resistance)}>{resistance}</button></th>
                {outputSeries.map(item => <td key={item.id}>{formatOutput(item.points.find(point => point.x === resistance)?.value)}</td>)}
              </tr>)}</tbody>
            </table></div>
          </section>
        </div>}
      {imageFeedback && imageFeedback !== 'failed' && <p className="surtr-s3-status" role="status">{imageFeedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    </CollapsibleCalculatorPanel>
    {image && <ChartImageSaveDialog initialFilename={image.filename} getDefaultFilename={ratio => withChartImageAspect(image.filename, ratio)} aspect={aspect} onAspectChange={setAspect}
      canChooseLocation={!!picker} saving={saving} error={imageFeedback === 'failed'} helpMode="popover"
      onClose={() => { if (!saveInProgress.current) { setImage(null); setImageFeedback(null) } }} onSave={(filename, ratio) => void saveImage(filename, ratio)}
      preview={<SurtrDpsChartImagePreview key={`${image.id}:${image.kind}:${aspectRatio ?? 'auto'}`} {...image} aspectRatio={aspectRatio} />} />}
  </section>
}
