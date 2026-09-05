import test from 'node:test'
import assert from 'node:assert/strict'
import { convertSkillDescription } from '../src/lib/skillDescriptionEffects.ts'

function values(description: string, key: string) {
  return convertSkillDescription(description).effects.filter((effect) => effect.key === key).map((effect) => effect.value)
}

test('元素ダメージも攻撃力基準の倍率と種別に分ける', () => {
  const result = convertSkillDescription('攻撃力の{scale:0%}の元素ダメージを与える', [{ key: 'scale', value: 0.5 }])
  assert.deepEqual(result.effects.map(({ key, value, sourceKey }) => ({ key, value, sourceKey })), [
    { key: 'attackDamageMultiplier', value: 0.5, sourceKey: 'scale' },
    { key: 'damageType', value: 'elemental', sourceKey: null },
  ])
})

test('防御力・最大HP・現在HP基準を攻撃力基準と区別する', () => {
  assert.deepEqual(values('自身の防御力の30%の物理ダメージで敵に反撃する', 'defenseDamageMultiplier'), [0.3])
  const hp = convertSkillDescription('対象の現在HPの6%の術ダメージを与える。自身の最大HPの40%の確定ダメージを与える')
  assert.deepEqual(hp.effects.filter(({ unit }) => unit === 'fraction').map(({ key, value }) => [key, value]), [
    ['currentHpDamageRatio', 0.06], ['maxHpDamageRatio', 0.4],
  ])
  assert.equal(hp.effects.some(({ key }) => key === 'attackDamageMultiplier'), false)
  assert.deepEqual(values('治療量の100%の術ダメージを与える', 'healingDamageMultiplier'), [1])
})

test('最低保証ダメージを通常の倍率と区別する', () => {
  assert.deepEqual(values('必ず自身の攻撃力の500%以上の術ダメージを与える', 'minimumAttackDamageMultiplier'), [5])
  assert.deepEqual(values('必ず自身の攻撃力の500%以上の術ダメージを与える', 'attackDamageMultiplier'), [])
})

test('数値の固定ダメージを倍率として扱わない', () => {
  const result = convertSkillDescription('自身は20の術ダメージを受ける。敵全員に5000確定ダメージを与える')
  assert.deepEqual(result.effects.filter(({ key }) => key === 'damageAmount').map(({ value, unit }) => [value, unit]), [[20, 'damage'], [5000, 'damage']])
  assert.equal(result.effects.some(({ key }) => key === 'attackDamageMultiplier'), false)
})

test('毎秒・秒ごとのダメージは間隔と一回あたりの量を保持する', () => {
  const result = convertSkillDescription('3秒間毎秒200の術ダメージを与える。0.5秒ごとにインディゴの攻撃力の10%の術ダメージを与える')
  assert.deepEqual(result.effects.filter(({ key }) => key === 'damageIntervalSeconds').map(({ value }) => value), [1, 0.5])
  assert.deepEqual(result.effects.filter(({ key }) => key === 'damageDurationSeconds').map(({ value }) => value), [3])
  assert.deepEqual(result.effects.filter(({ key }) => key === 'attackDamageMultiplier').map(({ value }) => value), [0.1])
  assert.deepEqual(result.effects.filter(({ key }) => key === 'damageAmount').map(({ value }) => value), [200])
})

test('継続ダメージの間隔と量の出典をそれぞれ追跡する', () => {
  const result = convertSkillDescription('{tick}秒ごとに攻撃力の{scale:0%}の術ダメージを与える', [{ key: 'tick', value: 0.5 }, { key: 'scale', value: 0.2 }])
  assert.equal(result.effects.find(({ key }) => key === 'damageIntervalSeconds')?.sourceKey, 'tick')
  assert.equal(result.effects.find(({ key }) => key === 'attackDamageMultiplier')?.sourceKey, 'scale')
  assert.equal(result.effects.find(({ key }) => key === 'damageType')?.sourceKey, null)
})

