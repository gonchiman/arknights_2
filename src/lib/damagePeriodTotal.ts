/** A positive duration alone does not establish finite-period damage coverage.
 * CONSTANT_RATE certifies the selected stage AND its reviewed damage-bearing
 * traits/talents at fixed target, position and block conditions. It excludes
 * other stages, deployment events and unreviewed time-dependent damage.
 */
export type PeriodTotalCapability =
  | { readonly kind: 'CONSTANT_RATE' }
  | { readonly kind: 'UNSUPPORTED'; readonly reason: string; readonly duration?: 'AMMO' }

const constant: PeriodTotalCapability = { kind: 'CONSTANT_RATE' }
const dynamic: PeriodTotalCapability = { kind: 'UNSUPPORTED', reason: '効果が期間中に変化するため、総ダメージは未計算です。' }
const hpDependent: PeriodTotalCapability = { kind: 'UNSUPPORTED', reason: 'HPに応じた攻撃性能の時間変化を計算できません。' }
const periodic: PeriodTotalCapability = { kind: 'UNSUPPORTED', reason: '継続ダメージの付与・更新・終了時刻が未確定です。' }
const ammo: PeriodTotalCapability = { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '弾薬を消費する期間の長さを計算できません。' }

/** Explicitly reviewed identities. New recipes never inherit eligibility just
 * because they have a NORMAL action, numeric DPS or a positive raw duration.
 * The constant entries also cover passive damage, not only skill modifiers.
 */
const reviewed: Readonly<Record<string, Readonly<Record<number, readonly string[]>>>> = {
  char_263_skadi: { 1: ['active'], 2: ['active'], 3: ['active'] },
  char_350_surtr: { 2: ['active'] },
  char_172_svrash: { 3: ['active'] },
  char_264_f12yin: { 3: ['active'] },
  char_4058_pepe: { 2: ['active'] },
  char_1051_headb2: { 1: ['active'], 2: ['first'] },
  char_1026_gvial2: { 1: ['active'], 2: ['active'], 3: ['active'] },
  char_4098_vvana: { 3: ['active'] },
  char_1014_nearl2: { 2: ['active'], 3: ['normal', 'true'] },

  // Expanded melee: fixed effects and stationary target/block conditions.
  char_208_melan: { 1: ['active'] }, char_281_popka: { 1: ['active'] },
  char_283_midn: { 1: ['active'] }, char_289_gyuki: { 2: ['active'] },
  char_127_estell: { 1: ['active'], 2: ['active'] },
  char_271_spikes: { 1: ['active'], 2: ['active'] },
  char_4063_quartz: { 1: ['active'], 2: ['active'] },
  char_130_doberm: { 2: ['active'] }, char_140_whitew: { 2: ['active'] },
  char_194_leto: { 1: ['active'], 2: ['active'] },
  char_143_ghost: { 1: ['active'], 2: ['active'] },
  char_356_broca: { 1: ['active'], 2: ['active'] },
  char_4066_highmo: { 2: ['active'] }, char_415_flint: { 2: ['active'] },
  char_240_wyvern: { 1: ['active'] }, char_192_falco: { 1: ['active'] },
  char_149_scave: { 2: ['active'] }, char_115_headbr: { 2: ['active'] },
  char_112_siege: { 3: ['active'] },
  char_261_sddrag: { 1: ['active'], 2: ['active'] },
  char_496_wildmn: { 1: ['active'], 2: ['active'] },
  char_497_ctable: { 1: ['active'] }, char_4144_chilc: { 2: ['active'] },
  char_220_grani: { 2: ['active'] },
  char_260_durnar: { 1: ['active'], 2: ['active'] },
  char_136_hsguma: { 1: ['active'] }, char_2014_nian: { 1: ['active'], 3: ['active'] },
  char_311_mudrok: { 3: ['active'] }, char_107_liskam: { 2: ['active'] },
  char_163_hpsts: { 2: ['active'] }, char_378_asbest: { 2: ['active'] },
  char_243_waaifu: { 1: ['active'] },

  // Expanded ranged: finite attacks, including constant per-attack expectations.
  char_211_adnach: { 1: ['active'] }, char_282_catap: { 1: ['active'] },
  char_235_jesica: { 2: ['active'] }, char_190_clour: { 1: ['active'], 2: ['active'] },
  char_133_mm: { 2: ['active'] }, char_302_glaze: { 1: ['active'] },
  char_4062_totter: { 2: ['active'] }, char_440_pinecn: { 2: ['active'] },
  char_367_swllow: { 2: ['active'] }, char_365_aprl: { 2: ['active'] },
  char_1021_kroos2: { 1: ['active'] }, char_379_sesa: { 1: ['active'] },
  char_4078_bdhkgt: { 1: ['active'] }, char_158_milu: { 1: ['active'] },
  char_218_cuttle: { 1: ['active'] }, char_4006_melnte: { 1: ['active'] },
  char_103_angel: { 2: ['active'], 3: ['active'] }, char_332_archet: { 3: ['active'] },
  char_197_poca: { 1: ['active'], 2: ['active'] },

  // Expanded arts: fixed skill effects and non-damage/SP-only timer talents.
  char_121_lava: { 1: ['active'] }, char_278_orchid: { 1: ['active'] },
  char_109_fmout: { 1: ['active'], 2: ['active'] },
  char_253_greyy: { 1: ['active'], 2: ['active'] }, char_183_skgoat: { 1: ['active'] },
  char_002_amiya: { 1: ['active'], 2: ['active'], 3: ['active'] },
  char_411_tomimi: { 1: ['active'] }, char_466_qanik: { 1: ['active'] },
  char_166_skfire: { 1: ['active'] }, char_373_lionhd: { 1: ['active'] },
  char_489_serum: { 1: ['active'], 2: ['active'] }, char_494_vendla: { 1: ['active'] },
  char_195_glassb: { 1: ['active'], 2: ['active'] }, char_326_glacus: { 1: ['active'] },
  char_180_amgoat: { 1: ['active'], 3: ['active'] },
  char_213_mostma: { 1: ['active'], 3: ['active'] },
  char_291_aglina: { 1: ['active'], 2: ['active'], 3: ['active'] },
  char_164_nightm: { 1: ['active'] }, char_344_beewax: { 1: ['active'] },
  char_388_mint: { 1: ['active'] }, char_426_billro: { 1: ['active'], 2: ['active'] },
}

