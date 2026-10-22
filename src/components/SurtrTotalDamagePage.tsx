import { useCallback, useMemo, useRef, useState } from 'react'
import type { SkillRecord } from '../types/skill'
import { SURTR_OPERATOR_ID, type SurtrDpsSettings } from '../lib/surtrDps'
import {
  deriveSurtrTotalDamageModel, calculateSurtrTotalDamage, buildSurtrTotalDamageTimeSamples,
  type SurtrTotalDamageAssumptions,
} from '../lib/surtrTotalDamage'
import { getSurtrModuleChoices, getSelectedSurtrModuleStages, type SurtrModuleChoice } from '../lib/surtrModuleComparison'
import { buildSurtrTotalDamageTable, buildSurtrTotalDamageTableTsv, getSurtrTotalDamageTableWinnerGap, SURTR_TOTAL_DAMAGE_TABLE_MAXIMUM_CELLS,
  type SurtrTotalDamageTableDisplayMode, type SurtrTotalDamageTableLayout,
  type SurtrTotalDamageWinnerColor } from '../lib/surtrTotalDamageTable'
import { getSurtrDpsResistanceSamples, type SurtrDpsBarStep } from '../lib/surtrDpsResistance'
import { getSkillLevelLabel } from '../lib/skillJsonAnalysis'
import { writeClipboardText } from '../lib/clipboard'
import { getSurtrTotalDamageTableImageFilename, type SurtrTotalDamageTableImageFilenameOptions } from '../lib/surtrTotalDamageTableImageFilename'
import {
  SURTR_TOTAL_DAMAGE_TABLE_TITLE_SIZES, SURTR_TOTAL_DAMAGE_TABLE_DETAIL_SIZES,
  DEFAULT_SURTR_TOTAL_DAMAGE_TABLE_TITLE_SIZE, DEFAULT_SURTR_TOTAL_DAMAGE_TABLE_DETAIL_SIZE,
  type SurtrTotalDamageTableTitleSize, type SurtrTotalDamageTableDetailSize,
} from '../lib/surtrTotalDamageTableImageTypography'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { SURTR_HOME_LINK } from '../lib/navigation'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { OperatorModuleComparison } from './OperatorModuleComparison'
import { SurtrModuleStageSelection } from './SurtrModuleStageSelection'
import { SurtrResistanceStepControl, getSurtrResistanceStepError } from './SurtrResistanceStepControl'
import { SurtrTotalDamageTableContent, type SurtrTotalDamageTableCellSelection } from './SurtrTotalDamageTableContent'
import { SurtrTotalDamageTableImagePreview, saveSurtrTotalDamageTableImage,
  type SurtrTotalDamageTableImageSnapshot } from './SurtrTotalDamageTableImage'
import { SurtrTotalDamageDetail } from './SurtrTotalDamageDetail'
import { SurtrTotalDamageStagePanel } from './SurtrTotalDamageStagePanel'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import './DamageCalculator.css'
import './SurtrS3Page.css'
import './SurtrTotalDamagePage.css'

interface ImageSnapshot extends SurtrTotalDamageTableImageSnapshot {
  id: number
  filenameOptions: SurtrTotalDamageTableImageFilenameOptions
}
const number = (value: number, precision = 2) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: precision }).format(value)
const validNumber = (input: string, min: number, max: number) => input.trim() !== '' && Number.isFinite(Number(input)) && Number(input) >= min && Number(input) <= max

