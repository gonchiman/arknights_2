import { useId, useMemo, useState, type FormEvent } from 'react'
import { SKILL_DPS_ANALYSIS_X_LABELS, type SkillDpsAnalysisDataset, type SkillDpsAnalysisMetric } from '../lib/skillDpsAnalysis'
import {
  analyzeSkillDpsMultipleRegression, DEFAULT_SKILL_DPS_REGRESSION_PREDICTORS,
  SKILL_DPS_REGRESSION_PREDICTORS, type SkillDpsRegressionPredictor,
} from '../lib/skillDpsMultipleRegression'
import './SkillDpsMultipleRegression.css'

const COUNT = new Intl.NumberFormat('ja-JP')
const PERCENTAGE = new Intl.NumberFormat('ja-JP', {
  style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
})
const COEFFICIENT = new Intl.NumberFormat('ja-JP', { signDisplay: 'exceptZero', maximumFractionDigits: 3 })
const VIF = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const VIF_WARNING_THRESHOLD = 5

export function SkillDpsMultipleRegression({ dataset, metric }: {
  dataset: SkillDpsAnalysisDataset
  metric: SkillDpsAnalysisMetric
}) {
  const statusId = useId()
  const [draft, setDraft] = useState<readonly SkillDpsRegressionPredictor[]>(() => [...DEFAULT_SKILL_DPS_REGRESSION_PREDICTORS])
  const [applied, setApplied] = useState<readonly SkillDpsRegressionPredictor[]>(() => [...DEFAULT_SKILL_DPS_REGRESSION_PREDICTORS])
  const pending = draft.join() !== applied.join()
  const canFit = draft.length >= 2
  const result = useMemo(() => analyzeSkillDpsMultipleRegression(dataset, applied, metric), [dataset, applied, metric])
  const fit = result.fit

  function togglePredictor(predictor: SkillDpsRegressionPredictor) {
    setDraft(current => SKILL_DPS_REGRESSION_PREDICTORS.filter(([key]) => key === predictor
      ? !current.includes(key) : current.includes(key)).map(([key]) => key))
  }

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canFit && pending) setApplied([...draft])
  }

  return <section className="skill-dps-multiple-regression" aria-label="重回帰分析">
    <form className="skill-dps-regression-form" onSubmit={calculate}>
      <fieldset className="skill-dps-regression-predictors">
        <legend>説明変数</legend>
        <div>
          {SKILL_DPS_REGRESSION_PREDICTORS.map(([key, label]) => <label key={key}>
            <input type="checkbox" value={key} checked={draft.includes(key)} onChange={() => togglePredictor(key)} />
            <span>{label}</span>
          </label>)}
        </div>
      </fieldset>
      <div className="skill-dps-actions">
        <button className="button" type="submit" disabled={!canFit || !pending} aria-describedby={statusId}>回帰を計算</button>
        <span id={statusId} role="status" className={`skill-dps-status${pending ? ' pending' : ''}`}>
          {!canFit ? '2項目以上を選択' : pending ? '未反映' : ''}
        </span>
      </div>
    </form>
    {result.error && <p className="skill-dps-error" role="alert">{result.error}</p>}
    {fit && <div className="skill-dps-regression-result">
      <dl className="skill-dps-statistics">
        <div><dt>使用件数</dt><dd>{COUNT.format(result.observationCount)}</dd></div>
        <div><dt>R²</dt><dd>{PERCENTAGE.format(fit.rSquared)}</dd></div>
        <div><dt>調整済みR²</dt><dd>{PERCENTAGE.format(fit.adjustedRSquared)}</dd></div>
      </dl>
      <div className="skill-dps-table-scroll" role="region" tabIndex={0} aria-label="回帰係数">
        <table className="skill-dps-table skill-dps-regression-table" aria-label="回帰係数">
          <thead><tr>
            <th scope="col">説明変数</th><th scope="col">係数</th><th scope="col">標準化係数</th><th scope="col">VIF</th>
          </tr></thead>
          <tbody>{applied.map((predictor, index) => {
            const vif = fit.varianceInflationFactors[index]
            const formattedVif = VIF.format(vif)
            const vifWarning = vif >= VIF_WARNING_THRESHOLD
            return <tr key={predictor}>
              <th scope="row">{SKILL_DPS_ANALYSIS_X_LABELS[predictor]}</th>
              <td>{COEFFICIENT.format(fit.coefficients[index])}</td>
              <td>{COEFFICIENT.format(fit.standardizedCoefficients[index])}</td>
              <td className={vifWarning ? 'skill-dps-vif-warning' : undefined}
                aria-label={vifWarning ? `${formattedVif}、要確認` : undefined}>
                {vifWarning && <span aria-hidden="true">! </span>}{formattedVif}
              </td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </div>}
  </section>
}
