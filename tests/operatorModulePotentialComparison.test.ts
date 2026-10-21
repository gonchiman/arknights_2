import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOperatorModulePotentialComparison,
  buildOperatorModulePotentialTable,
  type OperatorModulePotentialTable,
  type OperatorModulePotentialTableCell,
} from '../src/lib/operatorModulePotentialComparison.ts'
import type { OperatorCombatProfile, RawOperatorModule, RawPotentialRank } from '../src/types/skill.ts'

const selections = { 'module-x': [1, 2, 3], 'module-y': [1, 2, 3] }
const layouts = ['columns', 'rows'] as const

test('潜在を昇順に正規化し、それぞれの累積補正・素質・MOD効果を独立して比較する', () => {
  const model = buildOperatorModulePotentialComparison(profile(), selections, [6, 1, 4, 6, 0, 7, NaN, 1.5])
  assert.deepEqual(model.selectedPotentials, [1, 4, 6])
  assert.deepEqual(model.potentialRanks, [1, 2, 3, 4, 5, 6])
  assert.equal(model.condition, '昇進2・潜在1・4・6')
  const attacks = model.comparisons.map((comparison) => comparison.rows.find((row) => row.id === 'potential-attribute:ATK')!)
  assert.deepEqual(attacks.map((row) => row.cells[0].comparisonValue), [0, 28, 28])
  assert.deepEqual(attacks.map((row) => row.cells[0].text), ['—', '+28', '+28'])
  assert.ok(attacks.every((row) => row.name === '潜在' && row.label === '攻撃力補正'))
  assert.ok(attacks[1].cells.every((cell) => cell.highlights!.segments[0].source === 'potential'))
  assert.deepEqual(model.comparisons.map((comparison) => comparison.rows.find((row) => row.id === 'potential-attribute:COST')!.cells[0].text), ['—', '-1', '-2'])
  assert.deepEqual(model.comparisons.map((comparison) => comparison.rows.find((row) => row.id === 'potential-attribute:RESPAWN_TIME')!.cells[0].text), ['—', '-4秒', '-4秒'])
  assert.deepEqual(model.comparisons.map((comparison) => comparison.rows.find((row) => row.id === 'attribute:atk')!.cells.map((cell) => cell.text)), [
    ['—', '+30', '+48', '+60', '+45', '+55', '+60'],
    ['—', '+30', '+48', '+60', '+45', '+55', '+60'],
    ['—', '+30', '+48', '+60', '+45', '+55', '+60'],
  ])
  assert.ok(model.comparisons.every((comparison) => comparison.rows.find((row) => row.id === 'attribute:atk')!.name === 'MOD'))
  assert.deepEqual(model.comparisons.map((comparison) => comparison.rows.find((row) => row.id === 'talent:0')!.cells[3].highlights!.current), [
    '術耐性を26無視', '術耐性を26無視', '術耐性を28無視',
  ])
})

test('4通りの行列配置で全選択候補・潜在補正・強調を欠落なく維持する', () => {
  const model = buildOperatorModulePotentialComparison(profile(), selections, [1, 6])
  const original = structuredClone(model)
  for (const levelLayout of layouts) for (const potentialLayout of layouts) {
    const table = buildOperatorModulePotentialTable(model, { levelLayout, potentialLayout, merge: false })
    assert.equal(table.columns.length, (levelLayout === 'columns' ? 7 : 3) * (potentialLayout === 'columns' ? 2 : 1))
    assert.deepEqual(table.rowAxes, [levelLayout === 'rows' ? 'level' : null, potentialLayout === 'rows' ? 'potential' : null].filter(Boolean))
    const attack = table.groups.find((group) => group.id === 'attribute:atk')!
    assert.equal(attack.rows.length, (levelLayout === 'rows' ? 3 : 1) * (potentialLayout === 'rows' ? 2 : 1))
    for (const comparison of model.comparisons) for (const row of comparison.rows) for (let index = 0; index < comparison.columns.length; index++) {
      const column = comparison.columns[index]
      const matching = table.groups.find((group) => group.id === row.id)!.rows.flatMap((entry) => entry.cells)
        .filter((entry) => entry?.sourceColumn.id === column.id && entry.potentialRanks.includes(comparison.potentialRank))
      assert.ok(matching.length, `${levelLayout}/${potentialLayout}: ${row.id}/${column.id}/${comparison.potentialRank}`)
      matching.forEach((entry) => assert.deepEqual(entry!.cell, row.cells[index]))
    }
  }
  assert.deepEqual(model, original)
})

