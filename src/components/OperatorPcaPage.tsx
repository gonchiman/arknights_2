import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SkillRecord } from '../types/skill'
import { buildOperatorDatabaseRecords, EMPTY_OPERATOR_DATABASE_FILTERS, filterOperatorDatabaseRecords } from '../lib/operatorDatabase'
import { getProfessionLabel, PROFESSION_ORDER } from '../lib/operatorFilters'
import { buildSubProfessionOptions } from '../lib/operatorSearchFilters'
import { findOperatorPcaNeighbors, OPERATOR_PCA_METRICS, runOperatorPca } from '../lib/operatorPca'
import { AnalysisTabPanel, AnalysisTabs } from './AnalysisTabs'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import { OperatorPcaCoefficients, OperatorPcaScatter, OperatorPcaVariance } from './OperatorPcaCharts'
import { OperatorPcaScoreTable } from './OperatorPcaScoreTable'
import './DamageCalculator.css'
import './OperatorPcaPage.css'

interface Props { rows: SkillRecord[]; loading: boolean; onOpenOperatorDetail?: OpenOperatorDetail }
const TABS = [['distribution', '分布'], ['components', '主成分'], ['scores', '得点']] as const
type Tab = typeof TABS[number][0]
const percent = (value: number) => `${(value * 100).toFixed(1)}%`
const signed = (value: number) => Math.abs(value) < 0.0005 ? '0.000' : `${value > 0 ? '+' : ''}${value.toFixed(3)}`
const number = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })

function featureDirection(key: typeof OPERATOR_PCA_METRICS[number]['key'], coefficient: number) {
  if (key === 'blockCount') return coefficient > 0 ? '多い' : '少ない'
  if (key === 'redeployTime' || key === 'attackInterval') return coefficient > 0 ? '長い' : '短い'
  return coefficient > 0 ? '高い' : '低い'
}

