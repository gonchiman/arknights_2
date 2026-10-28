/** A calculation-backed display row; definitions alone do not imply application. */
export interface EffectApplicationRow {
  id: string
  category: 'SKILL' | 'TRAIT' | 'TALENT'
  categoryLabel?: string
  name: string
  item: string
  value: string
  timing: string
  condition: string
  status: 'APPLIED' | 'CONDITION_FALSE' | 'NOT_RELEVANT' | 'UNSUPPORTED' | 'UNVERIFIED' | 'INACTIVE_STAGE'
  reason: string
  stage?: string
  probability?: string
}

export const EFFECT_APPLICATION_STATUS_LABELS: Record<EffectApplicationRow['status'], string> = {
  APPLIED: '適用',
  CONDITION_FALSE: '条件不成立',
  NOT_RELEVANT: '計算対象外',
  UNSUPPORTED: '未対応',
  UNVERIFIED: '未確認',
  INACTIVE_STAGE: '別の段階',
}