test('共通化はMOD間を結合せず、選択した潜在とレベルを結合セルの出典へ保持する', () => {
  const model = buildOperatorModulePotentialComparison(profile(), selections, [1, 6])
  for (const levelLayout of layouts) for (const potentialLayout of layouts) {
    const full = buildOperatorModulePotentialTable(model, { levelLayout, potentialLayout, merge: false })
    const merged = buildOperatorModulePotentialTable(model, { levelLayout, potentialLayout, merge: true })
    assert.deepEqual(expandValues(merged), expandValues(full), `${levelLayout}/${potentialLayout}`)
    validateOccupancy(merged)
    for (const group of merged.groups) for (const row of group.rows) for (const cell of row.cells) {
      if (!cell) continue
      assert.ok(cell.potentialRanks.length > 0)
      if (cell.sourceColumn.id !== 'none') assert.ok(cell.sourceLevels.length > 0)
    }
    const moduleAttack = merged.groups.find((group) => group.id === 'attribute:atk')!
    assert.ok(moduleAttack.rows.flatMap((row) => row.cells).some((cell) => cell?.potentialRanks.length === 2))
  }
})

test('非対称の段階選択とデータ欠損は未選択・データなしを残し、欠損同士で結合しない', () => {
  const data = profile()
  data.modules![0].phases![1] = { equipLevel: 2 }
  const model = buildOperatorModulePotentialComparison(data, { 'module-x': [1, 2], 'module-y': [3] }, [1, 6])
  const table = buildOperatorModulePotentialTable(model, { levelLayout: 'rows', potentialLayout: 'columns', merge: true })
  const attack = table.groups.find((group) => group.id === 'attribute:atk')!
  assert.deepEqual(attack.rows.map((row) => row.levelLabel), ['1', '2', '3'])
  const missing = attack.rows.flatMap((row) => row.cells).filter((entry) => entry && ['未選択', 'データなし'].includes(entry.cell.text))
  assert.equal(missing.filter((entry) => entry!.cell.text === 'データなし').length, 2)
  assert.equal(missing.filter((entry) => entry!.cell.text === '未選択').length, 6)
  assert.ok(missing.every((entry) => entry!.colSpan === 1 && entry!.rowSpan === 1))
  validateOccupancy(table)
})

test('未装備のみ・潜在1種類・表示候補なし・潜在が存在しないオペレーターを扱う', () => {
  const data = profile()
  data.modules = []
  for (const potentialLayout of layouts) {
    const model = buildOperatorModulePotentialComparison(data, {}, [1, 6])
    const table = buildOperatorModulePotentialTable(model, { levelLayout: 'rows', potentialLayout, merge: true })
    assert.ok(!table.rowAxes.includes('level'))
    assert.equal(table.columns.length, potentialLayout === 'rows' ? 1 : 2)
    assert.ok(table.groups.flatMap((group) => group.rows.flatMap((row) => row.cells)).every((entry) => !entry || entry.sourceColumn.id === 'none'))
    validateOccupancy(table)
  }
  const single = buildOperatorModulePotentialComparison(data, {}, [4])
  assert.ok(buildOperatorModulePotentialTable(single, { levelLayout: 'columns', potentialLayout: 'rows', merge: true })
    .groups.every((group) => group.rows[0].potentialLabel === '4'))
  const empty = buildOperatorModulePotentialComparison(data, {}, [])
  assert.deepEqual(buildOperatorModulePotentialTable(empty, { levelLayout: 'rows', potentialLayout: 'columns', merge: true }).groups, [])
  const none = buildOperatorModulePotentialComparison(data, {}, [1, 6], false)
  assert.deepEqual(buildOperatorModulePotentialTable(none, { levelLayout: 'columns', potentialLayout: 'rows', merge: true }).columns, [])
  assert.deepEqual(buildOperatorModulePotentialComparison({ phases: [], favorKeyFrames: [] }, {}, [1, 6]).selectedPotentials, [1])
})

test('潜在で新たに表示される効果の行を揃え、低潜在で未解放の効果は補正なしとする', () => {
  const data = profile()
  data.modules![0].phases!.forEach((phase) => phase.parts!.push({ addOrOverrideTalentDataBundle: { candidates: [{
    isHideTalent: true, requiredPotentialRank: 5, name: '追加回復', upgradeDescription: '毎秒HPを100回復',
  }] } }))
  const table = buildOperatorModulePotentialTable(buildOperatorModulePotentialComparison(data, selections, [1, 6]), {
    levelLayout: 'columns', potentialLayout: 'rows', merge: false,
  })
  const extra = table.groups.find((group) => group.name === '追加回復')!
  assert.ok(extra)
  assert.deepEqual(extra.rows.map((row) => row.cells[1]!.cell.text), ['—', '毎秒HPを100回復'])
})