test('回復・弾薬消費の間隔を後続ダメージの発生間隔にしない', () => {
  for (const text of [
    '1秒ごとにHPを10回復し、スキル終了時に攻撃力の100%の術ダメージを与える',
    '0.5秒ごとに弾薬を1発消費して敵をロックオンし、スキル終了時に攻撃力の210%の物理ダメージを与える',
    '1秒ごとに攻撃力が100%上昇。攻撃力の200%の術ダメージを与える',
  ]) assert.deepEqual(values(text, 'damageIntervalSeconds'), [])
})

test('元素損傷の割合は明記された基準を区別する', () => {
  assert.deepEqual(values('攻撃力の20%の神経損傷を与える', 'neuralBuildupAttackRatio'), [0.2])
  assert.deepEqual(values('術ダメージの30%の灼熱損傷を与える', 'burnBuildupArtsDamageRatio'), [0.3])
  assert.deepEqual(values('与ダメージの10%の壊死損傷を与える', 'necrosisBuildupDamageRatio'), [0.1])
  assert.deepEqual(values('対象に10%の神経損傷を与える', 'neuralBuildupAttackRatio'), [])
})

for (const [type, key] of [
  ['スタン', 'stun'], ['足止め', 'slow'], ['バインド', 'bind'], ['寒冷', 'cold'], ['凍結', 'freeze'],
  ['浮遊', 'levitate'], ['睡眠', 'sleep'], ['沈黙', 'silence'], ['恐怖', 'fear'], ['戦慄', 'tremble'],
]) {
  test(`${type}の明記された時間を解析する`, () => {
    assert.deepEqual(values(`対象を2.5秒間${type}状態にする`, `${key}DurationSeconds`), [2.5])
    assert.deepEqual(values(`${type}状態を3秒間付与する`, `${key}DurationSeconds`), [3])
  })
}

test('制御の持続時間と順次適用される時間を保持する', () => {
  assert.deepEqual(values('足止めの効果時間が1.5秒になる', 'slowDurationSeconds'), [1.5])
  const result = convertSkillDescription('以下の効果を順番に繰り返し与える:足止め1秒/バインド2秒/スタン3秒')
  assert.deepEqual(result.effects.map(({ key, value }) => [key, value]), [['slowDurationSeconds', 1], ['bindDurationSeconds', 2], ['stunDurationSeconds', 3]])
  assert.ok(result.effects.every(({ context }) => context?.includes('順番')))
})

test('一部特殊能力の無効化は沈黙の時間として保持する', () => {
  const result = convertSkillDescription('攻撃対象の一部の特殊能力を{duration}秒間無効化する', [{ key: 'duration', value: 5 }])
  assert.equal(result.effects.find(({ key }) => key === 'silenceDurationSeconds')?.sourceKey, 'duration')
  assert.deepEqual(values('攻撃対象の一部の特殊能力を5秒間無効化する', 'silenceDurationSeconds'), [5])
})

test('通常攻撃の倍率と連撃数を両方保持する', () => {
  const result = convertSkillDescription('通常攻撃が攻撃力の{scale:0%}での{hits}回連続術攻撃になり', [{ key: 'scale', value: 0.6 }, { key: 'hits', value: 3 }])
  assert.equal(result.effects.find(({ key }) => key === 'attackDamageMultiplier')?.value, 0.6)
  assert.equal(result.effects.find(({ key }) => key === 'hitsPerAttack')?.value, 3)
  assert.equal(result.effects.find(({ key }) => key === 'hitsPerAttack')?.sourceKey, 'hits')
})

test('通常攻撃の連撃の表記ゆれに対応する', () => {
  for (const text of ['通常攻撃が特殊な3連撃になる', '通常攻撃が対象に攻撃力の100%の物理ダメージを与える3連撃になり', '次の通常攻撃が攻撃力120%の3連撃になる', '通常攻撃が3連撃となり']) {
    assert.deepEqual(values(text, 'hitsPerAttack'), [3])
  }
  assert.deepEqual(values('通常攻撃が2回攻撃になり', 'hitsPerAttack'), [2])
  assert.deepEqual(values('通常攻撃が敵に2回ダメージを与え', 'hitsPerAttack'), [2])
})

