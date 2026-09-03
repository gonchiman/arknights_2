export type NavigationPage = 'operators' | 'skills' | 'skill-json' | 'damage' | 'comparison' | 'enemies' | 'sources'

export type NavigationSection = 'analysis' | 'information'

export type NavigationItem = {
  id: NavigationPage
  href: string
  label: string
  description: string
  section: NavigationSection
}

export const NAVIGATION_SECTIONS: ReadonlyArray<{ id: NavigationSection; label: string }> = [
  { id: 'analysis', label: 'ANALYSIS TOOLS' },
  { id: 'information', label: 'INFORMATION' },
]

export const APP_NAV_ITEMS: readonly NavigationItem[] = [
  {
    id: 'operators',
    href: '#/operators',
    label: 'Operator Database',
    description: '基本情報・素質・モジュール一覧',
    section: 'analysis',
  },
  {
    id: 'skills',
    href: '#/skills',
    label: 'All Skills',
    description: '全スキルの一覧と絞り込み',
    section: 'analysis',
  },
  {
    id: 'skill-json',
    href: '#/skill-json',
    label: 'Skill JSON',
    description: 'blackboardの個別表示・キー一覧',
    section: 'analysis',
  },
  {
    id: 'damage',
    href: '#/damage',
    label: 'Damage Calculator',
    description: '攻撃・スキルダメージ計算',
    section: 'analysis',
  },
  {
    id: 'comparison',
    href: '#/comparison',
    label: 'Build Comparison',
    description: '複数ビルドの重ね合わせ比較',
    section: 'analysis',
  },
  {
    id: 'enemies',
    href: '#/enemies',
    label: 'Enemy Analysis',
    description: '敵ステータスの検索と分析',
    section: 'analysis',
  },
  {
    id: 'sources',
    href: '#/sources',
    label: 'Data Sources',
    description: '利用データと参照元・算出方法',
    section: 'information',
  },
]
