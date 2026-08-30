export type NavigationPage = 'classifier' | 'skills' | 'damage' | 'comparison' | 'enemies'

export type NavigationItem = {
  id: NavigationPage
  href: string
  label: string
  description: string
}

export const APP_NAV_ITEMS: readonly NavigationItem[] = [
  {
    id: 'classifier',
    href: '#/',
    label: 'Skill Model Classifier',
    description: 'オペレーター別のスキル分類',
  },
  {
    id: 'skills',
    href: '#/skills',
    label: 'All Skills',
    description: '全スキルの一覧と絞り込み',
  },
  {
    id: 'damage',
    href: '#/damage',
    label: 'Damage Calculator',
    description: '攻撃・スキルダメージ計算',
  },
  {
    id: 'comparison',
    href: '#/comparison',
    label: 'Operator Comparison',
    description: 'オペレーター性能の横断比較',
  },
  {
    id: 'enemies',
    href: '#/enemies',
    label: 'Enemy Analysis',
    description: '敵ステータスの検索と分析',
  },
]