test('次の通常攻撃と単発スキルの連続攻撃を区別する', () => {
  assert.deepEqual(values('次の通常攻撃時、敵に2回連続で攻撃力の110%の術ダメージを与える', 'hitsPerAttack'), [2])
  assert.deepEqual(values('敵全員に2回連続で攻撃力の110%の術ダメージを与える', 'attackSequenceHitCount'), [2])
  assert.deepEqual(values('敵全員に2回連続で攻撃力の110%の術ダメージを与える', 'hitsPerAttack'), [])
  assert.deepEqual(values('攻撃力の108%の5回連続攻撃を行い', 'attackSequenceHitCount'), [5])
  assert.deepEqual(values('3回連続で攻撃する', 'attackSequenceHitCount'), [3])
})

test('ダメージ回数は一つの攻撃かスキル中の連続攻撃かを区別する', () => {
  assert.deepEqual(values('次の通常攻撃時、敵に攻撃力の90%の術ダメージを2回与える', 'hitsPerAttack'), [2])
  assert.deepEqual(values('敵に攻撃力の120%の術ダメージを10回与える', 'attackSequenceHitCount'), [10])
  assert.deepEqual(values('攻撃時に最大3体の敵に攻撃力の150%の術ダメージを3回与える', 'hitsPerAttack'), [3])
})

test('砲撃・斬撃の回数は通常攻撃のヒット数と区別する', () => {
  assert.deepEqual(values('その後素早く8回砲撃を行い', 'bombardmentCount'), [8])
  assert.deepEqual(values('敵を対象に合計10回の斬撃を発動', 'slashCount'), [10])
  assert.deepEqual(values('その後素早く8回砲撃を行い', 'hitsPerAttack'), [])
  assert.deepEqual(values('斬撃回数が3回になり', 'slashCount'), [3])
  assert.deepEqual(values('敵に1回反撃を行う', 'counterattackHitCount'), [1])
})

test('攻撃対象と跳躍の最大対象数を区別する', () => {
  for (const text of ['最大3体の敵を同時に攻撃できる', '同時に最大3体の敵を攻撃する', '攻撃目標数最大3体の2連撃になる', '最大3体の地上の敵に攻撃力の150%の術ダメージを与える', '敵最大3体に0.5秒ごとに攻撃力の30%の術ダメージを与える']) {
    assert.deepEqual(values(text, 'targetCount'), [3])
  }
  assert.deepEqual(values('跳躍の最大対象数が4体になる', 'chainTargetCount'), [4])
  assert.deepEqual(values('通常攻撃がブロックされている敵のみを選択し、2体を同時に攻撃する', 'targetCount'), [2])
  assert.deepEqual(values('ランダムで攻撃範囲内の敵最大3体を攻撃', 'targetCount'), [3])
})

test('追加攻撃対象と状態付与の対象数は通常攻撃対象数と区別する', () => {
  assert.deepEqual(values('追加で敵1体を攻撃する', 'targetCountBonus'), [1])
  assert.deepEqual(values('追加で敵1体を攻撃する', 'targetCount'), [])
  assert.deepEqual(values('追加で空中にいる敵を2体攻撃する', 'additionalAirborneTargetCount'), [2])
  assert.deepEqual(values('敵最大2体に7秒間睡眠させる', 'sleepTargetCount'), [2])
  assert.deepEqual(values('敵最大2体に7秒間睡眠させる', 'targetCount'), [])
})

test('与ダメージの増減・最終倍率・徐々に達する上限を区別する', () => {
  assert.deepEqual(values('物理の与ダメージ+30%', 'physicalDamageDealtBonusRatio'), [0.3])
  assert.deepEqual(values('与ダメージが30%上昇する', 'damageDealtBonusRatio'), [0.3])
  assert.deepEqual(values('与ダメージが130%まで上昇', 'damageDealtMultiplier'), [1.3])
  assert.deepEqual(values('与える術ダメージが130%まで上昇', 'artsDamageDealtMultiplier'), [1.3])
  assert.deepEqual(values('与ダメージが2倍になり', 'damageDealtMultiplier'), [2])
  assert.deepEqual(values('同一対象への与ダメージは徐々に3倍まで上昇', 'maximumDamageDealtMultiplier'), [3])
  assert.deepEqual(values('同一対象への与ダメージは徐々に3倍まで上昇', 'damageDealtMultiplier'), [])
})

