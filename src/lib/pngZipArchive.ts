export interface StoredZipFile {
  name: string
  blob: Blob
}

// The all-ones values are reserved for ZIP64; the image bundles use ZIP32 only.
const MAX_ZIP32_VALUE = 0xffff_fffe
const MAX_ZIP32_ENTRIES = 0xfffe
const UTF8_FILENAME_FLAG = 0x0800
const DOS_DATE_1980_01_01 = 0x0021

const crc32Table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ ((value & 1) ? 0xedb8_8320 : 0)
  }
  return value >>> 0
})

function crc32(bytes: Uint8Array): number {
  let value = 0xffff_ffff
  for (const byte of bytes) value = (value >>> 8) ^ crc32Table[(value ^ byte) & 0xff]
  return (value ^ 0xffff_ffff) >>> 0
}

function createHeader(size: number, signature: number) {
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, signature, true)
  return { bytes, view }
}

function assertZip32Size(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_ZIP32_VALUE) {
    throw new RangeError('ZIP32で保存できるサイズを超えています。')
  }
}

/** Bundle PNGs without recompressing them. Entry names are flat UTF-8 filenames. */
export async function createStoredZipArchive(files: readonly StoredZipFile[]): Promise<Blob> {
  if (files.length === 0) throw new Error('ZIPに保存する画像がありません。')
  if (files.length > MAX_ZIP32_ENTRIES) throw new RangeError('ZIPに保存する画像が多すぎます。')

  const names = new Set<string>()
  const encoder = new TextEncoder()
  let localSize = 0
  let centralSize = 0
  const entries = files.map(({ name, blob }) => {
    // Exported images never need folders or paths inside the archive.
    if (!name.trim() || name === '.' || name === '..' || /[/\\:\u0000-\u001f\u007f]/u.test(name)) {
      throw new Error('ZIP内の画像名にはパスを指定できません。')
    }
    if (names.has(name)) throw new Error('ZIP内の画像名が重複しています。')
    names.add(name)
    const filename = encoder.encode(name)
    if (filename.length > 0xffff) throw new RangeError('ZIP内の画像名が長すぎます。')
    assertZip32Size(blob.size)
    const offset = localSize
    localSize += 30 + filename.length + blob.size
    centralSize += 46 + filename.length
    assertZip32Size(localSize)
    assertZip32Size(centralSize)
    return { filename, blob, offset }
  })
  assertZip32Size(localSize + centralSize + 22)

  const localParts: BlobPart[] = []
  const centralParts: BlobPart[] = []
  for (const entry of entries) {
    const checksum = crc32(new Uint8Array(await entry.blob.arrayBuffer()))
    const local = createHeader(30, 0x0403_4b50)
    local.view.setUint16(4, 20, true) // Version needed: 2.0.
    local.view.setUint16(6, UTF8_FILENAME_FLAG, true)
    local.view.setUint16(12, DOS_DATE_1980_01_01, true)
    local.view.setUint32(14, checksum, true)
    local.view.setUint32(18, entry.blob.size, true)
    local.view.setUint32(22, entry.blob.size, true)
    local.view.setUint16(26, entry.filename.length, true)
    localParts.push(local.bytes, entry.filename, entry.blob)

    const central = createHeader(46, 0x0201_4b50)
    central.view.setUint16(4, 20, true) // Made by DOS, version 2.0.
    central.view.setUint16(6, 20, true)
    central.view.setUint16(8, UTF8_FILENAME_FLAG, true)
    central.view.setUint16(14, DOS_DATE_1980_01_01, true)
    central.view.setUint32(16, checksum, true)
    central.view.setUint32(20, entry.blob.size, true)
    central.view.setUint32(24, entry.blob.size, true)
    central.view.setUint16(28, entry.filename.length, true)
    central.view.setUint32(42, entry.offset, true)
    centralParts.push(central.bytes, entry.filename)
  }

  const end = createHeader(22, 0x0605_4b50)
  end.view.setUint16(8, entries.length, true)
  end.view.setUint16(10, entries.length, true)
  end.view.setUint32(12, centralSize, true)
  end.view.setUint32(16, localSize, true)
  return new Blob([...localParts, ...centralParts, end.bytes], { type: 'application/zip' })
}
