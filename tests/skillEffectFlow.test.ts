import test from 'node:test'
import assert from 'node:assert/strict'
import { SKILL_STRUCTURES, type SkillStructure, type SkillStructureEffect } from '../src/lib/skillStructure.ts'
import { buildSkillEffectFlow } from '../src/lib/skillEffectFlow.ts'

function skill(operatorId: string, skillIndex: number): SkillStructure {
  const structure = SKILL_STRUCTURES.find(s => s.basicInfo.operatorId === operatorId && s.basicInfo.skillIndex === skillIndex)
  assert.ok(structure)
  return structure
}
const flow = (operatorId: string, skillIndex: number) => buildSkillEffectFlow(skill(operatorId, skillIndex))
const steps = (operatorId: string, skillIndex: number) => flow(operatorId, skillIndex).stages.flatMap(s => s.groups.flatMap(g => g.layers.flat()))
const field = (step: { fields: { label: string; value: string }[] }, label: string) => step.fields.find(f => f.label === label)?.value

test('アイリーニS1は浮遊の可否が合流してから独立した200%の2打撃へ進む', () => {
  const model = flow('char_4009_irene', 1)
  assert.equal(model.trigger, 'SP充足後の次の通常攻撃')
  const [group] = model.stages[0].groups
  assert.deepEqual(group.layers.map(layer => layer.map(s => s.id)), [['lift'], ['damage-1'], ['damage-2']])
  const [lift, first, second] = group.layers.flat()
  assert.deepEqual(lift.condition, { label: '対象は浮遊可能', yesLabel: '可能', noLabel: '不可' })
  assert.equal(lift.skipLabel, '浮遊なし')
  assert.equal(field(lift, '持続'), '1秒')
  assert.equal(field(lift, 'タイミング'), undefined)
  assert.equal(first.condition, undefined)
  assert.equal(second.condition, undefined)
  assert.deepEqual([first.title, second.title], ['初撃', '追撃'])
  for (const hit of [first, second]) {
    assert.equal(field(hit, 'ダメージ'), '物理')
    assert.equal(field(hit, '倍率'), '攻撃力の200%')
    assert.equal(field(hit, '打撃回数'), '1回')
    assert.equal(field(hit, '打撃間隔'), undefined)
  }
})

test('効果配列の並びやオペレーターIDが変わってもafterEffectsから処理順を導く', () => {
  const source = skill('char_4009_irene', 1)
  const changed: SkillStructure = { ...source, basicInfo: { ...source.basicInfo, operatorId: 'other-operator' },
    effectStructure: { ...source.effectStructure, stages: source.effectStructure.stages.map(s => ({ ...s, effects: [...s.effects].reverse() })) } }
  const sequence = buildSkillEffectFlow(changed).stages[0].groups[0]
  assert.deepEqual(sequence.layers.flat().map(s => s.id), ['lift', 'damage-1', 'damage-2'])
  assert.deepEqual(sequence.layers.flat().map(s => s.title), ['浮遊', '初撃', '追撃'])
})

test('浮遊の重量制限と持続時間短縮、砲撃の明示された打撃間隔を保持する', () => {
  const s2 = steps('char_4009_irene', 2)
  assert.match(s2.find(s => s.id === 'lift')!.condition!.label, /重量ランク≦3/)
  assert.equal(field(s2.find(s => s.id === 'lift')!, '持続'), '4秒')
  const s3 = steps('char_4009_irene', 3), lift = s3.find(s => s.id === 'lift')!, bombardment = s3.find(s => s.id === 'bombardment')!
  assert.equal(field(lift, '重量ランク3超'), '持続時間×0.5')
  assert.equal(field(bombardment, '打撃回数'), '12回')
  assert.equal(field(bombardment, '打撃間隔'), '0.25秒')
  assert.equal(field(bombardment, '対象選択'), 'ランダム')
  assert.equal(field(bombardment, '範囲半径'), '1.1マス')
})

test('継続中の複数バフを順番や同時発動と断定せず、独立した1層に置く', () => {
  const groups = flow('char_263_skadi', 3).stages[0].groups
  assert.equal(groups.length, 1)
  assert.equal(groups[0].label, '段階中')
  assert.deepEqual(groups[0].layers.map(layer => layer.map(s => s.id)), [['atk', 'def', 'max_hp']])
  const surtr = flow('char_350_surtr', 2).stages[0]
  assert.equal(surtr.groups.length, 2)
  assert.ok(surtr.groups.every(g => g.layers.length === 1))
  assert.match(surtr.groups.flatMap(g => g.layers.flat()).find(s => s.id === 'single_target')!.condition!.label, /攻撃対象数＝1/)
})