test('余震・最終打撃の倍率は一般の攻撃倍率と区別する', () => {
  assert.deepEqual(values('余震のダメージが攻撃力の60%になる', 'aftershockAttackDamageMultiplier'), [0.6])
  assert.deepEqual(values('最後の一撃のダメージ係数は2倍', 'lastHitDamageMultiplier'), [2])
  assert.deepEqual(values('攻撃力のダメージ計算係数倍増', 'damageCoefficientMultiplier'), [2])
  assert.deepEqual(values('攻撃対象の周囲の敵に半分のダメージを与える', 'secondaryDamageMultiplier'), [0.5])
})

test('追加ヒット数から攻撃倍率や総ヒット数を推測しない', () => {
  assert.deepEqual(values('ダメージ発生回数+1', 'damageHitCountBonus'), [1])
  assert.deepEqual(values('追加でもう1回ダメージを与える', 'damageHitCountBonus'), [1])
  assert.deepEqual(values('追加でさらに2回ダメージを与える', 'damageHitCountBonus'), [2])
  assert.deepEqual(values('ダメージ発生回数+1%', 'damageHitCountBonus'), [])
})

test('条件文にいる敵や撃破数から攻撃対象数を推測しない', () => {
  for (const text of ['攻撃対象が1体のみの場合、攻撃力+100%', '敵を3体倒すごとに攻撃力+10%', '敵3体にのみ罠が命中した場合、効果が倍増', '味方3人を同時に治療する']) {
    assert.deepEqual(values(text, 'targetCount'), [])
  }
})

test('曖昧な数値・数式・無効化・否定を時間とヒット数にしない', () => {
  for (const text of ['約3秒間スタンさせる', '1～3秒間足止めする', '1/2秒間バインドする', '3秒間寒冷状態にしない', '3秒間凍結耐性を得る', '数秒間浮遊させる']) {
    assert.equal(convertSkillDescription(text).effects.some(({ key }) => /DurationSeconds$/.test(key)), false, text)
  }
  for (const text of ['通常攻撃が2.5連撃になる', '1/2回連続で攻撃力の100%の術ダメージを与える', '通常攻撃が3連撃にならない']) {
    assert.deepEqual(values(text, 'hitsPerAttack'), [], text)
    assert.deepEqual(values(text, 'attackSequenceHitCount'), [], text)
  }
})

test('未解決の数値や由来不明の倍率を補完しない', () => {
  const result = convertSkillDescription('攻撃力の{scale:0%}の元素ダメージを与え、{time}秒間バインドする')
  assert.deepEqual(result.effects, [])
  assert.deepEqual(result.unresolvedPlaceholders, ['{scale:0%}', '{time}'])
  assert.deepEqual(values('敵に200%の物理ダメージを与える', 'attackDamageMultiplier'), [])
})

test('余震の追加回数を攻撃ヒット数と区別する', () => {
  assert.deepEqual(values('余震がさらに2回発生する', 'aftershockCountBonus'), [2])
  assert.deepEqual(values('次の通常攻撃は余震がさらに2回発生し', 'aftershockCountBonus'), [2])
  assert.deepEqual(values('次の通常攻撃は余震がさらに2回発生し', 'hitsPerAttack'), [])
})

test('弾薬の所持数と攻撃ごとの消費数を独立して保持する', () => {
  for (const text of ['装弾数が20発になる', '弾薬数は20発', '合計20発の弾薬が尽きるとスキルが終了']) {
    assert.deepEqual(values(text, 'skillAmmoCount'), [20])
  }
  const result = convertSkillDescription('通常攻撃が敵に2回ダメージを与え、攻撃するたびに水弾が2発消費され、合計32発の水弾を撃ち切るとスキルが終了')
  assert.equal(result.effects.find(({ key }) => key === 'hitsPerAttack')?.value, 2)
  assert.equal(result.effects.find(({ key }) => key === 'ammoConsumedPerAttack')?.value, 2)
  assert.equal(result.effects.find(({ key }) => key === 'skillAmmoCount')?.value, 32)
  assert.deepEqual(values('攻撃するたびに弾薬が5発消費される', 'ammoConsumedPerAttack'), [5])
})

