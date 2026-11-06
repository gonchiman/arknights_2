import type { GuardSkillRecipe } from './guardCombatTypes.ts'

const eventScope = { kind: 'UNSUPPORTED' as const, reason: '選択した1体の1回分。召喚数・配置時刻・誘発頻度を含む全期間の合算は計算しません。' }

// https://prts.wiki/w/旧日残影 : the token is the damage source and uses the owner's ATK.
// This is not a stored-energy projectile and cannot trigger the owner's isolated-target attack talent.
export const EBENHOLZ_SUMMON_RECIPE: GuardSkillRecipe = {
  operatorId: 'char_4046_ebnhlz', skillIndex: 2, inputs: [], stages: [{
    id: 'remnant', label: '過去の残像1体・爆発1回', kind: 'SKILL_ACTION', maxTargets: null,
    actor: { kind: 'TOKEN', tokenKey: 'token_10024_ebnhlz_rcube' }, periodTotal: eventScope,
    actions: [{ label: '残像の爆発', role: 'MAIN', damageType: 'ARTS', basis: 'OWNER_ATK_STAT', scale: { key: 'atk_scale' } }],
    notes: ['残像の効果範囲内の地上敵。生成から爆発まで本人の攻撃力が一定の条件。貯蔵数は召喚数を決めるが、1体の爆発倍率を増やさない。本人の貯蔵弾135%・孤立時15%を継承しない。'],
  }],
}

// https://prts.wiki/w/风丸 : S2 ATK bonus applies to the separate paper doll before its entry explosion.
export const KAZEMARU_SUMMON_RECIPE: GuardSkillRecipe = {
  operatorId: 'char_4016_kazema', skillIndex: 2,
  inputs: [{ key: 'kazemaruS2Actor', label: '計算対象', kind: 'select', defaultValue: 'OWNER', options: [
    { value: 'OWNER', label: 'カゼマル本人' }, { value: 'TOKEN', label: '紙人形の通常攻撃' }, { value: 'ENTRY', label: '紙人形出現時の術ダメージ' },
  ] }], stages: [
    { id: 'owner', label: 'カゼマル本人・スキル中', kind: 'NORMAL', maxTargets: 1, atk: { key: 'atk' },
      when: { input: 'kazemaruS2Actor', comparison: 'EQ', value: 'OWNER' }, periodTotal: eventScope,
      actions: [{ label: '本人の通常攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 }] },
    { id: 'token', label: '紙人形1体・通常攻撃', kind: 'NORMAL', maxTargets: 1, atk: { key: 'atk' },
      actor: { kind: 'TOKEN', tokenKey: 'token_10022_kazema_shadow' }, when: { input: 'kazemaruS2Actor', comparison: 'EQ', value: 'TOKEN' }, periodTotal: eventScope,
      actions: [{ label: '紙人形の通常攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 }] },
    { id: 'entry', label: '紙人形1体・出現時の術ダメージ', kind: 'SKILL_ACTION', maxTargets: null, atk: { key: 'atk' },
      actor: { kind: 'TOKEN', tokenKey: 'token_10022_kazema_shadow' }, when: { input: 'kazemaruS2Actor', comparison: 'EQ', value: 'ENTRY' }, periodTotal: eventScope,
      actions: [{ label: '折り紙の極意・紙人形出現時', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'ATK_STAT', scale: 2.7 }],
      notes: ['紙人形自身の攻撃力に120%を適用した後、確認済みの出現倍率270%を適用。致命傷で本体が交代する身替りとは別。'],
    },
  ],
}

// https://prts.wiki/w/铁钳号 : token skill damage references Stainless, not its dummy ATK=100.
// Direct/splash components are exposed independently until their overlap is confirmed.
export const STAINLESS_SUMMON_RECIPE: GuardSkillRecipe = {
  operatorId: 'char_4072_ironmn', skillIndex: 3,
  inputs: [
    { key: 'ironmnS3Actor', label: '計算対象', kind: 'select', defaultValue: 'OWNER', options: [
      { value: 'OWNER', label: 'ステインレス本人' }, { value: 'DIRECT', label: '装置の砲撃・直撃成分' },
      { value: 'SPLASH', label: '装置の砲撃・周囲成分' }, { value: 'COMBINED', label: '装置の砲撃・直撃と周囲の合算（未確認）' },
    ] },
    { key: 'ironmnSkillActive', label: '本人のS3発動中', kind: 'boolean', defaultValue: true,
      options: [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] },
  ], stages: [
    { id: 'owner', label: 'ステインレス本人・通常攻撃', kind: 'NORMAL', maxTargets: 1,
      when: { input: 'ironmnS3Actor', comparison: 'EQ', value: 'OWNER' }, periodTotal: eventScope,
      atk: { op: 'if', input: 'ironmnSkillActive', comparison: 'EQ', value: true, yes: { key: 'atk' }, no: 0 },
      aspd: { op: 'if', input: 'ironmnSkillActive', comparison: 'EQ', value: true, yes: { key: 'attack_speed' }, no: 0 },
      actions: [{ label: '本人の通常攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 }],
      notes: ['本人が敵を攻撃する1回分。装置への攻撃で装置を回復する場合とは分離する。'],
    },
    { id: 'direct', label: '鉄鉗号1基・直撃成分1回', kind: 'SKILL_ACTION', maxTargets: 1,
      actor: { kind: 'TOKEN', tokenKey: 'token_10027_ironmn_pile3' },
      when: { input: 'ironmnS3Actor', comparison: 'EQ', value: 'DIRECT' }, periodTotal: eventScope,
      actions: [{ label: '砲撃の直撃成分', role: 'MAIN', damageType: 'PHYSICAL', basis: 'OWNER_ATK_STAT', scale: 3 }],
      notes: ['確認済みの本人攻撃力300%成分のみ。周囲成分と主対象上で重複するかは未確認のため合算しない。'],
    },
    { id: 'splash', label: '鉄鉗号1基・周囲成分1回', kind: 'SKILL_ACTION', maxTargets: null,
      actor: { kind: 'TOKEN', tokenKey: 'token_10027_ironmn_pile3' },
      when: { input: 'ironmnS3Actor', comparison: 'EQ', value: 'SPLASH' }, periodTotal: eventScope,
      actions: [{ label: '砲撃の周囲成分', role: 'MAIN', damageType: 'PHYSICAL', basis: 'OWNER_ATK_STAT', scale: 1.5 }],
      notes: ['確認済みの本人攻撃力150%成分のみ。指定対象は周囲ダメージに命中する敵。砲撃頻度は装置への被攻撃回数に依存するためDPSを出さない。'],
    },
    { id: 'combined', label: '直撃と周囲の合算', kind: 'SKILL_ACTION', actions: [],
      when: { input: 'ironmnS3Actor', comparison: 'EQ', value: 'COMBINED' },
      unresolved: ['直撃300%と周囲150%が主対象で重複するか未確認です。確認済みの各成分を個別に選択してください。'],
    },
  ],
}
