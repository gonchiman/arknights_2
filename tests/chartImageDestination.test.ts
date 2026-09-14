import test from 'node:test'
import assert from 'node:assert/strict'
import { getChartImageSavePicker, selectChartImageDestination, type ChartImageSavePicker } from '../src/lib/chartImageDestination.ts'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

const unusedHandle = {
  async createWritable() {
    throw new Error('保存先を選ぶだけでは書き込まない')
  },
}

test('保存先選択APIがなければ既存のダウンロード経路を返す', async () => {
  assert.deepEqual(await selectChartImageDestination('比較.png', undefined), { type: 'download' })
})

test('利用可能なネイティブpickerはWindowをthisとして呼び出せる', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const browserWindow = {
    showSaveFilePicker(this: unknown) {
      assert.equal(this, browserWindow)
      return Promise.resolve(unusedHandle)
    },
  }
  try {
    Reflect.deleteProperty(globalThis, 'window')
    assert.equal(getChartImageSavePicker(), undefined)
    Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })
    assert.equal(getChartImageSavePicker(), undefined)
    Object.defineProperty(globalThis, 'window', { value: browserWindow, configurable: true })
    const picker = getChartImageSavePicker()
    assert.ok(picker)
    assert.equal((await selectChartImageDestination('比較.png', picker)).type, 'file')
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('ユーザー操作中にpickerを同期的に呼び、PNGと前回フォルダ用IDを指定する', async () => {
  const selection = deferred<typeof unusedHandle>()
  let called = false
  const picker: ChartImageSavePicker = (options) => {
    called = true
    assert.deepEqual(options, {
      id: 'goldenglow-chart-image',
      suggestedName: '比較.png',
      excludeAcceptAllOption: true,
      types: [{ description: 'PNG画像', accept: { 'image/png': ['.png'] } }],
    })
    return selection.promise
  }
  const result = selectChartImageDestination('  比較  ', picker)
  assert.equal(called, true)
  selection.resolve(unusedHandle)
  assert.equal((await result).type, 'file')
})

test('入力済みのPNG拡張子を大文字小文字に関係なく重複させない', async () => {
  for (const filename of ['比較.png', '比較.PNG', '比較.PnG']) {
    await selectChartImageDestination(` ${filename} `, async (options) => {
      assert.equal(options.suggestedName, filename)
      return unusedHandle
    })
  }
})

test('pickerの取消は保存も通常ダウンロードも行わない結果を返す', async () => {
  for (const error of [new DOMException('cancelled', 'AbortError'), { name: 'AbortError' }]) {
    const destination = await selectChartImageDestination('比較.png', async () => { throw error })
    assert.deepEqual(destination, { type: 'cancelled' })
    assert.equal('write' in destination, false)
  }
})

test('pickerの権限・起動失敗を取消や通常ダウンロードへすり替えない', async () => {
  for (const error of [new DOMException('activation', 'SecurityError'), new DOMException('denied', 'NotAllowedError'), new TypeError('options')]) {
    await assert.rejects(selectChartImageDestination('比較.png', async () => { throw error }), (actual) => actual === error)
  }
})

test('Blobが届くまで書き込まず、close完了まで保存成功を返さない', async () => {
  const closeStarted = deferred<void>()
  const closeFinished = deferred<void>()
  const calls: string[] = []
  const blob = new Blob(['PNG bytes'], { type: 'image/png' })
  const destination = await selectChartImageDestination('比較.png', async () => ({
    async createWritable() {
      calls.push('createWritable')
      return {
        async write(value) {
          assert.equal(value, blob)
          calls.push('write')
        },
        close() {
          calls.push('close')
          closeStarted.resolve()
          return closeFinished.promise
        },
      }
    },
  }))
  assert.equal(destination.type, 'file')
  if (destination.type !== 'file') return
  assert.deepEqual(calls, [])
  let saved = false
  const saving = destination.write(blob).then(() => { saved = true })
  await closeStarted.promise
  assert.deepEqual(calls, ['createWritable', 'write', 'close'])
  assert.equal(saved, false)
  closeFinished.resolve()
  await saving
  assert.equal(saved, true)
})

test('書き込み中のAbortErrorはエラーとして返し、streamをabortする', async () => {
  const error = new DOMException('file check failed', 'AbortError')
  const calls: string[] = []
  const destination = await selectChartImageDestination('比較.png', async () => ({
    async createWritable() {
      return {
        async write() { calls.push('write'); throw error },
        async close() { calls.push('close') },
        async abort(reason) { assert.equal(reason, error); calls.push('abort') },
      }
    },
  }))
  assert.equal(destination.type, 'file')
  if (destination.type !== 'file') return
  await assert.rejects(destination.write(new Blob()), (actual) => actual === error)
  assert.deepEqual(calls, ['write', 'abort'])
})

test('close失敗時もabortを試み、後片付けの失敗で元のエラーを失わない', async () => {
  const error = new Error('disk full')
  let aborted = false
  const destination = await selectChartImageDestination('比較.png', async () => ({
    async createWritable() {
      return {
        async write() {},
        async close() { throw error },
        async abort() { aborted = true; throw new Error('cleanup failed') },
      }
    },
  }))
  assert.equal(destination.type, 'file')
  if (destination.type !== 'file') return
  await assert.rejects(destination.write(new Blob()), (actual) => actual === error)
  assert.equal(aborted, true)
})

test('書き込み権限が失われた場合も保存エラーをそのまま返す', async () => {
  const error = new DOMException('write permission revoked', 'NotAllowedError')
  const destination = await selectChartImageDestination('比較.png', async () => ({
    async createWritable() { throw error },
  }))
  assert.equal(destination.type, 'file')
  if (destination.type !== 'file') return
  await assert.rejects(destination.write(new Blob()), (actual) => actual === error)
})
