/** Source-only grammar atoms. No operator, skill ID or hidden blackboard key is used. */
export interface AllySelection {
  start: number
  end: number
  groupStart: number
  target: string
  condition: string
}

const ALLY_RANGES: Array<[RegExp, string]> = [
  [/^周囲一定範囲内にいる/, '周囲一定範囲内の'],
  [/^一定範囲内にいる/, '一定範囲内の'],
  [/^攻撃範囲内の/, '攻撃範囲内の'],
  [/^範囲内の/, '範囲内の'],
  [/^周囲の/, '周囲の'],
]

/** Parse range, recipient qualification and recipient group independently. */
export function readAllySelection(source: string, start: number): AllySelection | null {
  let cursor = start
  let range = ''
  for (const [pattern, label] of ALLY_RANGES) {
    const match = pattern.exec(source.slice(cursor))
    if (!match) continue
    range = label
    cursor += match[0].length
    break
  }
  const threshold = /^HPが(?:最大値の)?(\d+(?:\.\d+)?)%(?:以上|以下|未満|超)の/.exec(source.slice(cursor))
  if (threshold && Number(threshold[1]) > 100) return null
  const condition = threshold ? `対象の${threshold[0].slice(0, -1)}` : '—'
  if (threshold) cursor += threshold[0].length
  const groupStart = cursor
  const group = /^味方(?:全員|(?:最大)?(\d+)(?:人|体|名))/.exec(source.slice(cursor))
  if (!group || (group[1] && (!Number.isSafeInteger(Number(group[1])) || Number(group[1]) < 1))) return null
  cursor += group[0].length
  return { start, end: cursor, groupStart, target: `${range}${group[0].includes('全員') ? '味方全員' : '味方'}`, condition }
}

export interface HealingActionScope extends AllySelection {
  actionEnd: number
  timing: string | null
  replacement: boolean
}

/** The action join is separate from the selector and any following numerical effect. */
export function readHealingAction(source: string, start: number): HealingActionScope | null {
  let cursor = start
  const attack = /^(?:次の通常攻撃が|次回の?通常攻撃が)/.exec(source.slice(cursor))
  const timing = attack ? '次の通常攻撃時' : null
  if (attack) cursor += attack[0].length
  const selection = readAllySelection(source, cursor)
  if (!selection) return null
  cursor = selection.end
  const join = attack
    ? /^に対する治療行動(?:になり|になる)/.exec(source.slice(cursor))
    : /^を治療し(?!ない|なく|ません)/.exec(source.slice(cursor))
  if (!join) return null
  cursor += join[0].length
  // A hypothetical/negated action never establishes an affirmative scope.
  if (/^(?:ない|なく|ません|ない場合|の場合|場合|時|とき|こと|とは限ら|わけでは|ではな)/.test(source.slice(cursor).trimStart())) return null
  return { ...selection, start, actionEnd: cursor, timing, replacement: !!attack }
}
