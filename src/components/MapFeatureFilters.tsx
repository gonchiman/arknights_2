import { useId, useState } from 'react'
import { MAP_FEATURE_GROUPS, MAP_FEATURE_LABELS } from '../lib/mapFeatures'
import type { MapFeatureId, MapFilters } from '../types/map'

export function MapFeatureFilters({ filters, onChange }: {
  filters: MapFilters
  onChange: (patch: Partial<MapFilters>) => void
}) {
  const headingId = useId()
  const [activeGroup, setActiveGroup] = useState<string>(MAP_FEATURE_GROUPS[0].id)
  const selected = filters.features ?? []
  const group = MAP_FEATURE_GROUPS.find((item) => item.id === activeGroup) ?? MAP_FEATURE_GROUPS[0]
  const toggleFeature = (id: MapFeatureId) => onChange({
    features: selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id],
  })

  return <section className="map-feature-filters" aria-labelledby={headingId}>
    <div className="map-feature-header">
      <h3 id={headingId}>ステージの特徴</h3>
      <select aria-label="特徴の一致条件" value={filters.featureMatch ?? 'any'}
        onChange={(event) => onChange({ featureMatch: event.target.value as 'any' | 'all' })}>
        <option value="any">いずれかに一致</option>
        <option value="all">すべてに一致</option>
      </select>
      <button type="button" className="map-feature-clear" disabled={selected.length === 0}
        onClick={() => onChange({ features: [] })} aria-label="特徴の絞り込みをすべて解除">解除</button>
    </div>
    <div className="map-feature-categories" role="group" aria-label="特徴の分類">
      {MAP_FEATURE_GROUPS.map((item) => {
        const count = item.features.filter((feature) => selected.includes(feature.id)).length
        return <button key={item.id} type="button" aria-pressed={activeGroup === item.id}
          onClick={() => setActiveGroup(item.id)}>
          {item.label}{count > 0 && <span className="map-feature-category-count">（{count}）</span>}
        </button>
      })}
    </div>
    <div className="map-feature-options" role="group" aria-label={group.label}>
      {group.features.map(({ id, label }) => <label key={id} className="map-feature-option">
        <input type="checkbox" checked={selected.includes(id)} onChange={() => toggleFeature(id)} />
        <span>{label}</span>
      </label>)}
    </div>
    {selected.length > 0 && <div className="map-feature-selected" role="group" aria-label="選択した特徴">
      {selected.map((id) => <button key={id} type="button" onClick={() => toggleFeature(id)}
        aria-label={`${MAP_FEATURE_LABELS[id]}の絞り込みを解除`}>
        <span>{MAP_FEATURE_LABELS[id]}</span><span aria-hidden="true">×</span>
      </button>)}
    </div>}
  </section>
}
