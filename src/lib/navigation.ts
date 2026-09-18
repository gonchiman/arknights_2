export type NavigationPage = 'operators' | 'skills' | 'skill-effects' | 'skill-json' | 'code-analysis' | 'damage' | 'comparison' | 'enemies' | 'sources' | 'slide-maker' | 'goldenglow-home' | 'goldenglow-guide' | 'goldenglow-performance' | 'goldenglow-target-switch'

export type NavigationSection = 'analysis' | 'operator-analysis' | 'information'

export type NavigationItem = {
  id: NavigationPage
  href: string
  label: string
  description: string
  section: NavigationSection
}

export const NAVIGATION_SECTIONS: ReadonlyArray<{ id: NavigationSection; label: string }> = [
  { id: 'analysis', label: 'ANALYSIS TOOLS' },
  { id: 'operator-analysis', label: 'OPERATOR ANALYSIS' },
  { id: 'information', label: 'INFORMATION' },
]

export const GOLDENGLOW_ANALYSIS_ITEMS: readonly NavigationItem[] = [
  {
    id: 'goldenglow-performance',
    href: '#/analysis/goldenglow/performance',
    label: 'スキルダメージ比較',
    description: 'モジュール・潜在比較',
    section: 'operator-analysis',
  },
  {
    id: 'goldenglow-guide',
    href: '#/analysis/goldenglow/explosion',
    label: '爆発分析',
    description: '爆発確率・期待値',
    section: 'operator-analysis',
  },
  {
    id: 'goldenglow-target-switch',
    href: '#/analysis/goldenglow/target-switch',
    label: 'ターゲット切替',
    description: '敵HP・切替時間',
    section: 'operator-analysis',
  },
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
    id: 'skill-effects',
    href: '#/skill-effects',
    label: 'Skill Effects',
    description: 'スキル説明文の効果解析',
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
    id: 'code-analysis',
    href: '#/analysis/code',
    label: 'GGのDAT解析',
    description: 'GG関連の名前・クラス・処理を調べる',
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
    id: 'goldenglow-home',
    href: '#/analysis/goldenglow',
    label: 'ゴールデングロー',
    description: 'スキルダメージ・爆発・ターゲット切替',
    section: 'operator-analysis',
  },
  {
    id: 'slide-maker',
    href: '#/slide-maker',
    label: 'スライド作成',
    description: '画像と字幕から解説用スライドを作成',
    section: 'information',
  },
  {
    id: 'sources',
    href: '#/sources',
    label: 'Data Sources',
    description: '利用データと参照元・算出方法',
    section: 'information',
  },
]
