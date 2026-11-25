import { useEffect, useMemo, useRef, useState } from 'react'
import type { SkillDpsAnalysisDataset, SkillDpsAnalysisMetric } from '../lib/skillDpsAnalysis'
import { SKILL_DPS_CROSS_VALIDATION_VIF_TOLERANCE, type SkillDpsCrossValidationResult } from '../lib/skillDpsCrossValidation'
import type { SkillDpsRegressionPredictor } from '../lib/skillDpsMultipleRegression'
import {
  EMPTY_SKILL_DPS_CROSS_VALIDATION_RUN,
  SkillDpsCrossValidationRunner, type SkillDpsCrossValidationRunState,
} from '../lib/skillDpsCrossValidationRunner'
import { HelpPopover } from './HelpPopover'
import { SkillDpsCombinationDialog } from './SkillDpsCombinationDialog'
import './SkillDpsCrossValidation.css'

const COUNT = new Intl.NumberFormat('ja-JP')
const ERROR_FORMAT = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const TITLE = '交差検証'
const SEGMENTS = ['分析詳細', '組み合わせ評価', TITLE, '表']
const METHODS = [
  ['adjusted', '調整済みR²が最高'],
  ['vif', `最大VIFが最小（首位から${SKILL_DPS_CROSS_VALIDATION_VIF_TOLERANCE} pt以内）`],
  ['fixed', '攻撃力・攻撃間隔に固定'],
] as const

type ValidationScope = { dataset: SkillDpsAnalysisDataset; key: string }

export function SkillDpsCrossValidation({ dataset, candidates, metric, observationCount, disabled }: {
  dataset: SkillDpsAnalysisDataset
  candidates: readonly SkillDpsRegressionPredictor[]
  metric: SkillDpsAnalysisMetric
  observationCount: number
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const runner = useRef<{ scope: ValidationScope; instance: SkillDpsCrossValidationRunner } | null>(null)
  const [run, setRun] = useState<{ scope: ValidationScope; state: SkillDpsCrossValidationRunState } | null>(null)
  const [cache] = useState(() => new WeakMap<SkillDpsAnalysisDataset, Map<string, SkillDpsCrossValidationResult>>())
  const scopeKey = `${metric}/${candidates.join(',')}`
  const scope = useMemo(() => ({ dataset, key: scopeKey }), [dataset, scopeKey])
  const state = run?.scope === scope ? run.state : EMPTY_SKILL_DPS_CROSS_VALIDATION_RUN
  const running = state.status === 'running'
  const cachedResult = cache.get(dataset)?.get(scope.key)
  const result = running ? null : cachedResult
  const operatorCount = result?.operatorCount ?? state.progress?.total
  const hasFixedPredictors = candidates.includes('attack') && candidates.includes('interval')

  useEffect(() => () => {
    if (runner.current?.scope !== scope) return
    runner.current.instance.dispose()
    runner.current = null
  }, [scope])

  function runOrStop() {
    if (running) {
      runner.current?.instance.stop()
      return
    }
    if (disabled) return
    if (runner.current?.scope !== scope) {
      runner.current?.instance.dispose()
      const instance = new SkillDpsCrossValidationRunner(next => {
        if (runner.current?.scope !== scope || runner.current.instance !== instance) return
        if (next.status === 'complete' && next.result) {
          const resultsForDataset = cache.get(scope.dataset) ?? new Map<string, SkillDpsCrossValidationResult>()
          resultsForDataset.set(scope.key, next.result)
          cache.set(scope.dataset, resultsForDataset)
        }
        setRun({ scope, state: next })
      })
      runner.current = { scope, instance }
    }
    runner.current.instance.start(dataset, candidates, metric)
  }

  function close() {
    setOpen(false)
    window.requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }))
  }

  return <>
    <button ref={trigger} className="button secondary" type="button" aria-haspopup="dialog"
      disabled={disabled} onClick={() => setOpen(true)}>{TITLE}</button>
    {open && <SkillDpsCombinationDialog title={TITLE} segments={SEGMENTS} bodyLabel="交差検証の結果"
      className="skill-dps-cross-validation-dialog" onClose={close}>
      <div className="skill-dps-cross-validation-toolbar">
        <div>
          <div className="skill-dps-cross-validation-conditions">
            {metric === 'direct' ? '直接DPS' : '合計DPS'}・理論稼働率 {candidates.includes('uptime') ? 'オン' : 'オフ'}
          </div>
          <div className="skill-dps-cross-validation-counts">
            <span>{COUNT.format(result?.observationCount ?? observationCount)}スキル</span>
            {operatorCount !== undefined && <span>{COUNT.format(operatorCount)}オペレーター</span>}
          </div>
        </div>
        <button className={`button${running ? ' secondary' : ''}`} type="button"
          disabled={disabled && !running} onClick={runOrStop}>
          {running ? '中止' : cachedResult ? '再実行' : '実行'}
        </button>
      </div>
      {running && <div className="skill-dps-cross-validation-progress">
        <span role="status">交差検証中</span>
        {state.progress && <>
          <progress aria-label="交差検証の進捗" value={state.progress.completed} max={state.progress.total} />
          <span>{COUNT.format(state.progress.completed)} / {COUNT.format(state.progress.total)}人</span>
        </>}
      </div>}
      {state.status === 'stopped' && <div role="status">中止しました</div>}
      {state.error && <div className="skill-dps-error" role="alert">{state.error}</div>}
      {result && <table className="skill-dps-table skill-dps-cross-validation-table" aria-label="交差検証の予測誤差">
        <colgroup><col /><col className="skill-dps-cross-validation-number" /><col className="skill-dps-cross-validation-number" /></colgroup>
        <thead><tr>
          <th scope="col">組み合わせの選び方</th>
          <th scope="col" aria-label="MAE（DPS）">
            <HelpPopover label="MAEの意味" triggerText="MAE" mode="dialog" title="MAE（平均絶対誤差）">
              <p>各スキルの予測DPSとDC3の計算値の差の絶対値を平均した値です。小さいほど、平均的なずれが小さくなります。</p>
            </HelpPopover>
            <span className="skill-dps-cross-validation-unit">（DPS）</span>
          </th>
          <th scope="col" aria-label="RMSE（DPS）">
            <HelpPopover label="RMSEの意味" triggerText="RMSE" mode="dialog" title="RMSE（二乗平均平方根誤差）">
              <p>予測DPSとDC3の計算値の差を二乗して平均し、平方根を取った値です。大きなずれを重く見る指標で、小さいほど予測誤差が小さいと評価します。</p>
            </HelpPopover>
            <span className="skill-dps-cross-validation-unit">（DPS）</span>
          </th>
        </tr></thead>
        <tbody>{METHODS.map(([key, label]) => {
          const errors = result.methods[key]
          return <tr key={key}>
            <th scope="row">{label}</th>
            {errors ? <>
              <td>{ERROR_FORMAT.format(errors.mae)}</td>
              <td>{ERROR_FORMAT.format(errors.rmse)}</td>
            </> : <td className="skill-dps-table-empty" colSpan={2}>{key === 'fixed' && !hasFixedPredictors ? '対象外' : '計算不可'}</td>}
          </tr>
        })}</tbody>
      </table>}
    </SkillDpsCombinationDialog>}
  </>
}
