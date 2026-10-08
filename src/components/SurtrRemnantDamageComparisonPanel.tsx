import { useMemo, useState, type ReactNode } from 'react'
import type { SkillRecord } from '../types/skill'
import { deriveSurtrDpsModel, type SurtrDpsSettings } from '../lib/surtrDps'
import type { SelectedSurtrModuleStage } from '../lib/surtrModuleComparison'
import { getSurtrModuleChoices, getSelectedSurtrModuleStages } from '../lib/surtrModuleComparison'
import { deriveSurtrRemnantAttackModel, type SurtrRemnantAttackAssumptions } from '../lib/surtrRemnantAttacks'
import { calculateSurtrRemnantAttackExpectation, calculateSurtrRemnantExpectedDamage,
  type SurtrRemnantAttackExpectation, type SurtrRemnantExpectedDamageResult } from '../lib/surtrRemnantExpectation'
import { buildSurtrRemnantDamageComparison } from '../lib/surtrRemnantDamageComparison'
import { getSurtrDpsResistanceSamples } from '../lib/surtrDpsResistance'
import { buildSurtrUnequippedComparisonSeries, formatSurtrUnequippedComparisonValue, getSurtrPreviousStageId,
  type SurtrUnequippedComparisonBase, type SurtrUnequippedMetric } from '../lib/surtrUnequippedComparison'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { HelpPopover } from './HelpPopover'
import { SurtrModuleComparisonTableControls, type SurtrModuleComparisonTableOptions } from './SurtrModuleComparisonTableControls'
import { SurtrUnequippedComparisonTable } from './SurtrUnequippedComparisonTable'
import './GoldenglowGuidePage.css'
import './GoldenglowExplosionDamageModal.css'
import './SurtrDpsDetailModal.css'

interface DetailEntry {
  id: string
  label: string
  color: string
  duration: number
  intervalBefore: number
  intervalAfter: number
  expectation: SurtrRemnantAttackExpectation
  result: SurtrRemnantExpectedDamageResult
  value: number | null
  baseline?: { label: string; result: SurtrRemnantExpectedDamageResult }
}

export interface SurtrRemnantDamageComparisonDetailSnapshot {
  resistance: number
  series: DetailEntry[]
  initialSeriesId: string
  metric: SurtrUnequippedMetric | 'total'
  comparisonBase: SurtrUnequippedComparisonBase
  precision: number
  conditions: string
}

const number = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 }).format(value)

