import { useId, type ReactNode } from 'react'
import { usePanelOpen } from '../lib/usePanelOpen'

export function NativeFlowDetails({ conditions, flow, reviewed }: { conditions: ReactNode; flow: ReactNode; reviewed: ReactNode }) {
  const id = useId()
  const [conditionsOpen, setConditionsOpen] = usePanelOpen('native-section-conditions', false)
  const [flowOpen, setFlowOpen] = usePanelOpen('native-flow-table-details', false)
  const [reviewedOpen, setReviewedOpen] = usePanelOpen('native-reviewed-guide', false)
  const items = [
    { key: 'conditions', label: '移動条件', content: conditions, open: conditionsOpen, setOpen: setConditionsOpen },
    { key: 'flow', label: '区間内の流れ', content: flow, open: flowOpen, setOpen: setFlowOpen },
    { key: 'reviewed', label: '解析済みの説明', content: reviewed, open: reviewedOpen, setOpen: setReviewedOpen },
  ].filter(item => item.content != null)
  return <div className="native-flow-details">
    <div className="native-flow-tools" role="group" aria-label="補助項目の開閉">
      {items.map(item => <button key={item.key} id={`${id}-${item.key}-toggle`} type="button" className="native-flow-tool" aria-expanded={item.open} aria-controls={`${id}-${item.key}`} onClick={() => item.setOpen(!item.open)}>
        <span>{item.label}</span><span aria-hidden="true">{item.open ? '−' : '+'}</span>
      </button>)}
    </div>
    {items.map(item => <section key={item.key} id={`${id}-${item.key}`} className="native-flow-detail-content" aria-labelledby={`${id}-${item.key}-toggle`} hidden={!item.open}>
      {item.content}
    </section>)}
  </div>
}
