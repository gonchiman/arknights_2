export type NavigationPage = 'home' | 'operators' | 'skills' | 'skill-classification' | 'talent-classification' | 'talent-structure' | 'skill-effects' | 'skill-summary' | 'skill-structure' | 'skill-json' | 'code-analysis' | 'damage' | 'damage-two' | 'damage-three' | 'damage-verification' | 'comparison' | 'enemies' | 'enemy-analysis' | 'main-enemy-trends' | 'maps' | 'sources' | 'slide-maker' | 'goldenglow-home' | 'surtr-home' | 'surtr-s3' | 'surtr-s3-comparison' | 'surtr-skill-comparison' | 'surtr-total-damage' | 'surtr-duration' | 'surtr-remnant-attacks' | 'goldenglow-guide' | 'goldenglow-performance' | 'goldenglow-target-switch' | 'goldenglow-target-switch-two' | 'goldenglow-target-switch-three' | 'goldenglow-single-trial' | 'goldenglow-trial-benchmark'

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

export const HOME_LINK = { label: 'ホーム', href: '#/' } as const
export const GOLDENGLOW_HOME_LINK = { label: 'ゴールデングロー', href: '#/analysis/goldenglow' } as const
export const SURTR_HOME_LINK = { label: 'スルト', href: '#/analysis/surtr' } as const

export const DAMAGE_VERIFICATION_ITEM: NavigationItem = {
  id: 'damage-verification',
  href: '#/analysis/damage-verification',
  label: 'ダメージ検証',
  description: '',
  section: 'analysis',
}

export const SURTR_ANALYSIS_ITEMS: readonly NavigationItem[] = [
  {
    id: 'surtr-s3',
    href: '#/analysis/surtr/s3',
    label: 'S3 DPS',
    description: '',
    section: 'operator-analysis',
  },
  {
    id: 'surtr-s3-comparison',
    href: '#/analysis/surtr/s3-comparison',
    label: 'S3 DPS比較（MOD・潜在）',
    description: '',
    section: 'operator-analysis',
  },
  {
    id: 'surtr-skill-comparison',
    href: '#/analysis/surtr/s2-s3-comparison',
    label: 'S2・S3 DPS比較',
    description: '',
    section: 'operator-analysis',
  },
  {
    id: 'surtr-duration',
    href: '#/analysis/surtr/duration',
    label: 'S3 継続時間',
    description: '',
    section: 'operator-analysis',
  },
  {
    id: 'surtr-total-damage',
    href: '#/analysis/surtr/total-damage',
    label: 'S3 総ダメージ',
    description: '',
    section: 'operator-analysis',
  },
  {
    id: 'surtr-remnant-attacks',
    href: '#/analysis/surtr/remnant-attacks',
    label: '余燼中の攻撃・ダメージ',
    description: '',
    section: 'operator-analysis',
  },
]

export const SURTR_HOME_ITEMS: readonly NavigationItem[] = [
  ...SURTR_ANALYSIS_ITEMS,
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
  {
    id: 'goldenglow-target-switch-two',
    href: '#/analysis/goldenglow/target-switch-2',
    label: 'ターゲット切替2',
    description: '敵HP・スキル総ダメージ',
    section: 'operator-analysis',
  },
  {
    id: 'goldenglow-target-switch-three',
    href: '#/analysis/goldenglow/target-switch-3',
    label: 'ターゲット切替3',
    description: '敵HP・術耐性別のMOD比較表',
    section: 'operator-analysis',
  },
  {
    id: 'goldenglow-single-trial',
    href: '#/analysis/goldenglow/single-trial',
    label: '単発シミュレーション',
    description: '',
    section: 'operator-analysis',
  },
  {
    id: 'goldenglow-trial-benchmark',
    href: '#/analysis/goldenglow/trial-benchmark',
    label: '試行回数の調査',
    description: '試行回数・計算時間',
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
    id: 'skill-classification',
    href: '#/skill-classification',
    label: 'スキル大分類',
    description: '',
    section: 'analysis',
  },
  {
    id: 'talent-classification',
    href: '#/talent-classification',
    label: '素質大分類',
    description: '',
    section: 'analysis',
  },
  {
    id: 'talent-structure',
    href: '#/talent-structure',
    label: '素質構造',
    description: '',
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
    id: 'skill-summary',
    href: '#/skill-summary',
    label: 'スキル効果の分解',
    description: '原文から条件・対象・効果を整理',
    section: 'analysis',
  },
  {
    id: 'skill-structure',
    href: '#/skill-structure',
    label: 'スキル構造',
    description: '',
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
    id: 'damage-two',
    href: '#/damage-2',
    label: 'Damage Calculator 2',
    description: 'ダメージ・DPSテーブル',
    section: 'analysis',
  },
  {
    id: 'damage-three',
    href: '#/damage-3',
    label: 'Damage Calculator 3',
    description: 'スキル構造からダメージ・DPSを計算',
    section: 'analysis',
  },
  DAMAGE_VERIFICATION_ITEM,
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
    label: '敵データベース',
    description: '敵の検索・ステータス・能力',
    section: 'analysis',
  },
  {
    id: 'enemy-analysis',
    href: '#/analysis/enemies',
    label: '敵の統計分析',
    description: '敵ステータスの分布・統計量',
    section: 'analysis',
  },
  {
    id: 'main-enemy-trends',
    href: '#/analysis/enemies/main-trends',
    label: 'メイン敵ステータス推移',
    description: '章別の敵ステータス・平均と中央値',
    section: 'analysis',
  },
  {
    id: 'maps',
    href: '#/maps',
    label: 'マップデータベース',
    description: 'マップの検索・地形・出現する敵',
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
    id: 'surtr-home',
    ...SURTR_HOME_LINK,
    description: 'S3 DPS・継続時間・総ダメージ・余燼の分析',
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