export function SurtrTotalDamagePage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]; loading: boolean; error: string | null; onRetry: () => void
}) {
  const record = rows.find(row => row.operatorId === SURTR_OPERATOR_ID && row.skillIndex === 3)
  const [settings, setSettings] = useState<SurtrDpsSettings>({ level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false })
  const [excluded, setExcluded] = useState<string[]>([])
  const [moduleLevels, setModuleLevels] = useState<Record<string, number[]>>({})
  const [timeDraft, setTimeDraft] = useState({ start: '10', end: '60', step: '10' })
  const [resistanceDraft, setResistanceDraft] = useState({ min: '0', max: '100' })
  const [resistanceStep, setResistanceStep] = useState<SurtrDpsBarStep>(20)
  const [customResistanceStep, setCustomResistanceStep] = useState(false)
  const [resistanceStepDraft, setResistanceStepDraft] = useState('20')
  const [firstAttackDraft, setFirstAttackDraft] = useState('0.6')
  const [hitDelayDraft, setHitDelayDraft] = useState('0.3')
  const [ctCarry, setCtCarry] = useState<SurtrTotalDamageAssumptions['ctCarry']>('time')
  const [includeRetreatHit, setIncludeRetreatHit] = useState(false)
  const [layout, setLayout] = useState<SurtrTotalDamageTableLayout>('resistance')
  const [displayMode, setDisplayMode] = useState<SurtrTotalDamageTableDisplayMode>('total')
  const [winnerLayout, setWinnerLayout] = useState<'time' | 'resistance'>('resistance')
  const [winnerColor, setWinnerColor] = useState<SurtrTotalDamageWinnerColor>('module')
  const [winnerGapShading, setWinnerGapShading] = useState(false)
  const tableLayout = displayMode === 'winner' ? winnerLayout : layout
  const [colorScale, setColorScale] = useState<'none' | 'LINEAR' | 'SQRT'>('none')
  const [precision, setPrecision] = useState(0)
  const [selectedCell, setSelectedCell] = useState<SurtrTotalDamageTableCellSelection | null>(null)
  const [copyState, setCopyState] = useState<{ text: string; failed: boolean } | null>(null)
  const [image, setImage] = useState<ImageSnapshot | null>(null)
  const [titleSize, setTitleSize] = useState<SurtrTotalDamageTableTitleSize>(DEFAULT_SURTR_TOTAL_DAMAGE_TABLE_TITLE_SIZE)
  const [detailSize, setDetailSize] = useState<SurtrTotalDamageTableDetailSize>(DEFAULT_SURTR_TOTAL_DAMAGE_TABLE_DETAIL_SIZE)
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const savingRef = useRef(false)
  const nextImageId = useRef(0)
  const maximumLevel = record?.operatorProfile.phases[2]?.maxLevel ?? 90
  const effectiveSettings = useMemo(() => ({ ...settings, level: Math.min(settings.level, maximumLevel),
    skillLevelIndex: Math.min(settings.skillLevelIndex, (record?.skillLevels.length ?? 10) - 1),
  }), [settings, maximumLevel, record])
  const choices = useMemo(() => getSurtrModuleChoices(record?.operatorProfile, effectiveSettings.level), [record, effectiveSettings.level])
  const stages = useMemo(() => getSelectedSurtrModuleStages(choices, excluded, moduleLevels), [choices, excluded, moduleLevels])
  const comparisons = useMemo(() => stages.map(stage => ({ ...stage,
    model: record ? deriveSurtrTotalDamageModel(record, effectiveSettings, stage.moduleId, stage.level) : null,
  })), [stages, record, effectiveSettings])
  const toggleLevel = (choice: SurtrModuleChoice, level: number, checked: boolean) => {
    setModuleLevels(previous => {
      const current = excluded.includes(choice.id) ? [] : previous[choice.id] ?? [choice.levels.at(-1) ?? 3]
      return { ...previous, [choice.id]: choice.levels.filter(value => value === level ? checked : current.includes(value)) }
    })
    setExcluded(previous => previous.filter(id => id !== choice.id))
    setCopyState(null)
  }
  const updateSetting = <K extends keyof SurtrDpsSettings>(key: K, value: SurtrDpsSettings[K]) => {
    setSettings(previous => ({ ...previous, [key]: value }))
    setCopyState(null)
  }
  const times = useMemo(() => Object.values(timeDraft).some(value => !validNumber(value, 0, 3600)) ? []
    : buildSurtrTotalDamageTimeSamples(Number(timeDraft.start), Number(timeDraft.end), Number(timeDraft.step)), [timeDraft])
  const timeError = !validNumber(timeDraft.start, 0, 3600) || !validNumber(timeDraft.end, 0, 3600)
    ? '開始・終了は0〜3600秒で入力してください。'
    : Number(timeDraft.start) > Number(timeDraft.end) ? '終了は開始以上にしてください。'
    : !validNumber(timeDraft.step, 0.01, 3600) ? '刻みは0.01〜3600秒で入力してください。'
    : !times.length ? '比較する時刻は201点以内にしてください。' : null
  const resistanceRange = useMemo(() => ({ min: Number(resistanceDraft.min), max: Number(resistanceDraft.max) }), [resistanceDraft])
  const resistanceRangeError = Object.values(resistanceDraft).some(value => !validNumber(value, 0, 100) || !Number.isInteger(Number(value)))
    ? '術耐性は0〜100の整数で入力してください。'
    : resistanceRange.min > resistanceRange.max ? '術耐性の終了は開始以上にしてください。' : null
  const resistanceStepError = getSurtrResistanceStepError(customResistanceStep, resistanceStepDraft)
  const resistances = useMemo(() => resistanceRangeError || resistanceStepError ? []
    : resistanceRange.min === resistanceRange.max ? [resistanceRange.min]
    : getSurtrDpsResistanceSamples(resistanceStep, resistanceRange), [resistanceRangeError, resistanceStepError, resistanceRange, resistanceStep])
  const resistanceError = resistanceRangeError ?? (resistanceStepError || (!resistances.length ? '範囲内に術耐性の代表値がありません。' : null))
  const delayLimit = comparisons.length && comparisons.every(item => item.model)
    ? Math.min(...comparisons.flatMap(item => item.model ? [item.model.timing.attackIntervalBefore, item.model.timing.attackIntervalAfter] : [])) : null
  const timingError = !validNumber(firstAttackDraft, 0, 3600) ? '最初の攻撃開始は0〜3600秒で入力してください。'
    : !validNumber(hitDelayDraft, 0, delayLimit ?? 3600) ? `命中までの時間は0〜${number(delayLimit ?? 3600, 4)}秒で入力してください。` : null
  const assumptions = useMemo<SurtrTotalDamageAssumptions>(() => ({ firstAttackStart: Number(firstAttackDraft),
    hitDelay: Number(hitDelayDraft), ctCarry, includeRetreatHit,
  }), [firstAttackDraft, hitDelayDraft, ctCarry, includeRetreatHit])
  const tooManyCells = comparisons.length * times.length * resistances.length > SURTR_TOTAL_DAMAGE_TABLE_MAXIMUM_CELLS
  const matrix = useMemo(() => timeError || resistanceError || timingError || tooManyCells || !comparisons.length || comparisons.some(item => !item.model)
    ? null : buildSurtrTotalDamageTable(comparisons.map(item => ({ ...item, model: item.model! })), times, resistances, assumptions),
  [timeError, resistanceError, timingError, tooManyCells, comparisons, times, resistances, assumptions])
  const activeCell = selectedCell && matrix?.times.includes(selectedCell.time) && matrix.resistances.includes(selectedCell.resistance)
    && matrix.series.some(item => item.id === selectedCell.seriesId) ? selectedCell : null
  const gapShadingActive = displayMode === 'winner' && winnerColor === 'module' && winnerGapShading && (matrix?.series.length ?? 0) >= 2
  const activeWinnerGap = gapShadingActive && matrix && activeCell
    ? getSurtrTotalDamageTableWinnerGap(matrix, matrix.times.indexOf(activeCell.time), matrix.resistances.indexOf(activeCell.resistance)) : null
  const detailComparisons = useMemo(() => activeCell === null ? [] : comparisons.flatMap(item => {
    if (!item.model) return []
    const result = calculateSurtrTotalDamage(item.model, activeCell.time, activeCell.resistance, assumptions)
    return result ? [{ ...item, model: item.model, result }] : []
  }), [activeCell, comparisons, assumptions])
  const label = getSkillLevelLabel(effectiveSettings.skillLevelIndex, record?.skillLevels.length ?? 10)
  const blockLabel = effectiveSettings.blocking ? '対象を自身でブロック' : '未ブロック'
  const status = loading ? <p className="surtr-s3-status" role="status">データを読み込み中…</p>
    : error ? <div className="error-box" role="alert">{error}<button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></div>
    : <p className="surtr-s3-status" role="alert">スルトS3のデータが見つかりません。</p>
  const resultError = timeError ?? resistanceError ?? timingError
  const outputReady = !!matrix
  const tsv = useMemo(() => matrix ? buildSurtrTotalDamageTableTsv(matrix, tableLayout, precision, displayMode) : '',
    [matrix, tableLayout, precision, displayMode])
  const currentCopy = copyState?.text === tsv ? copyState : null
  const outputLabel = displayMode === 'winner' ? '最大のMOD' : '総ダメージ'
  const conditions = [
    `${label}・昇進2 Lv.${effectiveSettings.level}・信頼${effectiveSettings.trust}・潜在${effectiveSettings.potential}・${blockLabel}・単体`,
    `初撃開始 ${number(assumptions.firstAttackStart, 4)} s・命中まで ${number(assumptions.hitDelay, 4)} s・${ctCarry === 'time' ? '残りCTの時間を維持' : '残りCTの割合を維持'}・${includeRetreatHit ? '退場と同時の命中を含む' : '退場と同時の命中を含まない'}`,
    ...(displayMode === 'winner' ? [`比較：${matrix?.series.map(item => item.label).join('・') ?? ''}`] : []),
  ]
  const copyTable = async () => {
    try { await writeClipboardText(tsv); setCopyState({ text: tsv, failed: false }) }
    catch { setCopyState({ text: tsv, failed: true }) }
  }
  const openImage = () => {
    if (!matrix) return
    setImage(structuredClone({ id: ++nextImageId.current, matrix, layout: tableLayout, precision, colorScale,
      displayMode, winnerColor, winnerGapShading: gapShadingActive, titleSize, detailSize,
      title: displayMode === 'winner' ? 'スルト S3 総ダメージが最大のMOD' : 'スルト S3 総ダメージ', conditions,
      filenameOptions: { metadata: { skillLabel: label, level: effectiveSettings.level, trust: effectiveSettings.trust,
        potential: effectiveSettings.potential, blocking: effectiveSettings.blocking }, times, resistances, series: matrix.series,
        assumptions, layout: tableLayout, precision, colorScale, displayMode, winnerColor, winnerGapShading: gapShadingActive, titleSize, detailSize } }))
    setFeedback(null); setPreviewReady(false); setPreviewError(null)
  }
  const updateImageTypography = (value: { titleSize?: SurtrTotalDamageTableTitleSize; detailSize?: SurtrTotalDamageTableDetailSize }) => {
    if (!image || ((value.titleSize === undefined || value.titleSize === image.titleSize)
      && (value.detailSize === undefined || value.detailSize === image.detailSize))) return
    if (value.titleSize !== undefined) setTitleSize(value.titleSize)
    if (value.detailSize !== undefined) setDetailSize(value.detailSize)
    setPreviewReady(false); setPreviewError(null)
    setImage(previous => previous ? { ...previous, ...value,
      filenameOptions: { ...previous.filenameOptions, ...value } } : null)
  }
  const picker = getChartImageSavePicker()
  const saveImage = async (filename: string, aspectRatio?: number) => {
    if (!image || !previewReady || previewError || savingRef.current) return
    const snapshot = image
    savingRef.current = true; setSaving(true); setFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      await saveSurtrTotalDamageTableImage({ snapshot, filename, aspectRatio,
        writeBlob: destination.type === 'file' ? destination.write : undefined })
      setImage(null); setFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
    } catch { setFeedback('failed') }
    finally { savingRef.current = false; setSaving(false) }
  }
  const imageRatio = aspect.preset === 'auto' ? undefined : Number(aspect.width) / Number(aspect.height)
  const imageLayoutReady = useCallback(() => { setPreviewReady(true); setPreviewError(null) }, [])
  const imageLayoutError = useCallback(() => {
    setPreviewReady(false)
    setPreviewError('この配置・比率では全行・全列を画像に収められません。比較する点を減らすか、画像の比率を変更してください。')
  }, [])

  return <section className="calculator-page surtr-s3-page surtr-total-damage-page" aria-labelledby="surtr-total-damage-title">
    <div className="page-heading-with-breadcrumbs">
      <PageBreadcrumbs parents={[SURTR_HOME_LINK]} current="S3 総ダメージ" />
      <header className="page-intro"><h1 id="surtr-total-damage-title">S3 総ダメージ<span className="surtr-s3-subtitle">ラグナロク</span></h1></header>
    </div>
    <CollapsibleCalculatorPanel id="surtr-total-damage-info" number="01" title="オペレーター情報" summary="スルト・昇進2" defaultOpen={false} collapsedLabel="情報を表示">
      {record ? comparisons.length ? <div className="surtr-s3-table-wrap"><table className="surtr-s3-table" aria-label="S3中のステータス">
        <thead><tr><th scope="col">項目</th>{comparisons.map(item => <th scope="col" key={item.id}>{item.label}</th>)}</tr></thead>
        <tbody>{[
          { label: '攻撃力', value: (item: typeof comparisons[number]) => item.model ? number(item.model.before.effectiveAttack) : '—' },
          { label: '発動前の攻撃間隔（秒）', value: (item: typeof comparisons[number]) => item.model ? number(item.model.timing.attackIntervalBefore, 4) : '—' },
          { label: '発動後の攻撃間隔（秒）', value: (item: typeof comparisons[number]) => item.model ? number(item.model.timing.attackIntervalAfter, 4) : '—' },
          { label: '余燼の持続時間（秒）', value: (item: typeof comparisons[number]) => item.model ? number(item.model.timing.remnantDuration) : '—' },
          { label: '術耐性無視', value: (item: typeof comparisons[number]) => item.model ? number(item.model.before.resistanceIgnore) : '—' },
          { label: '術脆弱', value: (item: typeof comparisons[number]) => item.model ? `${number(item.model.before.artsFragility * 100)}%` : '—' },
        ].map(row => <tr key={row.label}><th scope="row">{row.label}</th>{comparisons.map(item => <td key={item.id}>{row.value(item)}</td>)}</tr>)}</tbody>
      </table></div> : <p role="status">比較するMODを選択してください。</p> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-total-damage-modules" number="02" title="モジュール" summary="スルト" defaultOpen={false} collapsedLabel="モジュールを表示">
      {record ? <OperatorModuleComparison profile={record.operatorProfile} operatorName={record.operatorName} operatorId={record.operatorId} /> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-total-damage-settings" number="03" title="計算条件" summary={`${label}・潜在${effectiveSettings.potential}・${blockLabel}`} collapsedLabel="設定を表示">
      {record ? <>
        <div className="surtr-s3-fields">
          <label className="calculator-field"><span>レベル（昇進2）</span><input type="number" min={1} max={maximumLevel} step={1} value={effectiveSettings.level}
            onChange={event => updateSetting('level', Math.max(1, Math.min(maximumLevel, Math.trunc(Number(event.target.value)) || 1)))} /></label>
          <label className="calculator-field"><span>信頼度</span><input type="number" min={0} max={100} step={1} value={effectiveSettings.trust}
            onChange={event => updateSetting('trust', Math.max(0, Math.min(100, Math.trunc(Number(event.target.value)) || 0)))} /></label>
          <label className="calculator-field"><span>スキルレベル</span><select value={effectiveSettings.skillLevelIndex} onChange={event => updateSetting('skillLevelIndex', Number(event.target.value))}>
            {record.skillLevels.map((_, index) => <option key={index} value={index}>{getSkillLevelLabel(index, record.skillLevels.length)}</option>)}</select></label>
          <label className="calculator-field"><span>潜在</span><select value={effectiveSettings.potential} onChange={event => updateSetting('potential', Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>潜在{value}</option>)}</select></label>
        </div>
        <SurtrModuleStageSelection choices={choices} excluded={excluded} moduleLevels={moduleLevels} onToggleLevel={toggleLevel}
          onToggleNone={checked => { setExcluded(previous => checked ? previous.filter(id => id !== '') : [...previous, '']); setCopyState(null) }} />
        <fieldset className="surtr-total-damage-fields"><legend>素質２発動までの時間（秒）</legend><div className="surtr-total-damage-time-fields">
          {(['start', 'end', 'step'] as const).map(key => <label key={key} className="calculator-field"><span>{{ start: '開始', end: '終了', step: '刻み' }[key]}</span>
            <input type="number" min={key === 'step' ? 0.01 : 0} max={3600} step="any" value={timeDraft[key]} aria-invalid={!!timeError}
              aria-describedby={timeError ? 'surtr-total-time-error' : undefined}
              onChange={event => { setTimeDraft(previous => ({ ...previous, [key]: event.target.value })); setCopyState(null) }} /></label>)}
        </div>{timeError && <p className="surtr-s3-axis-error" id="surtr-total-time-error" role="alert">{timeError}</p>}</fieldset>
        <div className="surtr-total-damage-target-fields">
          <div className="surtr-s3-block-setting"><span>ブロック状態</span><div className="surtr-s3-segments" role="group" aria-label="ブロック状態">
            <button type="button" aria-pressed={!effectiveSettings.blocking} onClick={() => updateSetting('blocking', false)}>未ブロック</button>
            <button type="button" aria-pressed={effectiveSettings.blocking} onClick={() => updateSetting('blocking', true)}>対象を自身でブロック</button>
          </div></div>
        </div>
        <fieldset className="surtr-total-damage-fields"><legend>攻撃時刻の扱い</legend><div className="surtr-total-damage-time-fields">
          <label className="calculator-field"><span>最初の攻撃開始（秒）</span><input type="number" min={0} max={3600} step="any" value={firstAttackDraft} aria-invalid={!!timingError}
            aria-describedby={timingError ? 'surtr-total-timing-error' : undefined} onChange={event => { setFirstAttackDraft(event.target.value); setCopyState(null) }} /></label>
          <label className="calculator-field"><span>攻撃開始から命中まで（秒）</span><input type="number" min={0} max={delayLimit ?? undefined} step="any" value={hitDelayDraft} aria-invalid={!!timingError}
            aria-describedby={timingError ? 'surtr-total-timing-error' : undefined} onChange={event => { setHitDelayDraft(event.target.value); setCopyState(null) }} /></label>
          <label className="calculator-field"><span>発動時の残りCT</span><select value={ctCarry} onChange={event => { setCtCarry(event.target.value as typeof ctCarry); setCopyState(null) }}>
            <option value="time">時間を維持</option><option value="ratio">攻撃間隔に対する割合を維持</option></select></label>
        </div><label className="surtr-s3-values-toggle surtr-total-damage-retreat-toggle"><input type="checkbox" checked={includeRetreatHit} onChange={event => { setIncludeRetreatHit(event.target.checked); setCopyState(null) }} />退場と同時の命中を含める</label>
        {timingError && <p className="surtr-s3-axis-error" id="surtr-total-timing-error" role="alert">{timingError}</p>}</fieldset>
        <details className="surtr-s3-assumptions"><summary>計算の前提・攻撃時刻の扱い</summary>
          <p>S3を発動した時刻を0秒とし、敵1体に中断せず攻撃し続ける場合の総ダメージです。敵の撃破・移動、外部バフ、フレーム単位の丸めは含みません。ブロック状態と術耐性は途中で変化しません。</p>
          <p>最初の攻撃開始0.6秒は、この試算の初期設定です。スキル効果発動までの0.6秒と同じ値を置いていますが、S3発動で攻撃CTがリセットされることを確認した値ではありません。命中まで0.3秒も暫定値です。</p>
          <p>素質２発動前に開始した攻撃は、予定していた命中時刻を維持します。発動時に命中までの時間を追加し直しません。以後の攻撃開始には、選択した残りCTの引き継ぎ方と発動後の攻撃間隔を使います。最初の攻撃より先に素質２が発動した場合、最初の攻撃開始時刻は設定値を維持します。</p>
          <p>素質２発動と同時の攻撃開始・命中は発動後に数えます。退場以降に攻撃は開始しません。退場より後の命中は数えず、退場と同時の命中だけ選択した設定に従います。命中時点のダメージ条件を使います。</p>
          <p>未ブロックはスルトが誰もブロックしていない状態です。対象を自身でブロックは、攻撃対象をスルト自身がブロックしている状態です。</p>
          <p>外部回復・被ダメージなしの継続時間モデルでは素質２発動は25秒です。このページでは発動までの時間を直接指定し、HP回復や被ダメージの経過は計算しません。</p>
        </details>
      </> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-total-damage-output" number="04" title="計算結果" summary={outputLabel} collapsedLabel="結果を表示" className="surtr-s3-output-panel"
      headerActions={<>
        <label className="surtr-s3-output-control"><span>表示内容</span><select aria-label="テーブルの表示内容" value={displayMode}
          onChange={event => { setDisplayMode(event.target.value as SurtrTotalDamageTableDisplayMode); setSelectedCell(null); setCopyState(null) }}>
          <option value="total">総ダメージ</option><option value="winner">最大のMOD</option></select></label>
        <label className="surtr-s3-output-control"><span>配置</span><select aria-label="テーブルの配置" value={tableLayout} onChange={event => {
          if (displayMode === 'winner') setWinnerLayout(event.target.value as 'time' | 'resistance')
          else setLayout(event.target.value as SurtrTotalDamageTableLayout)
        }}>
          <option value="time">時間別</option>{displayMode === 'total' && <option value="module">MOD別</option>}<option value="resistance">術耐性別</option></select></label>
        {displayMode === 'winner' ? <><label className="surtr-s3-output-control"><span>色分け</span><select aria-label="最大MODの色分け" value={winnerColor}
          onChange={event => setWinnerColor(event.target.value as SurtrTotalDamageWinnerColor)}>
          <option value="module">MOD別</option><option value="none">なし</option></select></label>
          <label className="surtr-s3-values-toggle"><input type="checkbox" checked={winnerGapShading}
            disabled={winnerColor !== 'module' || (matrix?.series.length ?? 0) < 2}
            onChange={event => setWinnerGapShading(event.target.checked)} />差に応じて濃淡を変える</label></> : <>
        <label className="surtr-s3-output-control"><span>カラースケール</span><select value={colorScale} onChange={event => setColorScale(event.target.value as typeof colorScale)}>
          <option value="none">なし</option><option value="LINEAR">線形</option><option value="SQRT">平方根</option></select></label>
        <label className="surtr-s3-output-control"><span>小数点以下</span><select value={precision} onChange={event => { setPrecision(Number(event.target.value)); setCopyState(null) }}>{[0, 1, 2, 3].map(value => <option key={value} value={value}>{value}桁</option>)}</select></label>
        </>}
      </>}>
      <fieldset className="surtr-total-damage-fields surtr-total-damage-resistance-fields"><legend>敵の術耐性</legend><div className="surtr-total-damage-resistance-controls">
        {(['min', 'max'] as const).map(key => <label key={key} className="calculator-field"><span>{key === 'min' ? '術耐性の開始' : '術耐性の終了'}</span>
          <input type="number" min={0} max={100} step={1} value={resistanceDraft[key]} aria-invalid={!!resistanceRangeError}
            aria-describedby={resistanceRangeError ? 'surtr-total-resistance-error' : undefined}
            onChange={event => setResistanceDraft(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}
        <SurtrResistanceStepControl step={resistanceStep} custom={customResistanceStep} draft={resistanceStepDraft}
          onChange={setResistanceStep} onCustomChange={setCustomResistanceStep} onDraftChange={setResistanceStepDraft} errorId="surtr-total-resistance-error" />
      </div>{resistanceError && <p className="surtr-s3-axis-error" id="surtr-total-resistance-error" role="alert">{resistanceError}</p>}
      {resistanceStep === 'ratings' && <details className="surtr-s3-assumptions"><summary>ゲーム内表記の代表値</summary>
        <p>各ランクの代表値で計算します。ランク内の平均ダメージではありません。</p></details>}
      </fieldset>
      {!record ? status : !comparisons.length ? <p role="status">比較するMODを選択してください。</p>
        : comparisons.some(item => !item.model) ? <p role="alert">選択したMODの計算に必要なデータを取得できませんでした。</p>
        : resultError ? <p role="status">計算条件を確認してください。</p>
        : tooManyCells ? <p role="alert">比較する数値は{number(SURTR_TOTAL_DAMAGE_TABLE_MAXIMUM_CELLS)}セル以内にしてください。時間や術耐性の刻みを大きくするか、MODの選択数を減らしてください。</p>
        : !matrix ? <p role="alert">この条件では総ダメージを計算できませんでした。</p>
        : <div className="surtr-s3-results-layout">
          <section className="surtr-s3-table-section" aria-labelledby="surtr-total-table-title">
            <div className="surtr-s3-result-heading"><h3 id="surtr-total-table-title">{outputLabel}</h3><div className="surtr-total-damage-table-actions">
              <button type="button" className="button secondary" disabled={!outputReady} onClick={() => void copyTable()}>{currentCopy ? currentCopy.failed ? 'コピー失敗' : 'コピー済み' : '表をコピー'}</button>
              <button type="button" className="button secondary" disabled={!outputReady} onClick={openImage} aria-label="テーブルをPNG画像で保存" aria-haspopup="dialog">画像を保存</button>
            </div></div>
            <SurtrTotalDamageTableContent matrix={matrix} layout={tableLayout} precision={precision} colorScale={colorScale}
              displayMode={displayMode} winnerColor={winnerColor} winnerGapShading={gapShadingActive}
              selectedCell={activeCell} onSelectCell={setSelectedCell} />
            <span className="visually-hidden" role="status">{currentCopy ? currentCopy.failed ? '数値表をコピーできませんでした。' : '数値表をコピーしました。' : ''}</span>
          </section>
          {activeCell && detailComparisons.length > 0 && <div id="surtr-total-damage-detail">
            {activeWinnerGap && <p className="surtr-total-damage-gap-summary">
              次点への増加率：{activeWinnerGap.increasePercent === null ? '—' : `${number(activeWinnerGap.increasePercent, 2)}％`}
              <span>総ダメージ差：{number(activeWinnerGap.absoluteDifference, precision)}</span>
            </p>}
            <SurtrTotalDamageDetail key={`${activeCell.time}:${activeCell.resistance}:${activeCell.seriesId}`}
            time={activeCell.time} resistance={activeCell.resistance} initialSeriesId={activeCell.seriesId} comparisons={detailComparisons} precision={precision} onClose={() => setSelectedCell(null)} /></div>}
        </div>}
      {feedback && feedback !== 'failed' && <p className="surtr-s3-status" role="status">{feedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    </CollapsibleCalculatorPanel>
    <SurtrTotalDamageStagePanel record={record} settings={effectiveSettings} assumptions={assumptions}
      firstAttackDraft={firstAttackDraft} hitDelayDraft={hitDelayDraft} status={status} />
    {image && <ChartImageSaveDialog initialFilename={getSurtrTotalDamageTableImageFilename(image.filenameOptions)}
      getDefaultFilename={ratio => getSurtrTotalDamageTableImageFilename(image.filenameOptions, ratio)} aspect={aspect}
      onAspectChange={value => {
        if (value.preset === aspect.preset && value.width === aspect.width && value.height === aspect.height) return
        setPreviewReady(false); setPreviewError(null); setAspect(value)
      }}
      aspectHint="タイトル・条件を含むテーブル全体の比率です。指定なしでは全行・全列が収まる大きさに自動調整します。"
      canChooseLocation={!!picker} saving={saving} saveDisabled={!previewReady || !!previewError} error={feedback === 'failed'} helpMode="popover" onClose={() => { if (!savingRef.current) { setImage(null); setFeedback(null) } }}
      onSave={(filename, ratio) => void saveImage(filename, ratio)}
      options={<><label className="chart-image-save-field"><span>画像タイトル</span><input type="text" maxLength={100} value={image.title} disabled={saving}
        onChange={event => { setPreviewReady(false); setPreviewError(null); setImage(previous => previous ? { ...previous, title: event.target.value } : null) }} /></label>
        <div className="surtr-total-damage-image-type-settings">
          <label className="chart-image-save-field"><span>タイトルサイズ</span><select aria-label="タイトルサイズ" value={image.titleSize} disabled={saving}
            onChange={event => updateImageTypography({ titleSize: Number(event.target.value) as SurtrTotalDamageTableTitleSize })}>
            {SURTR_TOTAL_DAMAGE_TABLE_TITLE_SIZES.map(size => <option key={size} value={size}>{size}px</option>)}</select></label>
          <label className="chart-image-save-field"><span>詳細サイズ</span><select aria-label="詳細サイズ" value={image.detailSize} disabled={saving}
            onChange={event => updateImageTypography({ detailSize: Number(event.target.value) as SurtrTotalDamageTableDetailSize })}>
            {SURTR_TOTAL_DAMAGE_TABLE_DETAIL_SIZES.map(size => <option key={size} value={size}>{size}px</option>)}</select></label>
        </div>
        {previewError && <p role="alert" className="chart-image-save-error">{previewError}</p>}</>}
      preview={<SurtrTotalDamageTableImagePreview key={`${image.id}:${image.title}:${image.titleSize}:${image.detailSize}:${JSON.stringify(aspect)}`} {...image} aspectRatio={imageRatio}
        onLayoutReady={imageLayoutReady} onLayoutError={imageLayoutError} />} />}
  </section>
}
