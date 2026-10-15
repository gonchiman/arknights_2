import { useEffect, useMemo, useState } from 'react'
import type { SkillRecord } from '../types/skill'
import { SURTR_OPERATOR_ID, type SurtrDpsSettings } from '../lib/surtrDps'
import { deriveSurtrSkillDpsModel, calculateSurtrSkillDps, type SurtrSkillDpsModel } from '../lib/surtrSkillComparison'
import { readSurtrSkillComparisonPageState, writeSurtrSkillComparisonPageState } from '../lib/surtrSkillComparisonPageState'
import { getSelectedSurtrModuleStages, getSurtrModuleChoices, type SelectedSurtrModuleStage, type SurtrModuleChoice } from '../lib/surtrModuleComparison'
import { applySurtrComparisonPreset } from '../lib/surtrComparisonPresets'
import { getSurtrDpsResistanceSamples, isValidSurtrDpsResistanceRange } from '../lib/surtrDpsResistance'
import { getSkillLevelLabel } from '../lib/skillJsonAnalysis'
import { SURTR_HOME_LINK } from '../lib/navigation'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { SurtrModuleStageSelection } from './SurtrModuleStageSelection'
import { SurtrComparisonPresetControls } from './SurtrComparisonPresetControls'
import { SurtrResistanceStepControl, getSurtrResistanceStepError } from './SurtrResistanceStepControl'
import { SurtrSkillComparisonTableOutput, type SurtrSkillComparisonTableMetadata, type SurtrSkillComparisonTableSeries } from './SurtrSkillComparisonTableOutput'
import { SurtrSkillComparisonDetail, type SurtrSkillComparisonDetailSnapshot } from './SurtrSkillComparisonDetail'
import './DamageCalculator.css'
import './SurtrS3Page.css'
import './SurtrSkillComparisonPage.css'

interface ModuleModels extends SelectedSurtrModuleStage { s2: SurtrSkillDpsModel; s3: SurtrSkillDpsModel }

