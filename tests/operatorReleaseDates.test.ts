import test from 'node:test'
import assert from 'node:assert/strict'
import { OPERATOR_RELEASE_DATES_JP, getOperatorReleaseDateJp } from '../src/lib/operatorReleaseDates.ts'

test('実装日はIDが一意で、実在する暦日と根拠URLを持つ', () => {
  const ids = new Set<string>()
  for (const entry of OPERATOR_RELEASE_DATES_JP) {
    assert.match(entry.operatorId, /^char_\d+_[a-z0-9]+$/)
    assert.ok(!ids.has(entry.operatorId), entry.operatorId)
    ids.add(entry.operatorId)
    assert.match(entry.releaseDateJp, /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(new Date(`${entry.releaseDateJp}T00:00:00Z`).toISOString().slice(0, 10), entry.releaseDateJp)
    assert.ok(entry.releaseDateJp >= '2020-01-16')
    assert.equal(new URL(entry.sourceUrl).protocol, 'https:')
    assert.equal(getOperatorReleaseDateJp(entry.operatorId), entry.releaseDateJp)
  }
  assert.equal(getOperatorReleaseDateJp('char_missing'), null)
})

test('初期実装・コラボ・通常実装の日付を日本版の初登場日として保持する', () => {
  assert.equal(getOperatorReleaseDateJp('char_002_amiya'), '2020-01-16')
  assert.equal(getOperatorReleaseDateJp('char_456_ash'), '2021-08-18')
  assert.equal(getOperatorReleaseDateJp('char_350_surtr'), '2021-03-25')
  assert.equal(getOperatorReleaseDateJp('char_4009_irene'), '2022-11-03')
})