test('最大HP→全回復の依存はタイミングをまたいで維持し、他の強化を順序に巻き込まない', () => {
  const groups = flow('char_350_surtr', 3).stages[0].groups
  const hp = groups.find(g => g.layers.length > 1)!
  assert.deepEqual(hp.layers.map(layer => layer.map(s => s.id)), [['max_hp'], ['hp_restore']])
  assert.equal(field(hp.layers[0][0], 'タイミング'), '段階中')
  assert.equal(field(hp.layers[1][0], 'タイミング'), '効果発動時')
  assert.equal(field(hp.layers[0][0], '値'), '＋5000')
  const loss = groups.flatMap(g => g.layers.flat()).find(s => s.id === 'hp_loss')!
  assert.equal(field(loss, '増加曲線'), '未確定')
})

test('初回/2回目以降、状態切替、撃破時回復、周期回復はそれぞれの条件と契機を保持する', () => {
  const thorns = flow('char_293_thorns', 3)
  assert.deepEqual(thorns.stages.map(s => s.condition?.label), ['発動回数＝1', '発動回数≧2'])
  const silver = flow('char_172_svrash', 2)
  assert.deepEqual(silver.stages[0].groups, [])
  assert.match(silver.activation.find(f => f.label === '発動時の状態切替')!.value, /初期状態 → 切替後.*切替後 → 初期状態/)
  assert.ok(silver.stages[1].groups.some(g => g.label === '1秒ごと'))
  assert.ok(flow('char_350_surtr', 1).stages[0].groups.some(g => g.label === '当該攻撃で撃破時'))
})

test('条件付きの無効化効果をスキップしても、その無効化が成立した表示にしない', () => {
  const penalties = steps('char_293_thorns', 3).filter(s => s.id === 'ranged_penalty')
  assert.equal(penalties.length, 2)
  for (const penalty of penalties) {
    assert.match(penalty.condition!.label, /攻撃距離＝遠距離/)
    assert.equal(field(penalty, '値'), '無効')
    assert.equal(penalty.skipLabel, '変更なし')
  }
  const multiplier = steps('char_350_surtr', 2).find(s => s.id === 'single_target')!
  assert.equal(multiplier.skipLabel, '変更なし')
  assert.equal(steps('char_4009_irene', 1).find(s => s.id === 'lift')!.skipLabel, '浮遊なし')
})

test('guardの段階選択と可変値を既定値へ潰さず、重複しない確率攻撃を直列化しない', () => {
  assert.deepEqual(flow('char_1051_headb2', 2).stages.map(s => s.condition?.label), ['スキル発動回数＝1', 'スキル発動回数≧2'])
  assert.match(flow('char_4082_qiubai', 2).stages[1].condition!.label, /計算する段階＝発動時/)
  const hits = steps('char_4121_zuole', 1)[0]
  assert.match(field(hits, '打撃回数')!, /自身のHP（%）＜50：3.*自身のHP（%）＜80：2.*それ以外：1/)
  const probability = flow('char_4037_demetr', 3).stages[0].groups.find(g => g.label === '攻撃時')!
  assert.equal(probability.layers.length, 1)
  assert.deepEqual(probability.layers[0].map(s => s.title), ['通常打撃', '強化打撃'])
  const probabilities = probability.layers[0].map(s => Number(field(s, '発動確率')!.replace('%', '')))
  assert.equal(probabilities.reduce((a, b) => a + b), 100)
})

test('guardの毎秒固定ダメージ、敵HP基準、攻撃ごとの加算を失わない', () => {
  const normal = flow('char_4088_hodrer', 3).stages[0]
  const perSecond = normal.groups.find(g => g.label === '毎秒')!.layers[0][0]
  assert.equal(field(perSecond, 'ダメージ'), '確定')
  assert.equal(field(perSecond, '倍率'), undefined)
  assert.ok(Number(field(perSecond, '固定ダメージ')) > 0)
  const wave = flow('char_1050_chen3', 3).stages.find(s => s.id === 'wave')!.groups[0].layers[0][0]
  assert.equal(field(wave, '基準'), '対象の現在HP')
  assert.ok(field(wave, '最低攻撃倍率'))
  const blows = flow('char_1051_headb2', 3).stages[0].groups.find(g => g.label === '選択段階1回')!
  assert.equal(blows.layers.length, 1)
  assert.ok(Number(field(blows.layers[0][4], '攻撃力増加割合')!.replace('%', '')) > Number(field(blows.layers[0][0], '攻撃力増加割合')!.replace('%', '')))
  assert.ok(flow('char_1014_nearl2', 3).stages.find(s => s.id === 'sun')!.warnings?.some(w => /適用順序/.test(w)))
})