export function SurtrSkillComparisonPage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]; loading: boolean; error: string | null; onRetry: () => void
}) {
  const record2 = rows.find(row => row.operatorId === SURTR_OPERATOR_ID && row.skillIndex === 2)
  const record3 = rows.find(row => row.operatorId === SURTR_OPERATOR_ID && row.skillIndex === 3)
  const [state, setState] = useState(readSurtrSkillComparisonPageState)
  const [customStep, setCustomStep] = useState(typeof state.barStep === 'number' && ![10, 20].includes(state.barStep))
  const [stepDraft, setStepDraft] = useState(String(typeof state.barStep === 'number' ? state.barStep : 20))
  const [rangeDraft, setRangeDraft] = useState({ min: String(state.resistanceRange.min), max: String(state.resistanceRange.max) })
  const [detail, setDetail] = useState<SurtrSkillComparisonDetailSnapshot | null>(null)
  useEffect(() => writeSurtrSkillComparisonPageState(state), [state])
  const maximumLevel = record3?.operatorProfile.phases[2]?.maxLevel ?? 90
  const settings = useMemo(() => ({ ...state.settings, level: Math.min(state.settings.level, maximumLevel),
    skillLevelIndex: Math.min(state.settings.skillLevelIndex, Math.max(0, (record3?.skillLevels.length ?? 10) - 1)),
  }), [state.settings, maximumLevel, record3])
  const s2LevelIndex = Math.min(state.s2LevelIndex, Math.max(0, (record2?.skillLevels.length ?? 10) - 1))
  const label2 = getSkillLevelLabel(s2LevelIndex, record2?.skillLevels.length ?? 10)
  const label3 = getSkillLevelLabel(settings.skillLevelIndex, record3?.skillLevels.length ?? 10)
  const choices = useMemo(() => getSurtrModuleChoices(record3?.operatorProfile, settings.level), [record3, settings.level])
  const stages = useMemo(() => getSelectedSurtrModuleStages(choices, state.excluded, state.moduleLevels), [choices, state.excluded, state.moduleLevels])
  const models = useMemo(() => {
    if (!record2 || !record3) return null
    const result: ModuleModels[] = []
    for (const stage of stages) {
      const s2 = deriveSurtrSkillDpsModel(record2, { ...settings, skillLevelIndex: s2LevelIndex }, stage.moduleId, stage.level)
      const s3 = deriveSurtrSkillDpsModel(record3, settings, stage.moduleId, stage.level)
      if (!s2 || !s3) return null
      result.push({ ...stage, s2, s3 })
    }
    return result
  }, [record2, record3, settings, s2LevelIndex, stages])
  const rangeError = !rangeDraft.min.trim() || !rangeDraft.max.trim()
    || !isValidSurtrDpsResistanceRange({ min: Number(rangeDraft.min), max: Number(rangeDraft.max) })
    ? '0〜100の整数で、終了を開始より大きくしてください。' : ''
  const stepError = getSurtrResistanceStepError(customStep, stepDraft)
  const resistances = useMemo(() => getSurtrDpsResistanceSamples(state.barStep, state.resistanceRange), [state.barStep, state.resistanceRange])
  const series = useMemo(() => {
    if (!models) return null
    const result: SurtrSkillComparisonTableSeries[] = []
    for (const model of models) {
      const s2 = resistances.map(resistance => calculateSurtrSkillDps(model.s2, resistance, state.enemyCount)?.totalDps ?? null)
      const s3 = resistances.map(resistance => calculateSurtrSkillDps(model.s3, resistance, state.enemyCount)?.totalDps ?? null)
      if (s2.some(value => value === null) || s3.some(value => value === null)) return null
      result.push({ id: model.id, label: model.label, color: model.color, moduleType: model.type, moduleLevel: model.level,
        s2: s2 as number[], s3: s3 as number[] })
    }
    return result
  }, [models, resistances, state.enemyCount])
  const metadata: SurtrSkillComparisonTableMetadata = {
    level: settings.level, trust: settings.trust, potential: settings.potential, s2LevelLabel: label2, s3LevelLabel: label3,
    enemyCount: state.enemyCount, blocking: settings.blocking, remnantActive: settings.remnantActive === true,
  }
  const blockLabel = settings.blocking ? '対象1体を自身でブロック' : '未ブロック'
  const update = <K extends keyof SurtrDpsSettings>(key: K, value: SurtrDpsSettings[K]) => setState(previous => ({ ...previous, settings: { ...previous.settings, [key]: value } }))
  const toggleLevel = (choice: SurtrModuleChoice, level: number, checked: boolean) => setState(previous => {
    const selected = previous.excluded.includes(choice.id) ? [] : previous.moduleLevels[choice.id] ?? [choice.levels.at(-1) ?? 3]
    return { ...previous, excluded: previous.excluded.filter(id => id !== choice.id), moduleLevels: {
      ...previous.moduleLevels, [choice.id]: choice.levels.filter(candidate => candidate === level ? checked : selected.includes(candidate)),
    } }
  })
  const updateRange = (bound: 'min' | 'max', value: string) => {
    const draft = { ...rangeDraft, [bound]: value }
    setRangeDraft(draft)
    const range = { min: Number(draft.min), max: Number(draft.max) }
    if (draft.min.trim() && draft.max.trim() && isValidSurtrDpsResistanceRange(range)) setState(previous => ({ ...previous, resistanceRange: range }))
  }
  const openDetail = (resistance: number, initialSeriesId: string, initialSkill: 2 | 3 = 2) => {
    if (!models) return
    const entries = models.flatMap(item => {
      const s2 = calculateSurtrSkillDps(item.s2, resistance, state.enemyCount)
      const s3 = calculateSurtrSkillDps(item.s3, resistance, state.enemyCount)
      return s2 && s3 ? [{ id: item.id, label: item.label, color: item.color, s2: { model: item.s2, calculation: s2 }, s3: { model: item.s3, calculation: s3 } }] : []
    })
    if (entries.length !== models.length || !entries.length) return
    setDetail({ resistance, entries, initialSeriesId, initialSkill,
      conditions: `昇進2 Lv.${settings.level}・信頼${settings.trust}・潜在${settings.potential}・S2 ${label2}・S3 ${label3}・範囲内${state.enemyCount}${state.enemyCount === 4 ? '体以上' : '体'}・${blockLabel}・${settings.remnantActive ? '余燼中' : '余燼発動前'}` })
  }
  const status = error ? <div className="error-box" role="alert">{error}<button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></div>
    : <p className="surtr-s3-status" role="status">{loading ? 'スルトのデータを読み込み中…' : 'スルトのS2・S3のデータが見つかりません。'}</p>

  return <section className="calculator-page surtr-s3-page surtr-skill-comparison-page" aria-labelledby="surtr-skill-comparison-title">
    <div className="page-heading-with-breadcrumbs">
      <PageBreadcrumbs parents={[SURTR_HOME_LINK]} current="S2・S3 DPS比較" />
      <header className="page-intro"><h1 id="surtr-skill-comparison-title">S2・S3 DPS比較</h1></header>
    </div>
    <CollapsibleCalculatorPanel id="surtr-skill-comparison-settings" number="01" title="比較条件"
      summary={`S2 ${label2}・S3 ${label3}・潜在${settings.potential}・敵${state.enemyCount}${state.enemyCount === 4 ? '体以上' : '体'}`} collapsedLabel="比較条件を表示">
      {!record2 || !record3 ? status : <>
        <div className="surtr-s3-fields surtr-skill-comparison-fields">
          <label className="calculator-field"><span>レベル（昇進2）</span><input aria-label="レベル（昇進2）" type="number" min={1} max={maximumLevel} step={1} value={settings.level}
            onChange={event => update('level', Math.max(1, Math.min(maximumLevel, Math.trunc(Number(event.target.value)) || 1)))} /></label>
          <label className="calculator-field"><span>信頼度</span><input aria-label="信頼度" type="number" min={0} max={100} step={1} value={settings.trust}
            onChange={event => update('trust', Math.max(0, Math.min(100, Math.trunc(Number(event.target.value)) || 0)))} /></label>
          <label className="calculator-field"><span>潜在</span><select aria-label="潜在" value={settings.potential} onChange={event => update('potential', Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map(potential => <option key={potential} value={potential}>潜在{potential}</option>)}</select></label>
          <label className="calculator-field"><span>S2 スキルレベル</span><select aria-label="S2 スキルレベル" value={s2LevelIndex} onChange={event => setState(previous => ({ ...previous, s2LevelIndex: Number(event.target.value) }))}>
            {record2.skillLevels.map((_, index) => <option key={index} value={index}>{getSkillLevelLabel(index, record2.skillLevels.length)}</option>)}</select></label>
          <label className="calculator-field"><span>S3 スキルレベル</span><select aria-label="S3 スキルレベル" value={settings.skillLevelIndex} onChange={event => update('skillLevelIndex', Number(event.target.value))}>
            {record3.skillLevels.map((_, index) => <option key={index} value={index}>{getSkillLevelLabel(index, record3.skillLevels.length)}</option>)}</select></label>
          <label className="calculator-field"><span>攻撃範囲内の敵数</span><select aria-label="攻撃範囲内の敵数" value={state.enemyCount} onChange={event => setState(previous => ({ ...previous, enemyCount: Number(event.target.value) }))}>
            {[1, 2, 3, 4].map(count => <option key={count} value={count}>{count}{count === 4 ? '体以上' : '体'}</option>)}</select></label>
        </div>
        <SurtrComparisonPresetControls choices={choices} excluded={state.excluded} moduleLevels={state.moduleLevels}
          onApply={selection => setState(previous => applySurtrComparisonPreset(previous, selection, choices))} />
        <SurtrModuleStageSelection choices={choices} excluded={state.excluded} moduleLevels={state.moduleLevels} onToggleLevel={toggleLevel}
          onToggleNone={checked => setState(previous => ({ ...previous, excluded: checked ? previous.excluded.filter(id => id !== '') : [...new Set([...previous.excluded, ''])] }))} />
        <div className="surtr-s3-fields surtr-skill-comparison-fields">
          <label className="calculator-field"><span>ブロック状態</span><select aria-label="ブロック状態" value={settings.blocking ? 'blocked' : 'free'} onChange={event => update('blocking', event.target.value === 'blocked')}>
            <option value="free">未ブロック</option><option value="blocked">対象1体を自身でブロック</option></select></label>
          <label className="calculator-field"><span>素質2「余燼」</span><select aria-label="素質2「余燼」" value={settings.remnantActive ? 'active' : 'inactive'} onChange={event => update('remnantActive', event.target.value === 'active')}>
            <option value="inactive">発動前</option><option value="active">発動中</option></select></label>
        </div>
        <details className="surtr-s3-assumptions"><summary>計算条件</summary>
          <p>両スキルの攻撃範囲内に、同じ術耐性の敵がいる場合のスキル発動中の合計DPSです。S2は最大2体、S3は最大3体（特化3では4体）を攻撃します。S2の単体時倍率は攻撃対象が1体の場合だけ適用します。</p>
          <p>MOD Xの攻撃速度はスルトが誰もブロックしていない場合、MOD Yの術脆弱は自身がブロックしている1体だけに適用します。余燼は両スキルの共通条件です。</p>
          <p>素質・MOD・潜在による補正を反映します。外部バフ、攻撃間隔のフレーム単位の丸め、初撃の時刻は含めません。S2の待機時間を含む平均DPSや、退場までの総ダメージとは異なります。</p>
        </details>
      </>}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-skill-comparison-output" number="02" title="テーブル出力"
      summary={`合計DPS・術耐性${state.resistanceRange.min}〜${state.resistanceRange.max}`} collapsedLabel="テーブルを表示" className="surtr-s3-output-panel">
      <div className="surtr-skill-comparison-resistance">
        <SurtrResistanceStepControl step={state.barStep} custom={customStep} draft={stepDraft} onChange={barStep => setState(previous => ({ ...previous, barStep }))}
          onCustomChange={setCustomStep} onDraftChange={setStepDraft} errorId="surtr-skill-comparison-step-error" />
        <div className="surtr-s3-resistance-bounds">
          {(['min', 'max'] as const).map(bound => <label className="calculator-field" key={bound}><span>術耐性の{bound === 'min' ? '開始' : '終了'}</span>
            <input aria-label={`術耐性の${bound === 'min' ? '開始' : '終了'}`} type="number" min={0} max={100} step={1} value={rangeDraft[bound]}
              aria-invalid={!!rangeError} aria-describedby={rangeError ? 'surtr-skill-comparison-range-error' : undefined} onChange={event => updateRange(bound, event.target.value)} /></label>)}
        </div>
      </div>
      {!!rangeError && <p className="surtr-s3-axis-error" id="surtr-skill-comparison-range-error" role="alert">{rangeError}</p>}
      {!!stepError && <p className="surtr-s3-axis-error" id="surtr-skill-comparison-step-error" role="alert">{stepError}</p>}
      {!record2 || !record3 ? status : <>
        {!stages.length ? <p className="surtr-s3-status" role="status">比較するMOD・段階を選択してください。</p>
          : !series ? <p role="alert">比較条件の計算に必要なデータを取得できませんでした。</p>
          : !resistances.length && !rangeError && !stepError ? <p role="status">指定した範囲に表示する術耐性がありません。</p> : null}
        <div hidden={!!rangeError || !!stepError || !series || !stages.length || !resistances.length}>
          <SurtrSkillComparisonTableOutput series={series ?? []} resistances={resistances} metadata={metadata} onOpenDetail={openDetail} />
        </div>
      </>}
    </CollapsibleCalculatorPanel>
    {detail && <SurtrSkillComparisonDetail snapshot={detail} onClose={() => setDetail(null)} />}
  </section>
}
