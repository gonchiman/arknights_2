import type { AppRoute } from './routes'

export type NavigationPage = 'home' | 'operators' | 'operator-pca' | 'operator-wiki-views' | 'skills' | 'skill-classification' | 'talent-classification' | 'trait-classification' | 'trait-structure' | 'talent-structure' | 'skill-effects' | 'skill-summary' | 'skill-structure' | 'structure-coverage' | 'skill-json' | 'skill-kmeans' | 'skill-hdbscan' | 'skill-hierarchical' | 'code-analysis' | 'damage' | 'damage-two' | 'damage-three' | 'damage-three-coverage' | 'damage-three-comparison' | 'damage-verification' | 'comparison' | 'enemies' | 'enemy-analysis' | 'enemy-wiki-stats' | 'enemy-regression' | 'enemy-immunities' | 'enemy-defense-resistance' | 'enemy-map-coverage' | 'main-enemy-trends' | 'maps' | 'roguelike' | 'sources' | 'slide-maker' | 'goldenglow-home' | 'surtr-home' | 'surtr-s3' | 'surtr-s3-comparison' | 'surtr-skill-comparison' | 'surtr-total-damage' | 'surtr-duration' | 'surtr-remnant-attacks' | 'goldenglow-guide' | 'goldenglow-performance' | 'goldenglow-target-switch' | 'goldenglow-target-switch-two' | 'goldenglow-target-switch-three' | 'goldenglow-single-trial' | 'goldenglow-trial-benchmark'
  | 'operator-pca-two'
  | 'enemies-2'
  | 'damage-three-attribute-comparison'
  | 'damage-three-power-by-year'
  | 'damage-three-skill-attribute-matrix'
  | 'attribute-effects'
  | 'physical-arts-comparison'
  | 'main-enemy-spawns'
  | 'enemy-defense-resistance-formula'
  | 'bar-chart-workbench'
  | 'td-maps'
  | 'skill-dps-analysis'
  | 'skill-numeric-statistics'

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
export const STANDARD_PAGE_TITLES = {
  'bar-chart-workbench': '棒グラフ作成',
  'damage-three-comparison': 'DC3 スキル比較',
  'damage-three-power-by-year': '火力水準の比較',
  'skill-dps-analysis': 'スキルDPS分析',
  'skill-numeric-statistics': 'スキル数値分析',
  'enemies-2': '敵データベース2',
  'enemy-defense-resistance': '防御力と術耐性の対応',
  'td-maps': 'TDマップ詳細',
  'damage-three-skill-attribute-matrix': 'スキル別の物理・術ダメージ',
  'attribute-effects': '属性限定効果一覧',
} satisfies Partial<Record<AppRoute['view'], string>>

export function getStandardPageTitle(view: AppRoute['view']): string | undefined {
  const titles: Partial<Record<AppRoute['view'], string>> = STANDARD_PAGE_TITLES
  return titles[view]
}
export const GOLDENGLOW_HOME_LINK = { label: 'ゴールデングロー', href: '#/analysis/goldenglow' } as const
export const SURTR_HOME_LINK = { label: 'スルト', href: '#/analysis/surtr' } as const

export const DAMAGE_THREE_POWER_BY_YEAR_ITEM: NavigationItem = {
  id: 'damage-three-power-by-year',
  href: '#/damage-3/power-by-year',
  label: STANDARD_PAGE_TITLES['damage-three-power-by-year'],
  description: '',
  section: 'analysis',
}

export const SKILL_DPS_ANALYSIS_ITEM: NavigationItem = {
  id: 'skill-dps-analysis',
  href: '#/analysis/skills/dps-relationships',
  label: STANDARD_PAGE_TITLES['skill-dps-analysis'],
  description: '',
  section: 'analysis',
}

export const SKILL_NUMERIC_STATISTICS_ITEM: NavigationItem = {
  id: 'skill-numeric-statistics',
  href: '#/analysis/skills/statistics',
  label: STANDARD_PAGE_TITLES['skill-numeric-statistics'],
  description: '',
  section: 'analysis',
}

export const DAMAGE_THREE_SKILL_ATTRIBUTE_MATRIX_ITEM: NavigationItem = {
  id: 'damage-three-skill-attribute-matrix',
  href: '#/damage-3/skill-attribute-matrix',
  label: STANDARD_PAGE_TITLES['damage-three-skill-attribute-matrix'],
  description: '',
  section: 'analysis',
}

