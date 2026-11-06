import assert from 'node:assert/strict'
import test from 'node:test'
import { EXPANDED_OPERATOR_SOURCES } from '../src/lib/expandedCombatRegistry.ts'
import { evaluateTraitStructure } from '../src/lib/traitCombatEvaluation.ts'
import { buildTraitStructures } from '../src/lib/traitStructure.ts'

test('執行者の再配置時間と鉤縄師の配置・強制移動の特性を原資料から区別する', () => {
  const sources = EXPANDED_OPERATOR_SOURCES.filter(source => ['executor', 'hookmaster'].includes(source.subProfessionId))
  assert.equal(sources.length, 13)
  for (const source of sources) {
    const { profile: operatorProfile, phaseIndex } = source
    const [structure] = buildTraitStructures([{
      ...source, operatorProfile, professionLabel: source.profession, subProfessionName: source.subProfessionId,
    }], { phaseIndex })
    assert.equal(structure.status, 'STRUCTURED', source.operatorName)
    assert.deepEqual(structure.issues, [], source.operatorName)
    const effects = structure.effects.map(effect => [effect.item, effect.value])
    if (source.subProfessionId === 'executor') {
      assert.deepEqual(effects, [['REDEPLOY_TIME', source.operatorId === 'char_1502_crosly' ? 22 : 18]], source.operatorName)
    } else {
      assert.deepEqual(effects, [['FORCED_MOVEMENT_SKILL_ENABLED', true], ['HIGH_GROUND_DEPLOYMENT_ENABLED', true]], source.operatorName)
    }
    const output = evaluateTraitStructure(structure, { kind: 'NORMAL', metrics: {} })
    assert.deepEqual(output.blockers, [], source.operatorName)
    assert.equal(output.attackScale, 1, source.operatorName)
    assert.ok(output.evaluations.every(row => row.status === 'NOT_RELEVANT'), source.operatorName)
  }
})