test('全登録定義で各効果・攻撃を一度ずつ保持し、入力依存値を参照エラーにしない', () => {
  assert.equal(SKILL_STRUCTURES.length, 315)
  for (const structure of SKILL_STRUCTURES) {
    const model = buildSkillEffectFlow(structure)
    const sourceStages = structure.guardRecipe?.stages ?? structure.effectStructure.stages
    assert.deepEqual(model.stages.map(s => s.id), sourceStages.map(s => s.id))
    assert.ok(!JSON.stringify(model).includes('NaN'))
    for (const stage of model.stages) {
      assert.equal(new Set(stage.groups.map(g => g.id)).size, stage.groups.length)
      const rendered = stage.groups.flatMap(g => g.layers.flat())
      assert.equal(new Set(rendered.map(s => s.id)).size, rendered.length)
      assert.ok(!stage.warnings?.some(w => /取得できません|依存関係を確認/.test(w)), structure.basicInfo.skillId)
      if (structure.guardRecipe) {
        const source = structure.guardRecipe.stages.find(s => s.id === stage.id)!
        assert.equal(rendered.filter(s => s.id.startsWith(`${stage.id}-action-`)).length, source.actions.length)
        assert.ok(stage.groups.every(g => g.layers.length === 1))
      } else {
        const source = structure.effectStructure.stages.find(s => s.id === stage.id)!
        assert.deepEqual(rendered.map(s => s.id).sort(), source.effects.map(e => e.id).sort())
      }
    }
  }
})

test('通常攻撃のヒット数継承と、スキル固有の上書きを区別する', () => {
  assert.equal(field(steps('char_4116_blkkgt', 1)[0], '打撃回数'), '通常攻撃に準拠')
  assert.equal(field(steps('char_010_chen', 1)[0], '打撃回数'), '1回')
  const blows = steps('char_4116_blkkgt', 3)
  assert.equal(field(blows.find(step => step.title === '連続斬撃')!, '打撃回数'), '10回')
  assert.equal(field(blows.find(step => step.title === '終撃')!, '打撃回数'), '1回')
})

test('スキルの倍率と特性を変更する効果を保持する', () => {
  assert.equal(field(steps('char_4116_blkkgt', 1)[0], 'スキル倍率'), '220%')
  const block = steps('char_1026_gvial2', 3).find(step => step.title === 'ブロック数の加算')
  assert.equal(field(block!, '値'), '2体')
  const charge = steps('char_4064_mlynar', 3).find(step => step.title === '特性の攻撃力上昇倍率')
  assert.match(field(charge!, '値')!, /撃破/)
})

test('部分的な依存を全層間の順序へ拡大せず、依存元を各効果に表示する', () => {
  const source = skill('char_263_skadi', 3), base = source.effectStructure.stages[0].effects[0]
  const effects: SkillStructureEffect[] = [
    { ...base, id: 'a' }, { ...base, id: 'b', afterEffects: ['a'] },
    { ...base, id: 'c', afterEffects: ['a'] }, { ...base, id: 'd', afterEffects: ['b'] },
  ]
  const changed = { ...source, effectStructure: { stages: [{ ...source.effectStructure.stages[0], effects }] } }
  const group = buildSkillEffectFlow(changed).stages[0].groups[0]
  assert.equal(group.layers.length, 1)
  assert.ok(field(group.layers[0].find(s => s.id === 'd')!, '先行効果'))
})

test('壊れた依存を時間順として表示せず、効果を残して未確認状態を示す', () => {
  const source = skill('char_4009_irene', 1), stage = source.effectStructure.stages[0]
  for (const afterEffects of [['missing'], ['damage-2']]) {
    const changed = { ...source, effectStructure: { stages: [{ ...stage, effects: stage.effects.map((effect, index) => index ? effect : { ...effect, afterEffects }) }] } }
    const output = buildSkillEffectFlow(changed).stages[0]
    assert.ok(output.warnings?.length)
    assert.equal(output.groups[0].layers.length, 1)
    assert.equal(output.groups[0].layers[0].length, 3)
  }
})
