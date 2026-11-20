import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getChartDirectorySavePicker, selectChartDirectoryDestination,
  type ChartDirectoryFileHandle, type ChartDirectoryHandle, type ChartDirectorySavePicker,
} from '../src/lib/chartDirectoryDestination.ts'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function fixture() {
  const files = new Map<string, { handle: ChartDirectoryFileHandle; blob: Blob }>()
  const directories = new Set<string>()
  const calls: string[] = []
  let writeFailure: unknown
  let closeFailure: unknown
  let writableFailure: unknown
  let cleanupFailure: unknown
  let replacement: ChartDirectoryFileHandle | undefined
  const directory: ChartDirectoryHandle = {
    name: '出力先',
    async getFileHandle(name, options) {
      calls.push(`${options?.create ? 'create' : 'probe'}:${name}`)
      if (directories.has(name)) throw new DOMException('directory', 'TypeMismatchError')
      let entry = files.get(name)
      if (!entry && options?.create) {
        const handle: ChartDirectoryFileHandle = {
          async isSameEntry(other) { return handle === other },
          async createWritable() {
            if (writableFailure) throw writableFailure
            let pending: Blob | undefined
            return {
              async write(blob) {
                calls.push(`write:${name}`)
                if (writeFailure) {
                  if (replacement) files.set(name, { handle: replacement, blob: new Blob(['external']) })
                  throw writeFailure
                }
                pending = blob
              },
              async close() {
                calls.push(`close:${name}`)
                if (closeFailure) throw closeFailure
                files.get(name)!.blob = pending!
              },
              async abort(error) { calls.push(`abort:${name}`); assert.ok(error) },
            }
          },
        }
        entry = { handle, blob: new Blob() }
        files.set(name, entry)
      }
      if (!entry) throw new DOMException('not found', 'NotFoundError')
      return entry.handle
    },
    async removeEntry(name) {
      calls.push(`remove:${name}`)
      if (cleanupFailure) throw cleanupFailure
      files.delete(name)
    },
  }
  return {
    files, directories, calls, directory,
    setWriteFailure(error: unknown) { writeFailure = error },
    setCloseFailure(error: unknown) { closeFailure = error },
    setWritableFailure(error: unknown) { writableFailure = error },
    setCleanupFailure(error: unknown) { cleanupFailure = error },
    setReplacement(handle: ChartDirectoryFileHandle) { replacement = handle },
  }
}

test('directory picker is invoked synchronously once before any of eight PNG writes', async () => {
  const mock = fixture()
  const picked = deferred<ChartDirectoryHandle>()
  let pickerCalls = 0
  const selecting = selectChartDirectoryDestination(options => {
    pickerCalls++
    assert.deepEqual(options, { id: 'chart-png-directory', mode: 'readwrite' })
    return picked.promise
  })
  assert.equal(pickerCalls, 1)
  assert.deepEqual(mock.calls, [])
  picked.resolve(mock.directory)
  const destination = await selecting
  assert.equal(destination.type, 'directory')
  if (destination.type !== 'directory') return
  assert.equal(destination.name, '出力先')
  for (let index = 0; index < 8; index++) {
    const name = `条件${index + 1}_外れ値情報あり_比率16x9.png`
    const blob = new Blob([`PNG ${index}`], { type: 'image/png' })
    assert.equal(await destination.write(name, blob), name)
    assert.equal(mock.files.get(name)!.blob, blob)
  }
  assert.equal(pickerCalls, 1)
  assert.equal(mock.files.size, 8)
})

