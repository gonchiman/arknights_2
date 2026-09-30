import assert from 'node:assert/strict'
import test from 'node:test'
import { lockPageScroll } from '../src/lib/pageScrollLock.ts'

test('nested modals keep scrolling locked until both close, in either order', () => {
  for (const order of [[1, 0], [0, 1]]) {
    const root = { style: { overflow: 'auto' } }
    const release = [lockPageScroll(root), lockPageScroll(root)]
    assert.equal(root.style.overflow, 'hidden')
    release[order[0]]()
    assert.equal(root.style.overflow, 'hidden')
    release[order[1]]()
    assert.equal(root.style.overflow, 'auto')
  }
})

test('duplicate cleanup is safe and reopening captures the current style', () => {
  const root = { style: { overflow: '' } }
  const release = lockPageScroll(root)
  release()
  assert.equal(root.style.overflow, '')
  root.style.overflow = 'scroll'
  const releaseAgain = lockPageScroll(root)
  release()
  assert.equal(root.style.overflow, 'hidden')
  releaseAgain()
  assert.equal(root.style.overflow, 'scroll')
})

test('different roots and an existing scroll lock are preserved independently', () => {
  const first = { style: { overflow: 'hidden' } }
  const second = { style: { overflow: 'auto' } }
  const releaseFirst = lockPageScroll(first)
  const releaseSecond = lockPageScroll(second)
  releaseFirst()
  assert.equal(first.style.overflow, 'hidden')
  assert.equal(second.style.overflow, 'hidden')
  releaseSecond()
  assert.equal(second.style.overflow, 'auto')
})
