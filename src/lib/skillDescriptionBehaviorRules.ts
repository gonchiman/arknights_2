import type { Rule } from './skillDescriptionRuleTypes.ts'

function textRule(pattern: RegExp, key: string, label: string, value: string): Rule {
  return { pattern, convert: () => [{ key, label, value, unit: '', sourceGroups: [] }] }
}

// These phrases assert a categorical change. They do not invent a numerical
// range, strength, chance, or a blackboard association for the change.
export const BEHAVIOR_RULES: Rule[] = [
  textRule(/攻撃範囲(?:が|は)?戦場全体まで拡大(?:する|し)?/g, 'attackRangeMode', '攻撃範囲', '戦場全体'),
  textRule(/攻撃範囲(?:が|を)?(?:拡大する|拡大し|拡大)(?!しない|せず|されない|なし)/g, 'attackRangeChange', '攻撃範囲の変化', '拡大'),
  textRule(/攻撃範囲(?:が|を)?(?:縮小する|縮小し|縮小)(?!しない|せず|されない|なし)/g, 'attackRangeChange', '攻撃範囲の変化', '縮小'),
  textRule(/攻撃範囲(?:が)?変化(?:する|し)?(?!しない|せず|なし)/g, 'attackRangeChange', '攻撃範囲の変化', '変化'),
  textRule(/ダメージ発生範囲(?:が)?拡大(?:する|し)?(?!しない|せず|なし)/g, 'damageAreaChange', 'ダメージ発生範囲の変化', '拡大'),
  textRule(/退場まで効果継続/g, 'skillDurationMode', '効果の継続', '退場まで'),
  textRule(/手動でスキルを停止可能/g, 'manualSkillStop', 'スキルの手動停止', '可能'),
  textRule(/(?:効果は)?重複不可|同一対象への効果は重複しない/g, 'effectStacking', '効果の重複', '不可'),
  textRule(/(?<!敵を)(?:通常)?攻撃(?:を)?(?:しなくなる|しなくなり|停止する|停止し|停止)(?!できない)/g, 'attackBehavior', '攻撃行動', '停止'),
  textRule(/(?:敵を)?ブロックしなくな(?:る|り)/g, 'blockBehavior', 'ブロック', '停止'),
  textRule(/敵をブロックできな(?:い|くなり|くなる)/g, 'blockBehavior', 'ブロック', '不可'),
  textRule(/ブロック中の敵全員を同時に攻撃/g, 'attackTargetMode', '攻撃対象', 'ブロック中の敵全員'),
  textRule(/(?:自身が)?迷彩状態にな(?:る|り)/g, 'camouflage', '迷彩', '付与'),
  textRule(/(?:自身が)?ステルス状態にな(?:る|り)/g, 'stealth', 'ステルス', '付与'),
  textRule(/ステルス状態(?:が|を)(?:無効化される|無効化する|無効にする)/g, 'stealthRemoval', 'ステルス', '無効化'),
  textRule(/(?:一部の特殊能力を)(?:無効化する|無効化し|無効化)(?!されない|しない|せず)/g, 'silence', '一部の特殊能力', '無効化'),
  textRule(/(?:特性による)?遠距離攻撃時の攻撃力低下が無効化され(?:る)?/g, 'rangedAttackPenalty', '遠距離攻撃時の攻撃力低下', '無効化'),
  textRule(/特性による治療量低下が無効化され(?:る)?/g, 'healingPenalty', '特性による治療量低下', '無効化'),
  textRule(/跳躍時のダメージ減衰が発生しなくなる/g, 'chainDamageFalloff', '跳躍時のダメージ減衰', '無効化'),
  textRule(/次に受けるダメージを無効化(?:する|し)?/g, 'nextDamageImmunity', '次に受けるダメージ', '無効化'),
]
