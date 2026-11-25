const VIF = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const VIF_WARNING_THRESHOLD = 5

export function SkillDpsVifCell({ value, detail }: {
  value: number
  detail?: { modelLabel: string; onOpen: (trigger: HTMLButtonElement) => void }
}) {
  const formatted = VIF.format(value)
  const warning = value >= VIF_WARNING_THRESHOLD
  const valueLabel = warning ? `${formatted}、要確認` : formatted
  const content = <>{warning && <span aria-hidden="true">! </span>}{formatted}</>

  return <td className={warning ? 'skill-dps-vif-warning' : undefined}
    aria-label={warning && !detail ? valueLabel : undefined}>
    {detail
      ? <button className="skill-dps-vif-detail-trigger" type="button" aria-haspopup="dialog"
          aria-label={`${detail.modelLabel}のVIFの内訳を開く、最大 ${valueLabel}`}
          onClick={event => detail.onOpen(event.currentTarget)}>{content}</button>
      : content}
  </td>
}
