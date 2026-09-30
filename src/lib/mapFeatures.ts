import type { MapFeatureId } from '../types/map.ts'

export const MAP_FEATURE_GROUPS: {
  id: 'environment' | 'terrain' | 'devices'
  label: string
  features: { id: MapFeatureId; label: string }[]
}[] = [
  {
    id: 'environment', label: '環境効果', features: [
      { id: 'periodic_damage', label: '持続ダメージ' },
      { id: 'sp_slow', label: 'SP回復低下' },
      { id: 'cost_none', label: 'コスト自然回復なし' },
      { id: 'cost_slow', label: 'コスト回復低下' },
    ],
  },
  {
    id: 'terrain', label: '特殊地形', features: [
      { id: 'hole', label: '落し穴' },
      { id: 'healing', label: '回復エリア' },
      { id: 'defup', label: '防護エリア' },
      { id: 'grass', label: '草むら' },
      { id: 'gazebo', label: '対空エリア' },
      { id: 'bigforce', label: '特殊戦術地点' },
      { id: 'corrosion', label: '腐食した地面' },
      { id: 'infection', label: '活性源石' },
      { id: 'volcano', label: '噴気口' },
    ],
  },
  {
    id: 'devices', label: '装置・道具', features: [
      { id: 'emp', label: 'EMP発生装置' },
      { id: 'dsbell', label: '応急治療施設' },
      { id: 'crate', label: '配置できる障害物' },
    ],
  },
]

export const MAP_FEATURE_LABELS = Object.fromEntries(
  MAP_FEATURE_GROUPS.flatMap((group) => group.features.map((feature) => [feature.id, feature.label])),
) as Record<MapFeatureId, string>
