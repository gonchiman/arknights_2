import { useId, useMemo, useState } from 'react'
import type { SkillRecord } from '../types/skill'
import { buildOperatorDatabaseRecords } from '../lib/operatorDatabase'
import { BASIC_OPERATOR_PCA_METRICS, runOperatorPca, type OperatorPcaPoint, type OperatorPcaResult } from '../lib/operatorPca'
import { AnalysisTabPanel, AnalysisTabs } from './AnalysisTabs'
import { OperatorPcaScatter } from './OperatorPcaCharts'
import './DamageCalculator.css'
import './OperatorPcaPage.css'

const TABS = [['distribution', '分布'], ['components', '主成分'], ['scores', '得点']] as const
const STAT_LABELS = BASIC_OPERATOR_PCA_METRICS.map(metric => metric.label)
const DEFAULT_OPERATOR = 'char_136_hsguma'
const TABLE_CLASS = 'operator-pca-coefficients operator-pca-four-table'
const number = new Intl.NumberFormat('ja-JP')
const percent = new Intl.NumberFormat('ja-JP', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const signed = new Intl.NumberFormat('ja-JP', { signDisplay: 'exceptZero', minimumFractionDigits: 3, maximumFractionDigits: 3 })

export function OperatorPcaFourStatsPage({ rows, loading }: { rows: SkillRecord[]; loading: boolean }) {
  const id = useId()
  const [tab, setTab] = useState<typeof TABS[number][0]>('distribution')
  const [operatorId, setOperatorId] = useState(DEFAULT_OPERATOR)
  const analysis = useMemo(() => {
    if (loading) return null
    const records = buildOperatorDatabaseRecords(rows)
    if (records.length === 0) return { error: '分析対象のオペレーターがありません。' } as const
    try {
      const result = runOperatorPca(records, BASIC_OPERATOR_PCA_METRICS)
      const options = [...result.points].sort((a, b) => a.operator.name.localeCompare(b.operator.name, 'ja'))
      return { result, options } as const
    } catch (error) {
      return { error: error instanceof Error ? error.message : '主成分分析を計算できませんでした。' } as const
    }
  }, [loading, rows])

  return <section className="calculator-page operator-pca-page operator-pca-four-page">
    <header className="page-intro"><h1>オペレーター主成分分析２</h1></header>
    <div className="operator-pca-condition">最終昇進・最大Lv／信頼100／潜在・MOD補正なし</div>
    {analysis === null ? <p className="calculator-loading" role="status">読み込み中…</p>
      : 'error' in analysis ? <p className="operator-pca-error" role="alert">{analysis.error}</p>
        : <>
          <div className="operator-pca-condition">
            分析対象 {analysis.result.points.length}名 · {STAT_LABELS.join('・')}
            {analysis.result.excludedCount > 0 && ` · 欠損除外 ${analysis.result.excludedCount}名`}
          </div>
          <AnalysisTabs tabs={TABS} activeTab={tab} onChange={setTab} idPrefix={id} label="主成分分析の表示" />
          <OperatorPcaFourStatsResults id={id} tab={tab} analysis={analysis.result}
            options={analysis.options} operatorId={operatorId} onOperatorChange={setOperatorId} />
        </>}
  </section>
}

function OperatorPcaFourStatsResults({ id, tab, analysis, options, operatorId, onOperatorChange }: {
  id: string
  tab: typeof TABS[number][0]
  analysis: OperatorPcaResult
  options: readonly OperatorPcaPoint[]
  operatorId: string
  onOperatorChange: (id: string) => void
}) {
  const selected = options.find(point => point.operator.operatorId === operatorId) ?? options[0]
  const { explainedVariance, coefficients } = analysis.fit
  let total = 0
  const cumulative = explainedVariance.map(value => total += value)
  const presentedAxes = explainedVariance.length > 1 ? 2 : 1
  const chartVariance = presentedAxes === 2 ? '第1・第2主成分の累積寄与率' : '第1主成分の寄与率'

  return <>
    {tab !== 'components' && <label className="operator-pca-four-operator">
      <span>オペレーター</span>
      <select className="operator-pca-component-picker" value={selected.operator.operatorId}
        onChange={event => onOperatorChange(event.target.value)}>
        {options.map(({ operator }) => <option key={operator.operatorId} value={operator.operatorId}>{operator.name}</option>)}
      </select>
    </label>}
    <AnalysisTabPanel idPrefix={id} tab="distribution" activeTab={tab} title="ステータスの分布"
      headerActions={<span className="operator-pca-four-variance">{chartVariance} {percent.format(cumulative[presentedAxes - 1])}</span>}>
      <div className="analysis-panel-body">
        <OperatorPcaScatter points={analysis.points} selectedId={selected.operator.operatorId} />
        <div className="operator-pca-four-selection"><i aria-hidden="true" />{selected.operator.name}</div>
      </div>
    </AnalysisTabPanel>
    <AnalysisTabPanel idPrefix={id} tab="components" activeTab={tab} title="寄与率と係数">
      <div className="analysis-panel-body">
        <table className={`${TABLE_CLASS} operator-pca-four-matrix`} aria-label="各主成分の寄与率と係数">
          <thead><tr><th scope="col">項目</th>{coefficients.map((_, index) =>
            <th key={index} scope="col" aria-label={`第${index + 1}主成分`}>第{index + 1}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">寄与率</th>{explainedVariance.map((value, index) => <td key={index}>{percent.format(value)}</td>)}</tr>
            <tr><th scope="row">累積寄与率</th>{cumulative.map((value, index) => <td key={index}>{percent.format(value)}</td>)}</tr>
            {BASIC_OPERATOR_PCA_METRICS.map(({ key, label }, stat) => <tr key={key}>
              <th scope="row">{label}</th>{coefficients.map((component, index) => <td key={index}>{signed.format(component[stat])}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </AnalysisTabPanel>
    <AnalysisTabPanel idPrefix={id} tab="scores" activeTab={tab} title={selected.operator.name}
      headerActions={<span className="operator-pca-four-variance">
        {selected.operator.professionLabel} · {selected.operator.subProfessionName} · ★{selected.operator.rarity}
      </span>}>
      <div className="analysis-panel-body operator-pca-four-scores">
        <section aria-labelledby={`${id}-scores`}>
          <h3 id={`${id}-scores`}>主成分得点</h3>
          <table className={TABLE_CLASS} aria-labelledby={`${id}-scores`}>
            <thead><tr><th scope="col">主成分</th><th scope="col">得点</th></tr></thead>
            <tbody>{selected.scores.map((value, index) => <tr key={index}>
              <th scope="row">第{index + 1}主成分</th><td>{signed.format(value)}</td>
            </tr>)}</tbody>
          </table>
        </section>
        <section aria-labelledby={`${id}-stats`}>
          <h3 id={`${id}-stats`}>基礎ステータス</h3>
          <table className={TABLE_CLASS} aria-labelledby={`${id}-stats`}>
            <thead><tr><th scope="col">ステータス</th><th scope="col">基礎値</th></tr></thead>
            <tbody>{BASIC_OPERATOR_PCA_METRICS.map(({ key, label }, index) => <tr key={key}>
              <th scope="row">{label}</th><td>{number.format(selected.values[index])}</td>
            </tr>)}</tbody>
          </table>
        </section>
      </div>
    </AnalysisTabPanel>
  </>
}
