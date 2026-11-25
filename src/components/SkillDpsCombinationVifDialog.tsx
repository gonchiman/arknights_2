import { SKILL_DPS_REGRESSION_PREDICTORS, type SkillDpsCombinationModel } from '../lib/skillDpsMultipleRegression'
import { SkillDpsCombinationDialog } from './SkillDpsCombinationDialog'
import { SkillDpsVifCell } from './SkillDpsVifCell'
import './SkillDpsCombinationVifDialog.css'

const COUNT = new Intl.NumberFormat('ja-JP')
const PERCENTAGE = new Intl.NumberFormat('ja-JP', {
  style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
})

export function SkillDpsCombinationVifDialog({ model, observationCount, onClose }: {
  model: SkillDpsCombinationModel
  observationCount: number
  onClose: () => void
}) {
  const rows = model.predictors.map((predictor, index) => ({
    predictor,
    label: SKILL_DPS_REGRESSION_PREDICTORS.find(([key]) => key === predictor)![1],
    vif: model.varianceInflationFactors[index],
  })).sort((first, second) => second.vif - first.vif)

  return <SkillDpsCombinationDialog
    title="VIFの内訳"
    segments={['分析詳細', '組み合わせ評価', 'VIFの内訳', '表']}
    bodyLabel="VIFの内訳の表"
    onClose={onClose}
  >
    <dl className="skill-dps-statistics">
      <div><dt>使用件数</dt><dd>{COUNT.format(observationCount)}件</dd></div>
      <div><dt>調整済みR²</dt><dd>{PERCENTAGE.format(model.adjustedRSquared)}</dd></div>
    </dl>
    <table className="skill-dps-table skill-dps-combination-vif-table" aria-label="変数ごとのVIF">
      <colgroup><col style={{ width: '66%' }} /><col style={{ width: '34%' }} /></colgroup>
      <thead><tr><th scope="col">説明変数</th><th scope="col" aria-sort="descending">VIF</th></tr></thead>
      <tbody>{rows.map(({ predictor, label, vif }) => <tr key={predictor}>
        <th scope="row">{label}</th>
        <SkillDpsVifCell value={vif} />
      </tr>)}</tbody>
    </table>
  </SkillDpsCombinationDialog>
}