test('native directory picker keeps its Window receiver and reports unsupported environments', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const mock = fixture()
  const browserWindow = {
    async showDirectoryPicker(this: unknown) { assert.equal(this, browserWindow); return mock.directory },
  }
  try {
    Reflect.deleteProperty(globalThis, 'window')
    assert.equal(getChartDirectorySavePicker(), undefined)
    Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })
    assert.equal(getChartDirectorySavePicker(), undefined)
    Object.defineProperty(globalThis, 'window', { value: browserWindow, configurable: true })
    assert.equal((await selectChartDirectoryDestination(getChartDirectorySavePicker())).type, 'directory')
    await assert.rejects(selectChartDirectoryDestination(undefined), /フォルダ保存に対応していません/)
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('only cancelling the picker is a cancelled save; permission and security failures remain errors', async () => {
  assert.deepEqual(await selectChartDirectoryDestination(async () => {
    throw new DOMException('cancel', 'AbortError')
  }), { type: 'cancelled' })
  for (const error of [new DOMException('denied', 'NotAllowedError'), new DOMException('activation', 'SecurityError')]) {
    await assert.rejects(selectChartDirectoryDestination(async () => { throw error }), actual => actual === error)
  }
})

test('duplicate names and existing directories get unique names without changing existing content', async () => {
  const mock = fixture()
  const destination = await selectChartDirectoryDestination(async () => mock.directory)
  if (destination.type !== 'directory') return assert.fail('directory expected')
  const old = new Blob(['existing'])
  await destination.write('比較.png', old)
  mock.directories.add('比較 (2).png')
  assert.equal(await destination.write('比較.png', new Blob(['new'])), '比較 (3).png')
  assert.equal(mock.files.get('比較.png')!.blob, old)
  assert.ok(mock.directories.has('比較 (2).png'))
  assert.equal(mock.calls.some(value => value === 'remove:比較.png'), false)
  const names = await Promise.all(Array.from({ length: 3 }, () => destination.write('並列.png', new Blob())))
  assert.deepEqual(names, ['並列.png', '並列 (2).png', '並列 (3).png'])
})

test('long Japanese and emoji names stay within 240 UTF-8 bytes, including copies and aspect suffixes', async () => {
  const mock = fixture()
  const destination = await selectChartDirectoryDestination(async () => mock.directory)
  if (destination.type !== 'directory') return assert.fail('directory expected')
  const original = `${'敵😀術耐性'.repeat(30)}_比率16x9.png`
  const first = await destination.write(original, new Blob())
  const second = await destination.write(original, new Blob())
  assert.notEqual(first, second)
  assert.ok(first.endsWith('_比率16x9.png'))
  assert.ok(second.endsWith(' (2)_比率16x9.png'))
  for (const name of [first, second]) {
    assert.ok(new TextEncoder().encode(name).length <= 240)
    assert.equal(new TextDecoder().decode(new TextEncoder().encode(name)), name)
  }
  const unusuallyLongAspect = await destination.write(`比較_比率${'1'.repeat(250)}x9.png`, new Blob())
  assert.ok(new TextEncoder().encode(unusuallyLongAspect).length <= 240)
})

test('invalid filenames fail before probing or creating any entry', async () => {
  const mock = fixture()
  const destination = await selectChartDirectoryDestination(async () => mock.directory)
  if (destination.type !== 'directory') return assert.fail('directory expected')
  for (const name of ['', ' ', '.png', '..png', '../a.png', 'C:\\a.png', '/a.png', 'a/b.png', 'a\u0000.png', '\na.png', 'a.png\t', 'a:bad.png', 'CON.png', 'lpt1.png', 'a.zip']) {
    await assert.rejects(destination.write(name, new Blob()))
  }
  assert.deepEqual(mock.calls, [])
})

test('a write succeeds only after close completes', async () => {
  const closed = deferred<void>()
  const started = deferred<void>()
  const handle: ChartDirectoryFileHandle = { async createWritable() {
    return { async write() {}, close() { started.resolve(); return closed.promise } }
  } }
  const directory: ChartDirectoryHandle = {
    name: 'wait',
    async getFileHandle(_name, options) { if (!options?.create) throw new DOMException('', 'NotFoundError'); return handle },
    async removeEntry() {},
  }
  const destination = await selectChartDirectoryDestination(async () => directory)
  if (destination.type !== 'directory') return assert.fail('directory expected')
  let finished = false
  const saving = destination.write('wait.png', new Blob()).then(name => { finished = true; return name })
  await started.promise
  assert.equal(finished, false)
  closed.resolve()
  assert.equal(await saving, 'wait.png')
  assert.equal(finished, true)
})

