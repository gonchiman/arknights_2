import { DATA_SOURCE_URLS } from './dataSources.ts'
import { createSkillJsonSelectionKey } from './skillJsonAnalysis.ts'
import type { SkillStructureSelection } from './skillStructure.ts'

export interface SkillStructureDeferredCase {
  readonly id: string
  readonly selection: SkillStructureSelection
  readonly title: string
  readonly status: 'DEFERRED'
  readonly unresolved: string
  readonly currentTreatment: string
  readonly reason: string
  readonly impact: string
  readonly resumeWhen: string
  readonly references: readonly { readonly label: string; readonly href: string; readonly external: boolean }[]
}

/** Persistent follow-up records, separate from executable effects and resolved structural differences. */
export const SKILL_STRUCTURE_DEFERRED_CASES: readonly SkillStructureDeferredCase[] = [
  {
    id: 'surtr-s3-hp-loss-timing',
    selection: { operatorId: 'char_350_surtr', skillId: 'skchr_surtr_3', skillIndex: 3, levelIndex: 9 },
    title: 'HP減少の時間変化と処理時刻',
    status: 'DEFERRED',
    unresolved: '減少率の増加曲線、最初のHP減少処理の時刻、内部の丸め・フレーム処理。',
    currentTreatment: '上限・到達時間・処理間隔を保持し、増加曲線は未確定としている。個別の継続時間分析には暫定モデルがある。',
    reason: '共通の構造とダメージ・DPS計算への対応を優先する。',
    impact: 'HP推移、継続時間、スキル総ダメージの計算。1回の攻撃ダメージとDPSには不要。',
    resumeWhen: 'HP推移・継続時間の共通計算に対応する時に、実機映像や処理の根拠と暫定モデルを照合する。',
    references: [
      { label: 'JPスキルデータ：skchr_surtr_3', href: DATA_SOURCE_URLS.skill, external: true },
      { label: 'スルトの継続時間分析（暫定モデル）', href: '#/analysis/surtr/duration', external: false },
    ],
  },
  {
    id: 'thorns-s3-redeploy-activation-count',
    selection: { operatorId: 'char_293_thorns', skillId: 'skchr_thorns_3', skillIndex: 3, levelIndex: 9 },
    title: '再配置時の発動回数の扱い',
    status: 'DEFERRED',
    unresolved: '再配置をまたぐ発動回数の保持・リセット。説明文とblackboardだけでは確定していない。',
    currentTreatment: '発動回数を段階選択の入力として保持する。初回と2回目以降の性能値は登録済み。',
    reason: '共通の構造とダメージ・DPS計算への対応を優先し、再配置を含む状態管理は後で扱う。',
    impact: '再配置を含む段階選択と、それに基づく総ダメージの計算。指定した段階の性能値には影響しない。',
    resumeWhen: '再配置をまたぐ状態管理に対応する時に、発動回数の扱いを実機や処理の根拠で確認する。',
    references: [
      { label: 'JPスキルデータ：skchr_thorns_3', href: DATA_SOURCE_URLS.skill, external: true },
    ],
  },
]

export function getSkillStructureDeferredCases(selection: SkillStructureSelection): readonly SkillStructureDeferredCase[] {
  const identity = createSkillJsonSelectionKey(selection)
  return SKILL_STRUCTURE_DEFERRED_CASES.filter(entry => entry.selection.levelIndex === selection.levelIndex
    && createSkillJsonSelectionKey(entry.selection) === identity)
}
