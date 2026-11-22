import './PageViewSwitch.css'

export const TABLE_CHART_VIEWS = [['table', '表'], ['chart', 'グラフ']] as const
export type TableChartView = typeof TABLE_CHART_VIEWS[number][0]

export function viewLabel<T extends string>(views: readonly (readonly [T, string])[], view: T) {
  return views.find(([key]) => key === view)![1]
}

export function PageViewSwitch<T extends string>({ views, selected, onChange, label }: {
  views: readonly (readonly [T, string])[]
  selected: T
  onChange: (value: T) => void
  label: string
}) {
  return <div className="page-view-switch" role="group" aria-label={label}>
    {views.map(([key, name]) => <button key={key} type="button" aria-pressed={key === selected}
      className={key === selected ? 'active' : ''} onClick={() => onChange(key)}>{name}</button>)}
  </div>
}