function OperatorPcaFilters({ profession, subProfession, professions, subProfessions, onProfessionChange, onSubProfessionChange, children }: {
  profession: string
  subProfession: string
  professions: readonly string[]
  subProfessions: readonly { value: string; label: string }[]
  onProfessionChange: (value: string) => void
  onSubProfessionChange: (value: string) => void
  children?: ReactNode
}) {
  return <div className={`operator-pca-filters${children ? '' : ' operator-pca-score-filters'}`}>
    <label><span>職業</span><select value={profession} onChange={event => onProfessionChange(event.target.value)}>
      <option value="ALL">すべて</option>
      {professions.map(value => <option key={value} value={value}>{getProfessionLabel(value)}</option>)}
    </select></label>
    <label><span>職分</span><select value={subProfession} onChange={event => onSubProfessionChange(event.target.value)}>
      <option value="ALL">すべて</option>
      {subProfessions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>
    {children}
  </div>
}

export function OperatorPcaPage({ rows, loading, onOpenOperatorDetail }: Props) {
  const id = useId()
  const [tab, setTab] = useState<Tab>('distribution')
  const [profession, setProfession] = useState('ALL')
  const [subProfession, setSubProfession] = useState('ALL')
  const [selectedId, setSelectedId] = useState('char_350_surtr')
  const [selectedComponent, setSelectedComponent] = useState(0)
  const [scorePage, setScorePage] = useState(0)
  const selectedHeading = useRef<HTMLHeadingElement>(null)
  const records = useMemo(() => buildOperatorDatabaseRecords(rows), [rows])
  // Display filters never change the fitted population or the standardization.
  const analysis = useMemo(() => {
    try { return { result: runOperatorPca(records), error: '' } }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : '主成分分析を計算できませんでした。' } }
  }, [records])
  const { result } = analysis
  const points = useMemo(() => {
    const visibleIds = new Set(filterOperatorDatabaseRecords(records, {
      ...EMPTY_OPERATOR_DATABASE_FILTERS, profession, subProfession,
    }).map(record => record.operatorId))
    return (result?.points ?? []).filter(point => visibleIds.has(point.operator.operatorId))
      .sort((a, b) => a.operator.name.localeCompare(b.operator.name, 'ja'))
  }, [records, result, profession, subProfession])
  const selected = points.find(point => point.operator.operatorId === selectedId) ?? points[0]
  const neighbors = useMemo(() => selected
    ? findOperatorPcaNeighbors(points, selected.operator.operatorId)
    : [], [points, selected])
  const subProfessions = useMemo(() => buildSubProfessionOptions(rows, profession), [rows, profession])
  const professions = PROFESSION_ORDER.filter(value => records.some(record => record.profession === value))
  const variance = result?.fit.explainedVariance ?? []
  const totalVariance = (variance[0] ?? 0) + (variance[1] ?? 0)
  const count = result?.points.length ?? 0
  const component = Math.min(selectedComponent, Math.max(0, variance.length - 1))
  const coefficients = result?.fit.coefficients[component] ?? []
  const features = OPERATOR_PCA_METRICS.map((metric, index) => ({ metric, coefficient: coefficients[index] ?? 0, index }))
    .filter(feature => Math.abs(feature.coefficient) > 1e-12)
    .sort((left, right) => Math.abs(right.coefficient) - Math.abs(left.coefficient) || left.index - right.index)
    .slice(0, 3)

  function changeProfession(value: string) {
    setProfession(value)
    setSubProfession('ALL')
    setScorePage(0)
  }

  function changeSubProfession(value: string) {
    setSubProfession(value)
    setScorePage(0)
  }

  const displayFilters = { profession, subProfession, professions, subProfessions,
    onProfessionChange: changeProfession, onSubProfessionChange: changeSubProfession }

  return <section className="calculator-page operator-pca-page">
    <header className="page-intro"><h1>オペレーター主成分分析</h1></header>
    <div className="operator-pca-condition">最終昇進・最大Lv／信頼100／潜在・MOD補正なし</div>
    <AnalysisTabs tabs={TABS} activeTab={tab} onChange={setTab} idPrefix={id} label="主成分分析の表示" />
    {loading ? <p className="calculator-loading" role="status">読み込み中…</p>
      : !result ? <p className="operator-pca-error" role="alert">{records.length === 0 ? '分析対象のオペレーターがありません。' : analysis.error}</p>
        : <>
          <AnalysisTabPanel idPrefix={id} tab="distribution" activeTab={tab} title="ステータスの分布">
            <div className="analysis-panel-body">
              <OperatorPcaFilters {...displayFilters}>
                <label className="operator-pca-operator-field"><span>オペレーター</span><select value={selected?.operator.operatorId ?? ''}
                  disabled={points.length === 0} onChange={event => setSelectedId(event.target.value)}>
                  {points.length === 0 && <option value="">該当なし</option>}
                  {points.map(({ operator }) => <option key={operator.operatorId} value={operator.operatorId}>{operator.name}</option>)}
                </select></label>
              </OperatorPcaFilters>
              <div className="operator-pca-chart-heading"><span>第1・第2主成分 · 寄与率 {percent(totalVariance)}</span>
                <span>表示 {points.length} / {count}名</span></div>
              {selected ? <>
                <OperatorPcaScatter points={points} selectedId={selected.operator.operatorId}
                  neighborIds={neighbors.map(({ point }) => point.operator.operatorId)} onSelect={setSelectedId} />
                <section className="operator-pca-selection" aria-label="選択したオペレーター">
                  <div className="operator-pca-selection-heading">
                    <div><h3 ref={selectedHeading} tabIndex={-1} aria-live="polite" aria-atomic="true">{selected.operator.name}</h3>
                      <span>{selected.operator.professionLabel} · {selected.operator.subProfessionName} · ★{selected.operator.rarity}</span></div>
                    <OperatorDetailLink className="button secondary" operatorId={selected.operator.operatorId}
                      onOpenOperatorDetail={onOpenOperatorDetail} aria-label={`${selected.operator.name}の詳細`}>詳細</OperatorDetailLink>
                  </div>
                  <dl className="operator-pca-selected-stats">
                    {OPERATOR_PCA_METRICS.slice(0, 4).map(metric => <div key={metric.key}>
                      <dt>{metric.label}</dt><dd>{number.format(selected.operator.stats[metric.key]!)}</dd>
                    </div>)}
                  </dl>
                  <div className="operator-pca-neighbors"><h3>近いステータス</h3>
                    <div>{neighbors.length === 0 ? <span>該当なし</span> : neighbors.map(({ point }) => <button type="button" className="button secondary"
                      key={point.operator.operatorId} onClick={event => {
                        setSelectedId(point.operator.operatorId)
                        // The chosen neighbor leaves this list; preserve keyboard focus on the selection.
                        if (event.detail === 0) requestAnimationFrame(() => selectedHeading.current?.focus({ preventScroll: true }))
                      }}>{point.operator.name}</button>)}</div>
                  </div>
                </section>
              </> : <p className="operator-pca-empty" role="status">該当するオペレーターがいません。</p>}
              <div className="operator-pca-data-state">分析対象 {count}名 · 標準化{result.fit.activeColumns.length}項目
                {result.excludedCount > 0 && ` · 欠損除外 ${result.excludedCount}名`}</div>
            </div>
          </AnalysisTabPanel>
          <AnalysisTabPanel idPrefix={id} tab="components" activeTab={tab} title="主成分の内訳">
            <div className="analysis-panel-body">
              <div className="operator-pca-component-grid">
                <div className="operator-pca-component-overview">
                  <section aria-labelledby={`${id}-variance-title`}>
                    <div className="operator-pca-component-heading"><h3 id={`${id}-variance-title`}>寄与率</h3></div>
                    <OperatorPcaVariance values={variance} />
                    <div className="operator-pca-cumulative"><span>第1＋第2主成分</span><strong>{percent(totalVariance)}</strong></div>
                  </section>
                  <section className="operator-pca-component-profile" aria-labelledby={`${id}-component-title`}>
                    <div className="operator-pca-component-heading">
                      <h3 id={`${id}-component-title`}>ステータス</h3>
                      <select className="operator-pca-component-picker" aria-label="ステータスを表示する主成分"
                        value={component} onChange={event => setSelectedComponent(Number(event.target.value))}>
                        {result.fit.coefficients.map((_, index) => <option key={index} value={index}>第{index + 1}主成分</option>)}
                      </select>
                    </div>
                    <div className="operator-pca-feature-summary" aria-live="polite" aria-atomic="true">
                      <span>＋側</span>
                      <ul className="operator-pca-component-features">
                        {features.map(({ metric, coefficient }) => <li key={metric.key}>
                          <span>{metric.label}</span><strong>{featureDirection(metric.key, coefficient)}</strong>
                        </li>)}
                      </ul>
                    </div>
                    <OperatorPcaCoefficients coefficients={coefficients} allCoefficients={result.fit.coefficients} component={component} />
                  </section>
                </div>
                <section aria-labelledby={`${id}-coefficients-title`}><h3 id={`${id}-coefficients-title`}>全成分の係数</h3>
                  <div className="operator-pca-table-scroll" tabIndex={0} role="region" aria-label="主成分係数の表">
                    <table className="operator-pca-coefficients"><thead><tr><th scope="col">項目</th>
                      {result.fit.coefficients.map((_, index) => <th key={index} scope="col" className={index === component ? 'selected-component' : undefined}>第{index + 1}主成分</th>)}
                    </tr></thead>
                      <tbody>{OPERATOR_PCA_METRICS.map((metric, index) => <tr key={metric.key}><th scope="row">{metric.label}</th>
                        {result.fit.coefficients.map((values, column) => <td key={column} className={column === component ? 'selected-component' : undefined}>{signed(values[index])}</td>)}
                      </tr>)}</tbody>
                    </table>
                  </div>
                </section>
              </div>
              <div className="operator-pca-method">
                <span>分析対象 {count}名</span><span>{result.fit.activeColumns.length}項目</span><span>平均0・標準偏差1</span>
                {result.excludedCount > 0 && <span>欠損除外 {result.excludedCount}名</span>}
                {result.fit.constantColumns.length > 0 && <span>定数項目 {result.fit.constantColumns.map(index => OPERATOR_PCA_METRICS[index].label).join('・')}</span>}
              </div>
            </div>
          </AnalysisTabPanel>
          <AnalysisTabPanel idPrefix={id} tab="scores" activeTab={tab} title="主成分得点">
            <div className="analysis-panel-body">
              <OperatorPcaFilters {...displayFilters} />
              <div className="operator-pca-score-count" aria-live="polite">表示 {points.length} / {count}名</div>
              <OperatorPcaScoreTable points={points} componentCount={result.fit.coefficients.length}
                page={scorePage} onPageChange={setScorePage} onOpenOperatorDetail={onOpenOperatorDetail} />
            </div>
          </AnalysisTabPanel>
        </>}
  </section>
}