test('弾薬補充の数値の由来を維持し総弾数にしない', () => {
  const result = convertSkillDescription('{ammo}発の弾薬を追加で獲得', [{ key: 'ammo', value: 2 }])
  assert.deepEqual(result.effects.map(({ key, value, sourceKey }) => [key, value, sourceKey]), [['ammoRecoveryCount', 2, 'ammo']])
  assert.deepEqual(values('さらに弾薬を1発補充', 'ammoRecoveryCount'), [1])
  assert.deepEqual(values('追加で弾薬を5発獲得する', 'ammoRecoveryCount'), [5])
})

test('投擲物と矢の数をヒット数に換算しない', () => {
  assert.deepEqual(values('同時に3個の旋回投擲物を放つ', 'rotatingProjectileCount'), [3])
  assert.deepEqual(values('攻撃時に旋回投擲物を追加で1個放つ', 'rotatingProjectileCountBonus'), [1])
  assert.deepEqual(values('攻撃するたびに矢を2本放ち', 'arrowsPerAttack'), [2])
  assert.deepEqual(values('攻撃するたびに矢を2本放ち', 'hitsPerAttack'), [])
})

test('跳躍回数・攻撃回数・前方への斬撃を別の項目に保持する', () => {
  assert.deepEqual(values('攻撃の最大跳躍回数が5になる', 'maximumChainCount'), [5])
  assert.deepEqual(values('攻撃の回数が3回になる', 'attackSequenceHitCount'), [3])
  assert.deepEqual(values('前方に7回斬撃を繰り出し', 'slashCount'), [7])
  assert.deepEqual(values('攻撃の最大跳躍回数が5になる', 'targetCount'), [])
})

test('脆弱と加護は記述上の効果値を保持しダメージ倍率を推測しない', () => {
  assert.deepEqual(values('15%の脆弱状態を付与する', 'vulnerabilityRatio'), [0.15])
  assert.deepEqual(values('20%の加護を獲得し', 'shelterRatio'), [0.2])
  assert.deepEqual(values('30%の加護状態を獲得し', 'shelterRatio'), [0.3])
  assert.deepEqual(values('10%の【対術脆弱】を付与する', 'artsVulnerabilityRatio'), [0.1])
  assert.deepEqual(values('15%の脆弱状態を付与する', 'damageDealtMultiplier'), [])
  assert.deepEqual(values('30%の加護状態を獲得し', 'damageTakenReductionRatio'), [])
})

test('効果値と状態の持続時間に別々の出典を付ける', () => {
  const result = convertSkillDescription('{ratio:0%}の脆弱状態を{time}秒間付与', [{ key: 'ratio', value: 0.2 }, { key: 'time', value: 5 }])
  assert.equal(result.effects.find(({ key }) => key === 'vulnerabilityRatio')?.sourceKey, 'ratio')
  assert.equal(result.effects.find(({ key }) => key === 'vulnerabilityDurationSeconds')?.sourceKey, 'time')
  assert.deepEqual(values('10秒間100%の脆弱状態を付与する', 'vulnerabilityDurationSeconds'), [10])
  assert.deepEqual(values('1秒のレジスト状態を付与する', 'resistDurationSeconds'), [1])
})

test('弾薬や状態効果の曖昧な値・否定は未解析に残す', () => {
  for (const text of ['装弾数が最大になる', '残り全ての弾薬を発射する', '同量の弾薬を獲得する', '装弾数が2.5発になる', '約20発の弾薬を追加で獲得する', '10～20%の脆弱状態を付与する', '20%の加護を獲得しない']) {
    assert.equal(convertSkillDescription(text).effects.some(({ key }) => /^(?:skillAmmoCount|ammoRecoveryCount|vulnerabilityRatio|shelterRatio)$/.test(key)), false, text)
  }
})
