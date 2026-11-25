import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { loadTdRecentOperatorIds, rememberTdOperator } from '../src/lib/tdRecentOperators.ts'

const key = 'arknights-td-recent-operator-ids-v1'

function useStorage(t: TestContext, values = new Map<string, string>()) {
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } })
  t.after(() => { Reflect.deleteProperty(globalThis, 'window') })
  return storage
}

test('TD history has its own key and tolerates malformed or mixed stored values', t => {
  const values = new Map([['arknights-recent-operator-ids-v1', '["search"]']])
  useStorage(t, values)
  for (const invalid of ['', '{', 'null', '{}']) {
    values.set(key, invalid)
    assert.deepEqual(loadTdRecentOperatorIds(), [])
  }
  values.set(key, '[null," a ",2,"a","","b"]')
  assert.deepEqual(loadTdRecentOperatorIds(), ['a', 'b'])
  assert.deepEqual(rememberTdOperator('c', []), ['c', 'a', 'b'])
  assert.equal(values.get('arknights-recent-operator-ids-v1'), '["search"]')
})

test('recording a placement refreshes storage and retains the six most recent distinct operators', t => {
  const values = new Map([[key, '["g","f","e","d","c","b"]']])
  useStorage(t, values)
  const next = rememberTdOperator('c', ['a', 'b'])
  assert.deepEqual(next, ['c', 'g', 'f', 'e', 'd', 'b'])
  assert.deepEqual(rememberTdOperator('h', next), ['h', 'c', 'g', 'f', 'e', 'd'])
  assert.deepEqual(loadTdRecentOperatorIds(), ['h', 'c', 'g', 'f', 'e', 'd'])
})

test('repeated failed writes keep new placements available and recover when saving resumes', t => {
  const storage = useStorage(t, new Map([[key, '["f","e","d","c","b","a"]']]))
  const blocked = t.mock.method(storage, 'setItem', () => { throw new Error('Storage is full') })
  const first = rememberTdOperator('g', loadTdRecentOperatorIds())
  assert.deepEqual(rememberTdOperator('h', first), ['h', 'g', 'f', 'e', 'd', 'c'])
  assert.deepEqual(loadTdRecentOperatorIds(), ['h', 'g', 'f', 'e', 'd', 'c'])
  blocked.mock.restore()
  assert.deepEqual(rememberTdOperator('i', []), ['i', 'h', 'g', 'f', 'e', 'd'])
  assert.deepEqual(loadTdRecentOperatorIds(), ['i', 'h', 'g', 'f', 'e', 'd'])
})