test('write, close and createWritable errors clean up only the new failed entry and retain the error', async () => {
  for (const stage of ['write', 'close', 'writable'] as const) {
    const mock = fixture()
    const error = new DOMException(stage, 'AbortError')
    if (stage === 'write') mock.setWriteFailure(error)
    if (stage === 'close') mock.setCloseFailure(error)
    if (stage === 'writable') mock.setWritableFailure(error)
    const destination = await selectChartDirectoryDestination(async () => mock.directory)
    if (destination.type !== 'directory') return assert.fail('directory expected')
    await assert.rejects(destination.write('failed.png', new Blob()), actual => actual === error)
    assert.equal(mock.files.has('failed.png'), false)
    assert.ok(mock.calls.includes('remove:failed.png'))
    assert.equal(mock.calls.includes('abort:failed.png'), stage !== 'writable')
  }
})

test('cleanup failure preserves the original error and later writes may retry', async () => {
  const mock = fixture()
  const error = new Error('disk full')
  mock.setWriteFailure(error)
  mock.setCleanupFailure(new Error('cleanup denied'))
  const destination = await selectChartDirectoryDestination(async () => mock.directory)
  if (destination.type !== 'directory') return assert.fail('directory expected')
  await assert.rejects(destination.write('failed.png', new Blob()), actual => actual === error)
  mock.setWriteFailure(undefined)
  mock.setCleanupFailure(undefined)
  assert.equal(await destination.write('retry.png', new Blob()), 'retry.png')
})

test('a replacement from another writer is never removed while cleaning up', async () => {
  const mock = fixture()
  mock.setWriteFailure(new Error('failed'))
  mock.setReplacement({ async createWritable() { throw new Error('external writer') } })
  const destination = await selectChartDirectoryDestination(async () => mock.directory)
  if (destination.type !== 'directory') return assert.fail('directory expected')
  await assert.rejects(destination.write('external.png', new Blob()))
  assert.equal(await mock.files.get('external.png')!.blob.text(), 'external')
  assert.equal(mock.calls.includes('remove:external.png'), false)
})

test('cleanup recognizes new native handle wrappers for the same file', async () => {
  const error = new DOMException('permission revoked', 'NotAllowedError')
  let created = false
  let removed = false
  const handles = new Set<ChartDirectoryFileHandle>()
  const directory: ChartDirectoryHandle = {
    name: 'native handles',
    async getFileHandle(_name, options) {
      if (!created && !options?.create) throw new DOMException('', 'NotFoundError')
      created = true
      const handle: ChartDirectoryFileHandle = {
        async isSameEntry(other) { return handles.has(other) },
        async createWritable() { throw error },
      }
      handles.add(handle)
      return handle
    },
    async removeEntry() { removed = true },
  }
  const destination = await selectChartDirectoryDestination(async () => directory)
  if (destination.type !== 'directory') return assert.fail('directory expected')
  await assert.rejects(destination.write('failed.png', new Blob()), actual => actual === error)
  assert.equal(handles.size, 2)
  assert.equal(removed, true)
})

test('probing and file-creation permission failures do not remove or rewrite existing entries', async () => {
  for (const failCreate of [false, true]) {
    const error = new DOMException('permission revoked', 'NotAllowedError')
    let removed = false
    const directory: ChartDirectoryHandle = {
      name: 'revoked',
      async getFileHandle(_name, options) {
        if (failCreate && !options?.create) throw new DOMException('', 'NotFoundError')
        throw error
      },
      async removeEntry() { removed = true },
    }
    const destination = await selectChartDirectoryDestination(async () => directory)
    if (destination.type !== 'directory') return assert.fail('directory expected')
    await assert.rejects(destination.write('denied.png', new Blob()), actual => actual === error)
    assert.equal(removed, false)
  }
})
