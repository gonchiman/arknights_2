import { useId } from 'react'
import type { OperatorModuleApplication } from '../lib/operatorModules'
import './GoldenglowModuleEffect.css'

export function GoldenglowModuleEffect({ application }: {
  application: OperatorModuleApplication
}) {
  const id = useId()
  const attributesTitleId = `${id}-attributes`
  const changesTitleId = `${id}-changes`

  if (!application.moduleName) {
    return <p className="gg-module-effect-status">モジュールは未装備です。</p>
  }

  return (
    <div className="gg-module-effect">
      <p className="gg-module-effect-name">
        {application.moduleName} Lv.{application.moduleLevel > 0 ? application.moduleLevel : '—'}
      </p>
      {application.attributeEffects.length > 0 && <section className="gg-module-effect-section">
        <h3 className="gg-table-title" id={attributesTitleId}>能力値補正</h3>
        <div className="gg-probability-table-wrap gg-value-table-wrap">
          <table className="gg-probability-table gg-module-effect-table" aria-labelledby={attributesTitleId}>
            <tbody>
              {application.attributeEffects.map((effect, index) => <tr key={`${effect.key}:${index}`}>
                <th scope="row">{effect.label}</th>
                <td>{effect.valueLabel}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>}
      {application.changes.length > 0 && <section className="gg-module-effect-section">
        <h3 className="gg-table-title" id={changesTitleId}>追加・変更効果</h3>
        <div className="gg-probability-table-wrap gg-value-table-wrap">
          <table className="gg-probability-table gg-module-effect-table gg-module-effect-descriptions" aria-labelledby={changesTitleId}>
            <tbody>
              {application.changes.map((change, index) => <tr key={`${change.kind}:${change.label}:${index}`}>
                <th scope="row">{change.label}</th>
                <td>{change.description || '効果の説明を取得できませんでした。'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>}
      {application.attributeEffects.length === 0 && application.changes.length === 0 && (
        <p className="gg-module-effect-status">モジュール効果の情報を取得できませんでした。</p>
      )}
    </div>
  )
}
