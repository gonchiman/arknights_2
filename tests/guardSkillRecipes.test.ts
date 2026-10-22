import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GUARD_SKILL_RECIPES, findGuardSkillRecipe } from '../src/lib/guardSkillRecipes.ts'
import { GUARD_SKILL_SOURCES } from '../src/lib/guardSkillSources.ts'
import { guardConditionMatches, resolveGuardConditions, resolveGuardValue } from '../src/lib/guardCombatValues.ts'
import type { GuardConditions, GuardStage, GuardValue } from '../src/lib/guardCombatTypes.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; skills: { supported: boolean; skillIndex: number; skillId: string }[] }[]
}

function recipe(operatorId: string, skillIndex: number) {
  return findGuardSkillRecipe(operatorId, skillIndex)!
}
function board(operatorId: string, skillIndex: number) {
  const raw = GUARD_SKILL_SOURCES.find(value => value.id === operatorId)!.skills.find(value => value.skillIndex === skillIndex)!.raw
  return new Map((raw.blackboard ?? []).filter(entry => typeof entry.value === 'number')
    .map(entry => [entry.key!.toLowerCase(), entry.value!] as [string, number]))
}
function resolve(operatorId: string, skillIndex: number, value: GuardValue | undefined, supplied: GuardConditions = {}) {
  const values = resolveGuardConditions(recipe(operatorId, skillIndex).inputs, supplied).values
  return resolveGuardValue(value ?? 0, board(operatorId, skillIndex), { actualAttackTargetCount: 1, ...values, ...supplied })
}
function selected(operatorId: string, skillIndex: number, supplied: GuardConditions = {}): GuardStage {
  const item = recipe(operatorId, skillIndex)
  const values = resolveGuardConditions(item.inputs, supplied).values
  const stages = item.stages.filter(stage => !stage.when || guardConditionMatches(stage.when, values))
  assert.equal(stages.length, 1)
  return stages[0]
}

test('未対応25人75スキルを重複・欠落なく明示定義し既存15スキルを置換しない', () => {
  const expected = fixture.guards.flatMap(operator => operator.skills.filter(skill => !skill.supported)
    .map(skill => `${operator.id}/${skill.skillIndex}`)).sort()
  const actual = GUARD_SKILL_RECIPES.map(item => `${item.operatorId}/${item.skillIndex}`).sort()
  assert.equal(actual.length, 75)
  assert.equal(new Set(actual).size, 75)
  assert.deepEqual(actual, expected)
  assert.equal(GUARD_SKILL_SOURCES.length, 25)
  for (const item of GUARD_SKILL_RECIPES) assert.ok(item.stages.length > 0)
})

test('全段階の参照値が取得済み特化3のblackboardと定義済み入力から解決できる', () => {
  const common = { actualAttackTargetCount: 1 }
  for (const item of GUARD_SKILL_RECIPES) {
    const values = { ...common, ...resolveGuardConditions(item.inputs, {}).values }
    assert.equal(new Set(item.inputs.map(input => input.key)).size, item.inputs.length)
    assert.equal(new Set(item.stages.map(stage => stage.id)).size, item.stages.length)
    const scalars = ['atk', 'aspd', 'intervalScale', 'intervalAdd', 'maxTargets',
      'defenseIgnoreRatio', 'defenseIgnoreFixed', 'resistanceIgnoreFixed'] as const
    for (const stage of item.stages) {
      for (const key of scalars) if (stage[key] != null) assert.ok(Number.isFinite(resolveGuardValue(stage[key], board(item.operatorId, item.skillIndex), values)), `${item.operatorId} S${item.skillIndex} ${key}`)
      if (stage.duration != null && stage.duration !== 'UNTIL_EXIT') assert.ok(resolveGuardValue(stage.duration, board(item.operatorId, item.skillIndex), values) >= 0)
      for (const action of stage.actions) {
        for (const value of [action.scale, action.hits, action.targets, action.probability, action.attackBonus, action.flatDamage, action.minimumAttackScale]) {
          if (value !== undefined) assert.ok(Number.isFinite(resolveGuardValue(value, board(item.operatorId, item.skillIndex), values)))
        }
      }
    }
  }
})

test('条件分岐の未選択側にも存在しないblackboardキーや未定義入力がない', () => {
  function inspect(value: GuardValue, keys: ReadonlyMap<string, number>, inputs: ReadonlySet<string>) {
    if (typeof value === 'number') return
    if ('key' in value) assert.ok(keys.has(value.key.toLowerCase()), value.key)
    else if ('input' in value) assert.ok(inputs.has(value.input), value.input)
    else if (value.op === 'if') {
      assert.ok(inputs.has(value.input), value.input)
      inspect(value.yes, keys, inputs)
      inspect(value.no, keys, inputs)
    } else for (const argument of value.args) inspect(argument, keys, inputs)
  }
  for (const item of GUARD_SKILL_RECIPES) {
    const inputs = new Set(['actualAttackTargetCount', ...item.inputs.map(input => input.key)])
    const keys = board(item.operatorId, item.skillIndex)
    for (const stage of item.stages) {
      if (stage.when) assert.ok(inputs.has(stage.when.input))
      for (const [name, value] of Object.entries(stage)) {
        if (['atk', 'aspd', 'intervalScale', 'intervalAdd', 'maxTargets', 'defenseIgnoreRatio', 'defenseIgnoreFixed', 'resistanceIgnoreFixed'].includes(name)
          && value != null) inspect(value as GuardValue, keys, inputs)
      }
      if (stage.duration != null && stage.duration !== 'UNTIL_EXIT') inspect(stage.duration, keys, inputs)
      for (const action of stage.actions) for (const value of [action.scale, action.hits, action.targets,
        action.probability, action.attackBonus, action.flatDamage, action.minimumAttackScale]) {
        if (value !== undefined) inspect(value, keys, inputs)
      }
    }
  }
})