test('同じ表示文でも強調元・比較元・未丸め値が異なれば潜在間を結合しない', () => {
  for (const mutate of [
    (entry: OperatorModulePotentialTableCell['cell']) => { entry.highlights!.segments[0].source = 'module' },
    (entry: OperatorModulePotentialTableCell['cell']) => { entry.highlights!.base = '異なる基準' },
    (entry: OperatorModulePotentialTableCell['cell']) => { entry.comparisonValue = 28.00000000001 },
  ]) {
    const model = buildOperatorModulePotentialComparison(profile(), { 'module-x': [3], 'module-y': [] }, [4, 6], false)
    const cell = model.comparisons[1].rows.find((row) => row.id === 'potential-attribute:ATK')!.cells[0]
    mutate(cell)
    for (const potentialLayout of layouts) {
      const table = buildOperatorModulePotentialTable(model, { levelLayout: 'columns', potentialLayout, merge: true })
      const attack = table.groups.find((group) => group.id === 'potential-attribute:ATK')!
      assert.equal(attack.rows.flatMap((row) => row.cells).filter(Boolean).length, 2)
    }
  }
})

test('未対応の潜在補正は加算値として扱わず、原文を残して共通化しない', () => {
  const data = profile()
  data.potentialRanks![0] = { description: '防御力が20%上昇', buff: { attributes: { attributeModifiers: [{ attributeType: 'DEF', formulaItem: 'MULTIPLICATION', value: 1.2 }] } } }
  const model = buildOperatorModulePotentialComparison(data, {}, [2, 6])
  assert.ok(model.comparisons.every((comparison) => comparison.rows.find((row) => row.id === 'potential-attribute:DEF')!.cells[0].comparisonValue === null))
  const table = buildOperatorModulePotentialTable(model, { levelLayout: 'columns', potentialLayout: 'rows', merge: true })
  const bonus = table.groups.find((group) => group.id === 'potential-attribute:DEF')!
  assert.equal(bonus.rows.length, 2)
  assert.ok(bonus.rows.every((row) => row.cells.every((entry) => entry?.cell.text === '防御力が20%上昇')))
})

test('潜在効果の説明行を省き、通常の素質行・MOD能力値・潜在能力補正を保つ', () => {
  const data = profile()
  data.potentialRanks![3] = { description: '<@ba.kw>独自の効果</>\\nが強化される' }
  const model = buildOperatorModulePotentialComparison(data, selections, [1, 4, 6])
  assert.ok(model.comparisons.every((comparison) => comparison.rows.every((row) => !row.id.startsWith('potential-effect:'))))
  assert.deepEqual(model.comparisons.map((comparison) => comparison.rows.find((row) => row.id === 'talent:0')!.cells[0].text), [
    '術耐性を20無視', '術耐性を20無視', '術耐性を22無視',
  ])
  for (const levelLayout of layouts) for (const potentialLayout of layouts) {
    const table = buildOperatorModulePotentialTable(model, { levelLayout, potentialLayout, merge: true })
    assert.ok(table.groups.every((group) => group.label !== '潜在効果'))
    for (const id of ['talent:0', 'talent:1', 'trait', 'attribute:atk', 'potential-attribute:ATK']) {
      assert.ok(table.groups.some((group) => group.id === id), `${levelLayout}/${potentialLayout}: ${id}`)
    }
  }
})

test('MOD属性の表示が丸めで一致しても元の値が違う段階を統合しない', () => {
  const data = profile()
  data.modules![0].phases![0].attributeBlackboard = [{ key: 'ATK', value: 10.00001 }]
  data.modules![0].phases![1].attributeBlackboard = { atk: 10.00002 }
  const model = buildOperatorModulePotentialComparison(data, { 'module-x': [1, 2], 'module-y': [] }, [1, 6], false)
  const cells = model.comparisons[0].rows.find((row) => row.id === 'attribute:atk')!.cells
  assert.deepEqual(cells.map((cell) => cell.text), ['+10', '+10'])
  assert.deepEqual(cells.map((cell) => cell.comparisonValue), [10.00001, 10.00002])
  for (const potentialLayout of layouts) {
    const table = buildOperatorModulePotentialTable(model, { levelLayout: 'rows', potentialLayout, merge: true })
    const row = table.groups.find((group) => group.id === 'attribute:atk')!
    assert.deepEqual(row.rows.map((row) => row.levelLabel), ['1', '2'])
    assert.ok(row.rows.every((row) => row.cells.every((entry) => !entry || entry.rowSpan === 1)))
  }
})