export function SurtrRemnantDamageComparisonDetail({ snapshot, onClose }: {
  snapshot: SurtrRemnantDamageComparisonDetailSnapshot; onClose: () => void
}) {
  const [selectedId, setSelectedId] = useState(snapshot.initialSeriesId)
  const selected = snapshot.series.find(item => item.id === selectedId) ?? snapshot.series[0]
  if (!selected) return null
  const { result, baseline } = selected
  const rows = [
    { label: '余燼の効果時間', formula: selected.label, result: `${number(selected.duration)} 秒` },
    { label: '発動前の攻撃間隔', formula: 'この範囲の残りCTを一様と仮定', result: `${number(selected.intervalBefore)} 秒` },
    { label: '発動後の攻撃間隔', formula: selected.label, result: `${number(selected.intervalAfter)} 秒` },
    { label: '期待命中回数', formula: selected.expectation.probabilities.map(entry => `${entry.hitCount} × ${number(entry.probability)}`).join(' + '),
      result: `${number(result.expectedHitCount)} 回` },
    { label: '1回のダメージ', formula: `術耐性 ${snapshot.resistance}・同じブロック条件で計算`, result: number(result.perHit) },
    { label: '総ダメージ期待値', formula: `${number(result.expectedHitCount)} × ${number(result.perHit)}`, result: number(result.totalDamage) },
    ...(snapshot.metric !== 'total' && baseline ? [
      { label: `基準：${baseline.label}`, formula: `${number(baseline.result.expectedHitCount)} 回 × ${number(baseline.result.perHit)}`, result: number(baseline.result.totalDamage) },
      { label: snapshot.metric === 'difference' ? '基準とのダメージ差' : snapshot.metric === 'ratio' ? '基準に対する比率' : '基準からの増加率',
        formula: snapshot.metric === 'difference' ? `${number(result.totalDamage)} − ${number(baseline.result.totalDamage)}`
          : baseline.result.totalDamage === 0 ? '基準の総ダメージ期待値が0のため算出できません'
          : snapshot.metric === 'ratio' ? `${number(result.totalDamage)} ÷ ${number(baseline.result.totalDamage)} × 100`
          : `(${number(result.totalDamage)} ÷ ${number(baseline.result.totalDamage)} − 1) × 100`,
        result: selected.value === null ? '—' : `${number(selected.value)}${snapshot.metric === 'difference' ? '' : '%'}` },
    ] : []),
  ]
  const displayed = snapshot.metric === 'total'
    ? new Intl.NumberFormat('ja-JP', { minimumFractionDigits: snapshot.precision, maximumFractionDigits: snapshot.precision }).format(Number(result.totalDamage.toFixed(snapshot.precision)))
    : formatSurtrUnequippedComparisonValue(selected.value, snapshot.metric, snapshot.precision)
  return <GoldenglowDetailModal title={`術耐性 ${snapshot.resistance}の期待総ダメージ計算`} closeLabel="期待総ダメージ計算を閉じる"
    onClose={onClose} closeOnContextMenu className="surtr-dps-detail">
    <p className="surtr-dps-detail-conditions">{snapshot.conditions}</p>
    <div className="surtr-dps-detail-modules" role="group" aria-label="期待値計算を確認するMOD">
      {snapshot.series.map(item => <button key={item.id} type="button" aria-pressed={item.id === selected.id} onClick={() => setSelectedId(item.id)}>
        <i style={{ backgroundColor: item.color }} aria-hidden="true" />{item.label}
      </button>)}
    </div>
    <div className="gg-damage-detail-table-wrap" tabIndex={0} role="region" aria-label={`${selected.label}の期待値計算フロー`}>
      <table className="gg-probability-table gg-damage-detail-table">
        <thead><tr><th scope="col">計算内容</th><th scope="col">式</th><th scope="col">結果</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.formula}</td><td>{row.result}</td></tr>)}
          <tr className="surtr-dps-detail-result"><th scope="row">表の表示</th><td>小数点以下{snapshot.precision}桁に丸める</td><td>{displayed}</td></tr>
        </tbody>
      </table>
    </div>
    <details className="surtr-dps-detail-notes"><summary>計算・表示について</summary>
      <p>残りCTは各MODの発動前の攻撃間隔の範囲で一様と仮定します。命中回数ごとの区間の長さを確率として期待値を計算します。各段階で期待命中回数と1回のダメージを計算して比較します。途中の表示は小数点以下6桁までですが、計算には丸める前の値を使います。</p>
    </details>
  </GoldenglowDetailModal>
}

