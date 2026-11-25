import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import type { SkillDpsAnalysisDataset, SkillDpsAnalysisMetric } from '../lib/skillDpsAnalysis'
import {
  evaluateSkillDpsPredictorCombinations, SKILL_DPS_REGRESSION_PREDICTORS,
  type SkillDpsCombinationModel, type SkillDpsRegressionPredictor,
} from '../lib/skillDpsMultipleRegression'
import { SkillDpsCombinationVifDialog } from './SkillDpsCombinationVifDialog'
import { SkillDpsVifCell } from './SkillDpsVifCell'
import { TableSortHeader, type TableSort } from './TableSortHeader'
import './SkillDpsCombinationEvaluation.css'

const COUNT = new Intl.NumberFormat('ja-JP')
const PERCENTAGE = new Intl.NumberFormat('ja-JP', {
  style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
})
const PAGE_SIZE = 8
type SortKey = 'adjusted' | 'vif'
const predictorLabel = (predictor: SkillDpsRegressionPredictor) => SKILL_DPS_REGRESSION_PREDICTORS.find(([key]) => key === predictor)![1]

export function SkillDpsCombinationEvaluation({ dataset, metric }: {
  dataset: SkillDpsAnalysisDataset
  metric: SkillDpsAnalysisMetric
}) {
  const statusId = useId()
  const tableRegion = useRef<HTMLDivElement>(null)
  const [detail, setDetail] = useState<{
    model: SkillDpsCombinationModel
    observationCount: number
    trigger: HTMLButtonElement
  } | null>(null)
  const [draft, setDraft] = useState<readonly SkillDpsRegressionPredictor[]>(() => SKILL_DPS_REGRESSION_PREDICTORS.map(([key]) => key))
  const [applied, setApplied] = useState<readonly SkillDpsRegressionPredictor[]>(() => SKILL_DPS_REGRESSION_PREDICTORS.map(([key]) => key))
  const [itemCount, setItemCount] = useState(0)
  const [sort, setSort] = useState<TableSort<SortKey>>({ key: 'adjusted', direction: 'desc' })
  const evaluation = useMemo(() => evaluateSkillDpsPredictorCombinations(dataset, applied, metric), [dataset, applied, metric])
  // Keep the current page only while its evaluated population remains the same.
  const [pagination, setPagination] = useState({ evaluation, page: 0 })
  const pending = draft.join() !== applied.join()
  const canEvaluate = draft.length >= 2
  const filteredModels = useMemo(() => evaluation.models
    .filter(model => itemCount === 0 || model.predictors.length === itemCount)
    .sort((left, right) => {
      const first = sort.key === 'adjusted' ? left.adjustedRSquared : left.maxVif
      const second = sort.key === 'adjusted' ? right.adjustedRSquared : right.maxVif
      return (sort.direction === 'asc' ? first - second : second - first)
        || right.adjustedRSquared - left.adjustedRSquared || left.maxVif - right.maxVif
    }), [evaluation, itemCount, sort])
  const pageCount = Math.max(1, Math.ceil(filteredModels.length / PAGE_SIZE))
  const page = Math.min(pagination.evaluation === evaluation ? pagination.page : 0, pageCount - 1)
  const start = page * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, filteredModels.length)

  function toggleCandidate(predictor: SkillDpsRegressionPredictor) {
    setDraft(current => SKILL_DPS_REGRESSION_PREDICTORS.filter(([key]) => key === predictor
      ? !current.includes(key) : current.includes(key)).map(([key]) => key))
  }

  function evaluate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEvaluate || !pending) return
    setApplied([...draft])
    if (itemCount > draft.length) setItemCount(0)
  }

  function changeSort(key: SortKey) {
    setSort(current => ({ key, direction: current.key === key
      ? current.direction === 'asc' ? 'desc' : 'asc' : key === 'vif' ? 'asc' : 'desc' }))
    setPagination({ evaluation, page: 0 })
  }

  function closeVifDetail() {
    const trigger = detail?.trigger
    setDetail(null)
    window.requestAnimationFrame(() => {
      const focusTarget = trigger?.isConnected ? trigger : tableRegion.current
      focusTarget?.focus({ preventScroll: true })
    })
  }

  return <section className="skill-dps-combination-evaluation" aria-label="組み合わせ評価">
    <form className="skill-dps-regression-form" onSubmit={evaluate}>
      <fieldset className="skill-dps-regression-predictors">
        <legend>候補の説明変数</legend>
        <div>{SKILL_DPS_REGRESSION_PREDICTORS.map(([key, label]) => <label key={key}>
          <input type="checkbox" value={key} checked={draft.includes(key)} onChange={() => toggleCandidate(key)} />
          <span>{label}</span>
        </label>)}</div>
      </fieldset>
      <div className="skill-dps-actions">
        <button className="button" type="submit" disabled={!canEvaluate || !pending} aria-describedby={statusId}>組み合わせを評価</button>
        <span id={statusId} role="status" className={`skill-dps-status${pending ? ' pending' : ''}`}>
          {!canEvaluate ? '2項目以上を選択' : pending ? '未反映' : ''}
        </span>
      </div>
    </form>
    {evaluation.error && <p className="skill-dps-error" role="alert">{evaluation.error}</p>}
    <div className="skill-dps-toolbar skill-dps-combination-toolbar">
      <dl className="skill-dps-statistics" aria-live="polite">
        <div><dt>使用件数</dt><dd>{COUNT.format(evaluation.observationCount)}件</dd></div>
        <div><dt>評価数</dt><dd>{COUNT.format(evaluation.models.length)}通り</dd></div>
        {evaluation.failedCount > 0 && <div><dt>計算不可</dt><dd>{COUNT.format(evaluation.failedCount)}通り</dd></div>}
      </dl>
      <label className="skill-dps-inline-label">項目数
        <select value={itemCount} onChange={event => { setItemCount(Number(event.target.value)); setPagination({ evaluation, page: 0 }) }}>
          <option value={0}>すべて</option>
          {Array.from({ length: Math.max(0, applied.length - 1) }, (_, index) => index + 2)
            .map(count => <option key={count} value={count}>{count}項目</option>)}
        </select>
      </label>
    </div>
    <div ref={tableRegion} className="skill-dps-table-scroll" role="region" tabIndex={0} aria-label="説明変数の組み合わせ評価">
      <table className="skill-dps-table skill-dps-combination-table" aria-label="説明変数の組み合わせ評価">
        <colgroup><col style={{ width: '49%' }} /><col style={{ width: '12%' }} /><col style={{ width: '22%' }} /><col style={{ width: '17%' }} /></colgroup>
        <thead><tr>
          <th scope="col">説明変数の組み合わせ</th>
          <th scope="col">項目数</th>
          <TableSortHeader label="調整済みR²" sortKey="adjusted" sort={sort} onSort={changeSort} ariaLabel="調整済みR²で並べ替え" />
          <TableSortHeader label="最大VIF" sortKey="vif" sort={sort} onSort={changeSort} ariaLabel="最大VIFで並べ替え" />
        </tr></thead>
        <tbody>{filteredModels.length ? filteredModels.slice(start, end).map(model => {
          const modelLabel = model.predictors.map(predictorLabel).join('・')
          return <tr key={model.predictors.join(',')}>
            <th scope="row">{modelLabel}</th>
            <td>{model.predictors.length}</td>
            <td>{PERCENTAGE.format(model.adjustedRSquared)}</td>
            <SkillDpsVifCell value={model.maxVif} detail={{ modelLabel,
              onOpen: trigger => setDetail({ model, observationCount: evaluation.observationCount, trigger }),
            }} />
          </tr>
        }) : <tr><td colSpan={4} className="skill-dps-table-empty">計算可能な組み合わせなし</td></tr>}</tbody>
      </table>
    </div>
    <nav className="skill-dps-combination-pages" aria-label="評価結果のページ">
      <button className="button secondary" type="button" disabled={page === 0} onClick={() => setPagination({ evaluation, page: page - 1 })}>前へ</button>
      <span role="status">{filteredModels.length ? `${COUNT.format(start + 1)}–${COUNT.format(end)} / ${COUNT.format(filteredModels.length)}` : '0件'}</span>
      <button className="button secondary" type="button" disabled={end >= filteredModels.length} onClick={() => setPagination({ evaluation, page: page + 1 })}>次へ</button>
    </nav>
    {detail && <SkillDpsCombinationVifDialog model={detail.model}
      observationCount={detail.observationCount} onClose={closeVifDetail} />}
  </section>
}