test('チョンユエS1は最大チャージ時のみ3回を消費し、2チャージ時は1回分', () => {
  const action = recipe('char_2024_chyue', 1).stages[0].actions[0]
  assert.equal(resolve('char_2024_chyue', 1, action.hits, { charges: 1 }), 1)
  assert.equal(resolve('char_2024_chyue', 1, action.hits, { charges: 2 }), 1)
  assert.equal(resolve('char_2024_chyue', 1, action.hits, { charges: 3 }), 3)
})

test('ズオ・ラウS1はHP80%と50%を下回った時だけヒット数が増える', () => {
  const action = recipe('char_4121_zuole', 1).stages[0].actions[0]
  for (const [hp, hits] of [[100, 1], [80, 1], [79, 2], [50, 2], [49, 3]]) {
    assert.equal(resolve('char_4121_zuole', 1, action.hits, { selfHpPercent: hp }), hits)
  }
})

test('ヴィヴィアナS3の発動回数でヒット数と持続時間を同時に切り替える', () => {
  const item = recipe('char_4098_vvana', 3).stages[0]
  assert.equal(resolve('char_4098_vvana', 3, item.actions[0].hits, { skillActivationCount: 1 }), 2)
  assert.equal(resolve('char_4098_vvana', 3, item.actions[0].hits, { skillActivationCount: 2 }), 3)
  assert.equal(resolve('char_4098_vvana', 3, item.duration as GuardValue, { skillActivationCount: 1 }), 15)
  assert.equal(resolve('char_4098_vvana', 3, item.duration as GuardValue, { skillActivationCount: 2 }), 25)
})

test('怒潮ズィマーS2は初回と2回目以降を重複させない', () => {
  assert.equal(selected('char_1051_headb2', 2, { skillActivationCount: 1 }).id, 'first')
  assert.equal(selected('char_1051_headb2', 2, { skillActivationCount: 2 }).id, 'later')
  assert.equal(selected('char_1051_headb2', 2, { skillActivationCount: 90 }).duration, 'UNTIL_EXIT')
})

test('チョンユエS3は切替の内部時刻を推定せず強化前後を選択する', () => {
  const action = recipe('char_2024_chyue', 3).stages[0].actions[0]
  assert.equal(resolve('char_2024_chyue', 3, action.hits, { enhancedMode: false }), 1)
  assert.equal(resolve('char_2024_chyue', 3, action.hits, { enhancedMode: true }), 2)
})

test('デーゲンブレヒャーS2は味方によるブロックも条件に含める', () => {
  const action = recipe('char_4116_blkkgt', 2).stages[0].actions[0]
  assert.equal(resolve('char_4116_blkkgt', 2, action.hits, { targetBlocked: true, targetBlockedBySelf: false }), 3)
  assert.equal(resolve('char_4116_blkkgt', 2, action.hits, { targetBlocked: false }), 2)
})

test('聖約イグゼキュターS3のATK累積は30で止まり、弾薬入力は素質側と共有する', () => {
  const item = recipe('char_1032_excu2', 3).stages[0]
  assert.equal(resolve('char_1032_excu2', 3, item.atk, { ammoSpent: 0 }), 1.8)
  assert.ok(Math.abs(resolve('char_1032_excu2', 3, item.atk, { ammoSpent: 30 }) - 3.6) < 1e-12)
  assert.ok(Math.abs(resolve('char_1032_excu2', 3, item.atk, { ammoSpent: 50 }) - 3.6) < 1e-12)
})

test('物理術混合と終撃の異倍率を別攻撃として保持する', () => {
  const chen = recipe('char_010_chen', 2).stages[0].actions
  assert.deepEqual(chen.map(action => action.damageType), ['PHYSICAL', 'ARTS'])
  assert.deepEqual(chen.map(action => resolve('char_010_chen', 2, action.scale)), [5, 5])
  const zuole = recipe('char_4121_zuole', 3).stages[0].actions
  assert.deepEqual(zuole.map(action => resolve('char_4121_zuole', 3, action.hits)), [6, 1])
  assert.deepEqual(zuole.map(action => resolve('char_4121_zuole', 3, action.scale)), [2.45, 4.9])
})

test('豊川祥子S1は8音符の減少係数を個別に保持する', () => {
  const actions = recipe('char_4182_oblvns', 1).stages[0].actions
  assert.equal(actions.length, 8)
  assert.deepEqual(actions.map(action => resolve('char_4182_oblvns', 1, action.scale)), [1, 0.92, 0.75, 0.58, 0.42, 0.33, 0.17, 0.05])
})

test('レッシングS3の自身への600術ダメージを敵への攻撃に加えない', () => {
  const item = recipe('char_4011_lessng', 3).stages[0]
  assert.equal(item.actions.length, 1)
  assert.equal(item.actions[0].damageType, 'PHYSICAL')
  assert.equal(resolve('char_4011_lessng', 3, item.actions[0].scale, { targetBlocked: true }), 2.2)
  assert.equal(resolve('char_4011_lessng', 3, item.actions[0].scale, { targetBlocked: false }), 1)
})

test('不明な位置・時間挙動は通常攻撃への仮置きで計算済みにしない', () => {
  for (const [operator, skill] of [['char_4182_oblvns', 2], ['char_4182_oblvns', 3], ['char_4010_etlchi', 3], ['char_1043_leizi2', 3]] as const) {
    assert.ok(recipe(operator, skill).stages.every(stage => stage.unresolved?.length))
  }
})