test('両軸が行のとき、斜めに隣接するだけの同じ値を共通として結合しない', () => {
  const model = buildOperatorModulePotentialComparison(profile(), { 'module-x': [1, 2], 'module-y': [] }, [1, 6], false)
  model.comparisons.forEach((comparison, index) => { comparison.rows = [{
    id: 'probe', label: '検証', kind: 'extra', cells: (index === 0 ? ['異なる', '共通値'] : ['共通値', '別の値']).map((text) => ({ text, baseline: null })),
  }] })
  const table = buildOperatorModulePotentialTable(model, { levelLayout: 'rows', potentialLayout: 'rows', merge: true })
  assert.deepEqual(table.groups[0].rows.map((row) => row.cells[0]!.rowSpan), [1, 1, 1, 1])
})

/** Compare source coordinates so collapsing rows/columns cannot hide a missing or altered value. */
function expandValues(table: OperatorModulePotentialTable) {
  const values = new Map<string, unknown>()
  for (const group of table.groups) for (const row of group.rows) for (const entry of row.cells) {
    if (!entry) continue
    for (const potential of entry.potentialRanks) for (const level of entry.sourceLevels.length ? entry.sourceLevels : [null]) {
      const id = entry.sourceColumn.id.replace(/:lv\d+$/, '')
      values.set(`${group.id}|${id}|${level}|${potential}`, entry.cell)
    }
  }
  return [...values].sort(([a], [b]) => a.localeCompare(b))
}

function validateOccupancy(table: OperatorModulePotentialTable) {
  for (const group of table.groups) {
    const occupied = group.rows.map(() => table.columns.map(() => 0))
    group.rows.forEach((row, rowIndex) => row.cells.forEach((cell, columnIndex) => {
      if (!cell) return
      for (let y = rowIndex; y < rowIndex + cell.rowSpan; y++) for (let x = columnIndex; x < columnIndex + cell.colSpan; x++) {
        assert.ok(occupied[y] && occupied[y][x] !== undefined, 'span stays in table')
        occupied[y][x] += 1
      }
    }))
    assert.ok(occupied.every((row) => row.every((count) => count === 1)), `each coordinate exactly once: ${group.id}`)
  }
}

function profile(): OperatorCombatProfile {
  const bonus = (attributeType: string, value: number, description: string): RawPotentialRank => ({
    description, buff: { attributes: { attributeModifiers: [{ attributeType, formulaItem: 'ADDITION', value }] } },
  })
  return {
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90 }], favorKeyFrames: [], traitDescription: '敵に術ダメージを与える',
    potentialRanks: [bonus('COST', -1, 'コスト-1'), bonus('RESPAWN_TIME', -4, '再配置時間-4秒'), bonus('ATK', 28, '攻撃力+28'), { description: '素質強化' }, bonus('COST', -1, 'コスト-1')],
    talents: [{ candidates: [
      { name: '劫火', description: '術耐性を20無視', requiredPotentialRank: 0 },
      { name: '劫火', description: '術耐性を22無視', requiredPotentialRank: 4 },
    ] }, { candidates: [{ name: '余燼', description: '効果発動から8秒後退場' }] }],
    modules: [module('X'), module('Y')],
  }
}

function module(type: 'X' | 'Y'): RawOperatorModule {
  return {
    uniEquipId: `module-${type.toLowerCase()}`, uniEquipName: `名前${type}`, type: 'ADVANCED', typeName1: 'AFT', typeName2: type,
    phases: [1, 2, 3].map((level) => ({
      equipLevel: level,
      attributeBlackboard: { atk: (type === 'X' ? [30, 48, 60] : [45, 55, 60])[level - 1] },
      parts: [
        { overrideTraitDataBundle: { candidates: [{ additionalDescription: type === 'X' ? '未ブロック時攻撃速度+8' : 'ブロック中の敵に対術脆弱10%' }] } },
        ...(type === 'X' ? [{ addOrOverrideTalentDataBundle: { candidates: [
          { talentIndex: 0, name: '劫火', upgradeDescription: `術耐性を${[20, 24, 26][level - 1]}無視`, requiredPotentialRank: 0 },
          { talentIndex: 0, name: '劫火', upgradeDescription: `術耐性を${[22, 26, 28][level - 1]}無視`, requiredPotentialRank: 4 },
        ] } }] : []),
      ],
    })),
  }
}
