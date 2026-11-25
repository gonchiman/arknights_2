import { useId } from 'react'
import type { TdDeploymentRosterEntry } from '../lib/tdDeploymentRoster'

export function TdRecentAllies({ operators, onSelect }: {
  operators: readonly TdDeploymentRosterEntry[]
  onSelect: (operator: TdDeploymentRosterEntry, button: HTMLButtonElement) => void
}) {
  const labelId = useId()
  if (!operators.length) return null
  return <div role="group" aria-labelledby={labelId} className="td-recent-allies">
    <strong id={labelId}>最近配置した味方</strong>
    <div className="td-recent-names">
      {operators.map(operator => <button key={operator.id} type="button" className="button secondary"
        onClick={event => onSelect(operator, event.currentTarget)}>{operator.name}</button>)}
    </div>
  </div>
}
