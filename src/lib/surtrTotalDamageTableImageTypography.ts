export const SURTR_TOTAL_DAMAGE_TABLE_TITLE_SIZES = [10, 12, 14, 16] as const
export const SURTR_TOTAL_DAMAGE_TABLE_DETAIL_SIZES = [8, 9, 10, 12] as const

export type SurtrTotalDamageTableTitleSize = typeof SURTR_TOTAL_DAMAGE_TABLE_TITLE_SIZES[number]
export type SurtrTotalDamageTableDetailSize = typeof SURTR_TOTAL_DAMAGE_TABLE_DETAIL_SIZES[number]

export const DEFAULT_SURTR_TOTAL_DAMAGE_TABLE_TITLE_SIZE: SurtrTotalDamageTableTitleSize = 12
export const DEFAULT_SURTR_TOTAL_DAMAGE_TABLE_DETAIL_SIZE: SurtrTotalDamageTableDetailSize = 8
