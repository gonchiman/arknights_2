import test from 'node:test'
import assert from 'node:assert/strict'
import { getNativeMethodGuide, isGuideBlockVisible } from '../src/lib/nativeMethodGuide.ts'
import { formatNativeBody, type NativeSummary } from '../src/lib/nativeAnalysis.ts'

const summary: NativeSummary = {
  datHash: 'ed15e36e1d19d942aa0a2d51d57fbe8cb4fcbb6c21110d1d374a4116f480e846',
  dllHash: 'e74963e39d7cc85b48a02ad1fdcc57dee796489991ad5c3cb867123c9c5214a6',
  datName: 'global-metadata.dat', dllName: 'GameAssembly.dll', modules: [], symbolCount: 1,
  methods: [{ id: 72172, name: 'DealHitTarget', owner: 'Torappu.Battle.Projectiles.GdglowHitBehaviour', token: 100735469, module: 'Assembly-CSharp.dll', rva: 0x972640, offset: 0x971640, autoChess: false }],
}

test('reviewed explanations require the exact binary pair and matching method ownership', () => {
  assert.ok(getNativeMethodGuide(summary, 0x972640))
  for (const change of [{ datHash: 'different' }, { dllHash: 'different' }, { methods: [] }, { methods: [{ ...summary.methods[0], owner: 'Other' }] }, { methods: [{ ...summary.methods[0], rva: 0x972641 }] }]) {
    assert.equal(getNativeMethodGuide({ ...summary, ...change }, 0x972640), null)
  }
})

test('continuations retain the guide but other methods and padding do not', () => {
  assert.ok(getNativeMethodGuide(summary, 0x9726BC))
  assert.ok(getNativeMethodGuide(summary, 0x972943))
  for (const rva of [0x97263F, 0x972965, 0x972970, 0x18960A0]) assert.equal(getNativeMethodGuide(summary, rva), null)
  const guide = getNativeMethodGuide(summary, 0x972640)!
  const visible = guide.blocks.filter(block => isGuideBlockVisible(block, [0x97278B, 0x97278D]))
  assert.deepEqual(visible.map(block => block.title), ['抽選結果で進む先を分ける'])
  assert.equal(guide.blocks.filter(block => isGuideBlockVisible(block, [0x97295F])).length, 0)
})

test('copied analysis retains evidence and separates the explosion hypothesis', () => {
  const body = { rva: 0x972640, offset: 0x971640, names: [], range: '', warnings: [], instructions: [] }
  const text = formatNativeBody(summary, body)
  assert.match(text, /推測：自爆/)
  assert.match(text, /0x972781/)
  assert.match(text, /敵を倒せるかの判定ではなく/)
  assert.doesNotMatch(formatNativeBody({ ...summary, dllHash: 'different' }, body), /推測：自爆/)
})
