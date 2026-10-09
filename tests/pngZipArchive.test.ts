import test from 'node:test'
import assert from 'node:assert/strict'
import { createStoredZipArchive } from '../src/lib/pngZipArchive.ts'

async function inspectArchive(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const endOffset = bytes.length - 22
  assert.equal(view.getUint32(endOffset, true), 0x06054b50)
  assert.equal(view.getUint16(endOffset + 4, true), 0)
  assert.equal(view.getUint16(endOffset + 6, true), 0)
  assert.equal(view.getUint16(endOffset + 20, true), 0)
  const count = view.getUint16(endOffset + 10, true)
  assert.equal(view.getUint16(endOffset + 8, true), count)
  const centralOffset = view.getUint32(endOffset + 16, true)
  assert.equal(centralOffset + view.getUint32(endOffset + 12, true), endOffset)
  const entries: { name: string; data: Uint8Array; checksum: number }[] = []
  let cursor = centralOffset
  let localEnd = 0
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50)
    assert.equal(view.getUint16(cursor + 8, true), 0x0800)
    assert.equal(view.getUint16(cursor + 10, true), 0) // Store, no compression.
    assert.equal(view.getUint16(cursor + 12, true), 0) // 00:00:00.
    assert.equal(view.getUint16(cursor + 14, true), 0x0021) // 1980-01-01.
    const size = view.getUint32(cursor + 24, true)
    assert.equal(view.getUint32(cursor + 20, true), size)
    const filenameLength = view.getUint16(cursor + 28, true)
    assert.equal(view.getUint16(cursor + 30, true), 0)
    assert.equal(view.getUint16(cursor + 32, true), 0)
    const filename = bytes.slice(cursor + 46, cursor + 46 + filenameLength)
    const offset = view.getUint32(cursor + 42, true)
    assert.equal(offset, localEnd)
    assert.equal(view.getUint32(offset, true), 0x04034b50)
    assert.equal(view.getUint16(offset + 6, true), 0x0800)
    assert.equal(view.getUint16(offset + 8, true), 0)
    assert.equal(view.getUint32(offset + 18, true), size)
    assert.equal(view.getUint32(offset + 22, true), size)
    assert.equal(view.getUint16(offset + 26, true), filenameLength)
    assert.equal(view.getUint16(offset + 28, true), 0)
    assert.deepEqual(bytes.slice(offset + 30, offset + 30 + filenameLength), filename)
    const checksum = view.getUint32(cursor + 16, true)
    assert.equal(view.getUint32(offset + 14, true), checksum)
    const dataOffset = offset + 30 + filenameLength
    localEnd = dataOffset + size
    entries.push({ name: new TextDecoder().decode(filename), data: bytes.slice(dataOffset, localEnd), checksum })
    cursor += 46 + filenameLength
  }
  assert.equal(cursor, endOffset)
  assert.equal(localEnd, centralOffset)
  return entries
}

test('日本語PNG名をUTF-8で保存し、元のバイト列・列挙順とCRC32を保持する', async () => {
  const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 255, 128])
  const blob = await createStoredZipArchive([
    { name: 'スルト_MOD段階1.png', blob: new Blob([pngBytes], { type: 'image/png' }) },
    { name: 'CRC確認_段階２.png', blob: new Blob(['123456789']) },
  ])
  assert.equal(blob.type, 'application/zip')
  const entries = await inspectArchive(blob)
  assert.deepEqual(entries.map(({ name }) => name), ['スルト_MOD段階1.png', 'CRC確認_段階２.png'])
  assert.deepEqual(entries[0].data, pngBytes)
  assert.equal(new TextDecoder().decode(entries[1].data), '123456789')
  assert.equal(entries[1].checksum, 0xcbf43926)
})

test('同じ入力なら日時に依存せず同じZIPバイト列になる', async () => {
  const files = [{ name: '比較.png', blob: new Blob(['PNG']) }]
  assert.deepEqual(await (await createStoredZipArchive(files)).arrayBuffer(), await (await createStoredZipArchive(files)).arrayBuffer())
})

test('空のBlobも有効な項目として保存しCRC32は0になる', async () => {
  const entries = await inspectArchive(await createStoredZipArchive([{ name: 'empty.png', blob: new Blob() }]))
  assert.equal(entries[0].data.length, 0)
  assert.equal(entries[0].checksum, 0)
})

test('空の項目リストと同名の項目を拒否する', async () => {
  await assert.rejects(createStoredZipArchive([]), /画像がありません/u)
  await assert.rejects(createStoredZipArchive([
    { name: '比較.png', blob: new Blob() },
    { name: '比較.png', blob: new Blob() },
  ]), /重複/u)
})

test('空の名前・絶対パス・ディレクトリや親パス・制御文字を拒否する', async () => {
  for (const name of ['', '  ', '.', '..', '../comparison.png', '..\\comparison.png', 'folder/test.png', '/absolute.png', 'C:\\test.png', 'a\u0000.png', 'a\n.png']) {
    await assert.rejects(createStoredZipArchive([{ name, blob: new Blob() }]), /パス/u)
  }
})

test('ZIP内ファイル名の上限は文字数ではなくUTF-8バイト数で判定する', async () => {
  const filename = `${'あ'.repeat(21843)}.png` // 65533 bytes.
  const entries = await inspectArchive(await createStoredZipArchive([{ name: filename, blob: new Blob() }]))
  assert.equal(entries[0].name, filename)
  await assert.rejects(createStoredZipArchive([{ name: `${filename}abc`, blob: new Blob() }]), /長すぎ/u)
})

test('ZIP64が必要な項目数・ファイルサイズ・全体サイズは読込前に拒否する', async () => {
  let read = false
  const oversized = {
    size: 0xffffffff,
    async arrayBuffer() { read = true; throw new Error('must not read') },
  } as Blob
  await assert.rejects(createStoredZipArchive([{ name: 'large.png', blob: oversized }]), /サイズ/u)
  const nearlyMax = { ...oversized, size: 0xfffffffe } as Blob
  await assert.rejects(createStoredZipArchive([{ name: 'large.png', blob: nearlyMax }]), /サイズ/u)
  await assert.rejects(createStoredZipArchive(Array.from({ length: 65535 }, (_, index) => ({ name: `${index}.png`, blob: oversized }))), /多すぎ/u)
  assert.equal(read, false)
})

test('元Blobの読込エラーを保存成功として隠さない', async () => {
  const error = new Error('PNG read failed')
  const blob = { size: 1, async arrayBuffer() { throw error } } as Blob
  await assert.rejects(createStoredZipArchive([{ name: 'comparison.png', blob }]), (actual) => actual === error)
})
