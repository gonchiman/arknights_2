import { useEffect, useId, useRef } from 'react'
import { lockPageScroll } from '../lib/pageScrollLock'
import { SKILL_DPS_REGRESSION_PREDICTORS, type SkillDpsCombinationModel } from '../lib/skillDpsMultipleRegression'
import { PageOutputHeader } from './PageLayout'
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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const backdropPointerDownRef = useRef(false)
  const titleId = useId()
  const rows = model.predictors.map((predictor, index) => ({
    predictor,
    label: SKILL_DPS_REGRESSION_PREDICTORS.find(([key]) => key === predictor)![1],
    vif: model.varianceInflationFactors[index],
  })).sort((first, second) => second.vif - first.vif)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (!dialog.open) dialog.showModal()
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus())
    const unlockScroll = lockPageScroll(document.documentElement)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      unlockScroll()
      if (dialog.open) dialog.close()
    }
  }, [])

  return <dialog
    ref={dialogRef}
    className="skill-dps-combination-vif-dialog"
    aria-labelledby={titleId}
    aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose() }}
    onPointerDown={event => { backdropPointerDownRef.current = event.target === event.currentTarget }}
    onPointerCancel={() => { backdropPointerDownRef.current = false }}
    onClick={event => {
      if (backdropPointerDownRef.current && event.target === event.currentTarget) onClose()
      backdropPointerDownRef.current = false
    }}
  >
    <div className="skill-dps-combination-vif-content">
      <header className="skill-dps-combination-vif-header">
        <PageOutputHeader
          segments={['分析詳細', '組み合わせ評価', 'VIFの内訳', '表']}
          actions={<button ref={closeRef} type="button" className="button secondary" aria-label="VIFの内訳を閉じる" onClick={onClose}>閉じる</button>}
        >
          <h2 id={titleId}>VIFの内訳</h2>
        </PageOutputHeader>
      </header>
      <div className="skill-dps-combination-vif-body" role="region" tabIndex={0} aria-label="VIFの内訳の表">
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
      </div>
    </div>
  </dialog>
}