const excluded: Readonly<Record<string, Readonly<Record<number, PeriodTotalCapability>>>> = {
  char_293_thorns: { 1: periodic, 2: periodic, 3: periodic },
  char_4037_demetr: { 2: hpDependent, 3: hpDependent },
  char_4082_qiubai: { 2: dynamic, 3: dynamic },
  char_4088_hodrer: { 3: periodic }, char_4145_ulpia: { 3: dynamic },
  char_4058_pepe: { 3: dynamic }, char_017_huang: { 3: dynamic },
  char_4098_vvana: { 2: dynamic }, char_188_helage: { 2: hpDependent, 3: hpDependent },
  char_4121_zuole: { 2: hpDependent }, char_485_pallas: { 2: hpDependent, 3: hpDependent },
  char_4011_lessng: { 2: dynamic, 3: dynamic },
  char_1032_excu2: { 1: ammo, 2: ammo, 3: ammo },
  char_4010_etlchi: { 3: periodic }, char_4064_mlynar: { 3: dynamic },
  char_1043_leizi2: { 2: dynamic, 3: periodic },
  char_274_astesi: { 1: dynamic, 2: dynamic },
  char_1021_kroos2: { 2: dynamic }, char_497_ctable: { 2: ammo },
  char_498_inside: { 1: ammo, 2: ammo }, char_456_ash: { 2: ammo },
}

export function getReviewedPeriodTotalCapability(operatorId: string, skillIndex: number,
  stageId: string): PeriodTotalCapability | undefined {
  if (reviewed[operatorId]?.[skillIndex]?.includes(stageId)) return constant
  return excluded[operatorId]?.[skillIndex]
}