export function SurtrRemnantDamageComparisonPanel({ record, settings, selectedStages, assumptions, status }: {
  record: SkillRecord | undefined
  settings: SurtrDpsSettings
  selectedStages: readonly SelectedSurtrModuleStage[]
  assumptions: SurtrRemnantAttackAssumptions
  status: ReactNode
}) {
  const [options, setOptions] = useState<SurtrModuleComparisonTableOptions>({
    comparisonBase: 'unequipped', layout: 'combined', columnOrder: 'module', metric: 'difference',
    step: 10, customStep: false, stepDraft: '10', rankMode: 'none', precision: 0, colorScale: 'NONE',
  })
  const [selectedResistance, setSelectedResistance] = useState<number | null>(null)
  const [detail, setDetail] = useState<SurtrRemnantDamageComparisonDetailSnapshot | null>(null)
  const resistances = useMemo(() => getSurtrDpsResistanceSamples(options.step, { min: 0, max: 100 }), [options.step])
  const data = useMemo(() => record ? buildSurtrRemnantDamageComparison(record, settings, selectedStages, assumptions,
    options.comparisonBase, resistances) : null, [record, settings, selectedStages, assumptions, options.comparisonBase, resistances])
  const skillLabel = settings.skillLevelIndex < 7 ? `ランク${settings.skillLevelIndex + 1}` : `特化${settings.skillLevelIndex - 6}`
  const baseLabel = options.comparisonBase === 'previous' ? '前段階' : '未装備'
  const openDetail = (resistance: number, requestedId?: string, metric: SurtrUnequippedMetric | 'total' = options.metric, requestedBlocking = settings.blocking) => {
    if (!record || !data) return
    const group = data.blockingComparison.find(item => item.blocking === requestedBlocking)
    if (!group) return
    const none = getSelectedSurtrModuleStages(getSurtrModuleChoices(record.operatorProfile, settings.level).filter(item => item.id === ''))[0]
    const stages = [...(options.comparisonBase === 'unequipped' && none ? [none] : []), ...selectedStages.filter(item => item.id !== 'none')]
    const values = buildSurtrUnequippedComparisonSeries(group.series, group.baseline, metric === 'total' ? options.metric : metric,
      options.comparisonBase, group.referenceSeries)
    const derive = (stage: SelectedSurtrModuleStage) => {
      const conditionSettings = { ...settings, blocking: requestedBlocking }
      const model = deriveSurtrRemnantAttackModel(record, conditionSettings, stage.moduleId, stage.level)
      const dps = deriveSurtrDpsModel(record, conditionSettings, stage.moduleId, stage.level)
      const expectation = model ? calculateSurtrRemnantAttackExpectation(model, assumptions) : null
      const result = model && dps ? calculateSurtrRemnantExpectedDamage(dps, model, resistance, assumptions) : null
      return model && expectation && result ? { model, expectation, result } : null
    }
    const entries = stages.flatMap(stage => {
      const calculation = derive(stage)
      if (!calculation) return []
      const previousId = getSurtrPreviousStageId(stage.id)
      const referenceStage = options.comparisonBase === 'unequipped' || previousId === 'none' ? none
        : previousId ? { ...stage, id: previousId, level: stage.level - 1, label: stage.label.replace(/Lv\.\d+$/, `Lv.${stage.level - 1}`) } : undefined
      const reference = referenceStage ? derive(referenceStage) : null
      const value = metric === 'total' ? calculation.result.totalDamage : stage.id === 'none'
        ? metric === 'ratio' ? calculation.result.totalDamage === 0 ? null : 100 : metric === 'percent' && calculation.result.totalDamage === 0 ? null : 0
        : values.find(item => item.id === stage.id)?.points.find(point => point.x === resistance)?.value ?? null
      return [{ id: stage.id, label: stage.label, color: stage.color, duration: calculation.model.remnantDuration,
        intervalBefore: calculation.model.attackIntervalBefore, intervalAfter: calculation.model.attackIntervalAfter,
        expectation: calculation.expectation, result: calculation.result, value,
        ...(reference && referenceStage ? { baseline: { label: referenceStage.label, result: reference.result } } : {}) }]
    })
    if (!entries.length) return
    setSelectedResistance(resistance)
    setDetail({ resistance, series: entries, initialSeriesId: requestedId ?? entries.find(item => item.id !== 'none')?.id ?? entries[0].id,
      metric, comparisonBase: options.comparisonBase, precision: options.precision,
      conditions: `S3 ${skillLabel}・昇進2 Lv.${settings.level}・信頼度${settings.trust}・潜在${settings.potential}・${requestedBlocking ? '対象を自身でブロック' : '未ブロック'}・残りCT一様・命中まで${assumptions.windup}s・CT${assumptions.ctCarry === 'time' ? '時間' : '割合'}維持・退場同時の命中${assumptions.includeRetreatHit ? 'を含む' : 'を除外'}`,
    })
  }
  return <>
    <CollapsibleCalculatorPanel id="surtr-remnant-damage-comparison" number="05" title="総ダメージ期待値の比較"
      summary={`${baseLabel}との比較・${options.layout === 'combined' ? '期待値＋比較値' : '比較値のみ'}`} collapsedLabel="比較表を表示" className="surtr-s3-output-panel"
      headerActions={<SurtrModuleComparisonTableControls quantity="expected-damage" value={options}
        onChange={changes => setOptions(previous => ({ ...previous, ...changes }))} stepErrorId="surtr-remnant-comparison-step-error" />}>
      {status || (!selectedStages.some(item => item.id !== 'none') ? <p className="surtr-s3-status" role="status">比較するMOD・段階を選択してください。</p>
        : !data ? <p role="alert">総ダメージ期待値の比較に必要なデータを取得できませんでした。</p>
        : <>
          <div className="surtr-s3-result-heading"><h3>総ダメージ期待値</h3>
            <HelpPopover label="総ダメージ期待値の比較の計算条件">残りCTを各MODの発動前の攻撃間隔の範囲で一様と仮定し、期待命中回数×1回のダメージで計算します。パネル1の潜在と計算の前提・仮定を使い、未ブロックと対象を自身でブロックの両条件を比較します。</HelpPopover>
          </div>
          <SurtrUnequippedComparisonTable {...data} resistances={resistances} precision={options.precision} quantity="expected-damage"
            comparisonBase={options.comparisonBase} metric={options.metric} layout={options.layout} columnOrder={options.columnOrder}
            rankMode={options.rankMode} colorScale={options.colorScale !== 'NONE'} colorScaleMode={options.colorScale === 'NONE' ? 'LINEAR' : options.colorScale}
            selectedResistance={selectedResistance} onOpenDetail={openDetail}
            metadata={{ skillLabel, level: settings.level, trust: settings.trust, potential: settings.potential,
              blocking: settings.blocking, remnantAssumptions: assumptions }} />
        </>)}
    </CollapsibleCalculatorPanel>
    {detail && <SurtrRemnantDamageComparisonDetail snapshot={detail} onClose={() => setDetail(null)} />}
  </>
}