export const ATTRIBUTE_EFFECTS_ITEM: NavigationItem = {
  id: 'attribute-effects',
  href: '#/analysis/skills/attribute-effects',
  label: STANDARD_PAGE_TITLES['attribute-effects'],
  description: '',
  section: 'analysis',
}

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
    id: 'bar-chart-workbench',
    href: '#/charts/bar',
    label: STANDARD_PAGE_TITLES['bar-chart-workbench'],
    description: '',
    section: 'analysis',
  },
  {
    id: 'operators',
    href: '#/operators',
    label: 'Operator Database',
    description: '基本情報・素質・モジュール一覧',
    section: 'analysis',
  },
  {
    id: 'operator-pca',
    href: '#/analysis/operators/pca',
    label: 'オペレーター主成分分析',
    description: '',
    section: 'analysis',
  },
  {
    id: 'operator-pca-two',
    href: '#/analysis/operators/pca-2',
    label: 'オペレーター主成分分析２',
    description: '',
    section: 'analysis',
  },
  {
    id: 'operator-wiki-views',
    href: '#/analysis/operators/wiki-views',
    label: 'オペレーター別 Wiki 閲覧数',
    description: '',
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
    id: 'trait-classification',
    href: '#/trait-classification',
    label: '特性大分類',
    description: '',
    section: 'analysis',
  },
  {
    id: 'trait-structure',
    href: '#/trait-structure',
    label: '特性構造',
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
    id: 'structure-coverage',
    href: '#/structure-coverage',
    label: '大分類・構造化の実装範囲',
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
    id: 'skill-kmeans',
    href: '#/analysis/skills/kmeans',
    label: 'K-means 学習ラボ',
    description: '',
    section: 'analysis',
  },
  {
    id: 'skill-hdbscan',
    href: '#/analysis/skills/hdbscan',
    label: 'HDBSCAN 学習ラボ',
    description: '',
    section: 'analysis',
  },
  {
    id: 'skill-hierarchical',
    href: '#/analysis/skills/hierarchical',
    label: '階層クラスタリング 学習ラボ',
    description: '',
    section: 'analysis',
  },
  SKILL_DPS_ANALYSIS_ITEM,
  SKILL_NUMERIC_STATISTICS_ITEM,
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
  {
    id: 'damage-three-coverage',
    href: '#/damage-3/coverage',
    label: 'DC3 実装範囲',
    description: '',
    section: 'analysis',
  },
  {
    id: 'damage-three-comparison',
    href: '#/damage-3/comparison',
    label: STANDARD_PAGE_TITLES['damage-three-comparison'],
    description: '',
    section: 'analysis',
  },
  {
    id: 'damage-three-attribute-comparison',
    href: '#/damage-3/attribute-comparison',
    label: 'DC3 属性比較',
    description: '',
    section: 'analysis',
  },
  DAMAGE_THREE_POWER_BY_YEAR_ITEM,
  DAMAGE_THREE_SKILL_ATTRIBUTE_MATRIX_ITEM,
  ATTRIBUTE_EFFECTS_ITEM,
  {
    id: 'physical-arts-comparison',
    href: '#/damage-3/physical-arts-comparison',
    label: '物理・術ダメージ比較',
    description: '',
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
    id: 'enemies-2',
    href: '#/enemies-2',
    label: STANDARD_PAGE_TITLES['enemies-2'],
    description: '',
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
    id: 'enemy-regression',
    href: '#/analysis/enemies/regression',
    label: '敵の重回帰分析',
    description: '',
    section: 'analysis',
  },
  {
    id: 'enemy-immunities',
    href: '#/analysis/enemies/immunities',
    label: '敵の状態異常耐性',
    description: '',
    section: 'analysis',
  },
  {
    id: 'enemy-defense-resistance',
    href: '#/analysis/enemies/defense-resistance',
    label: STANDARD_PAGE_TITLES['enemy-defense-resistance'],
    description: '',
    section: 'analysis',
  },
  {
    id: 'enemy-defense-resistance-formula',
    href: '#/analysis/enemies/defense-resistance/formula',
    label: '防御力・術耐性の対応式',
    description: '',
    section: 'analysis',
  },
  {
    id: 'enemy-map-coverage',
    href: '#/analysis/enemies/maps',
    label: '集計マップ確認',
    description: '',
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
    id: 'main-enemy-spawns',
    href: '#/analysis/enemies/main-spawns',
    label: 'メインストーリーの出現敵一覧',
    description: '',
    section: 'analysis',
  },
  {
    id: 'enemy-wiki-stats',
    href: '#/analysis/enemies/wiki-stats',
    label: '敵別 Wiki 閲覧数',
    description: '敵ページの閲覧数・コメント件数',
    section: 'analysis',
  },
  {
    id: 'roguelike',
    href: '#/roguelike',
    label: '統合戦略',
    description: '',
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
    id: 'td-maps',
    href: '#/maps/td',
    label: STANDARD_PAGE_TITLES['td-maps'],
    description: '泡影を穿つ碧雷のステージ・地形・出現敵',
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

export const SKILL_LEARNING_ITEMS = APP_NAV_ITEMS.filter((item) => item.id === 'skill-kmeans' || item.id === 'skill-hdbscan' || item.id === 'skill-hierarchical')
