import test from 'node:test'
import assert from 'node:assert/strict'
import iced from 'iced-x86'
import { readPE, mapNativeMethods, decodeNativeBody, formatNativeBody } from '../src/lib/nativeAnalysis.ts'

function fixture() {
  const dll = new ArrayBuffer(0xE00), p = new DataView(dll), bytes = new Uint8Array(dll), base = 0x180000000
  const u16 = (at: number, value: number) => p.setUint16(at, value, true), u32 = (at: number, value: number) => p.setUint32(at, value, true)
  const u64 = (at: number, value: number) => p.setBigUint64(at, BigInt(value), true)
  u16(0, 0x5A4D); u32(60, 0x80); u32(0x80, 0x4550); u16(0x84, 0x8664); u16(0x86, 3); u16(0x94, 240)
  const opt = 0x98; u16(opt, 0x20B); u64(opt + 24, base); u32(opt + 108, 16); u32(opt + 136, 0x3000); u32(opt + 140, 24)
  for (const [i, rva, raw, size, flags] of [[0, 0x1000, 0x400, 0x400, 0x60000020], [1, 0x2000, 0x800, 0x400, 0x40000040], [2, 0x3000, 0xC00, 0x200, 0x40000040]]) {
    const at = opt + 240 + i * 40; u32(at + 12, rva); u32(at + 16, size); u32(at + 20, raw); u32(at + 36, flags)
  }
  bytes.set([0x83, 0xF8, 1, 0x75, 5, 0xE8, 0x16, 0, 0, 0, 0xC3], 0x400); bytes[0x420] = 0xC3
  u32(0xC00, 0x1000); u32(0xC04, 0x100B); u32(0xC0C, 0x1020); u32(0xC10, 0x1021)
  bytes.set(new TextEncoder().encode('Assembly-CSharp.dll\0'), 0x880)
  u64(0x800, base + 0x2080); u64(0x808, 2); u64(0x810, base + 0x2100)
  u64(0x900, base + 0x1000); u64(0x908, base + 0x1020)
  const dat = new ArrayBuffer(1024), v = new DataView(dat), names = ['','Gdglow','Battle','DealHitTarget','OnHitTarget','Assembly-CSharp.dll'], indices: number[] = []
  let at = 256
  for (const name of names) { indices.push(at - 256); const b = new TextEncoder().encode(name + '\0'); new Uint8Array(dat).set(b, at); at += b.length }
  v.setUint32(0, 0xFAB11BAF, true); v.setUint32(4, 29, true)
  for (const [pos, start, size] of [[24,256,at-256],[160,400,88],[48,488,64],[168,552,40]]) { v.setUint32(pos,start,true); v.setUint32(pos+4,size,true) }
  v.setUint32(400,indices[1],true); v.setUint32(404,indices[2],true); v.setInt32(432,-1,true); v.setUint16(464,2,true)
  for (let i=0;i<2;i++) { const m=488+i*32; v.setUint32(m,indices[3+i],true); v.setInt32(m+12,-1,true); v.setUint32(m+20,0x06000001+i,true) }
  v.setUint32(552,indices[5],true); v.setUint32(564,1,true)
  return { dll, dat, p, v, base }
}

test('PE translation keeps raw offsets and RVA distinct and rejects invalid regions', () => {
  const f = fixture(), pe = readPE(f.dll)
  assert.equal(pe.raw(0x1000), 0x400)
  assert.equal(pe.vaRaw(f.base + 0x1020), 0x420)
  assert.throws(() => pe.raw(0x1400))
  assert.equal(pe.executable(0x2080), false)
  for (const mutate of [
    (p: DataView) => p.setUint16(0x84, 0xAA64, true),
    (p: DataView) => p.setUint32(60, 0xFFFF, true),
    (p: DataView) => p.setUint32(0x98+240+20, 0xFFFF, true),
    (p: DataView) => p.setUint32(0xC04, 0x3000, true),
  ]) { const bad=fixture();mutate(bad.p);assert.throws(()=>readPE(bad.dll)) }
})

test('module mapping validates tokens and pointers and preserves shared-code aliases', () => {
  const f=fixture(), c=mapNativeMethods('sample.dat',f.dat,f.dll)
  assert.deepEqual(c.methods.map(m=>[m.name,m.rva,m.offset]),[['DealHitTarget',0x1000,0x400],['OnHitTarget',0x1020,0x420]])
  assert.equal(c.symbols.get(0x1020)?.[0],'Battle.Gdglow.OnHitTarget()')
  const mismatch=fixture();mismatch.p.setBigUint64(0x808,3n,true)
  assert.throws(()=>mapNativeMethods('sample.dat',mismatch.dat,mismatch.dll),/一意/)
  const noncode=fixture();noncode.p.setBigUint64(0x900,BigInt(f.base+0x2080),true)
  assert.throws(()=>mapNativeMethods('sample.dat',noncode.dat,noncode.dll),/一意/)
  const badToken=fixture();badToken.v.setUint32(508,0x06000003,true)
  assert.throws(()=>mapNativeMethods('sample.dat',badToken.dat,badToken.dll),/処理番号/)
  f.p.setBigUint64(0x908,BigInt(f.base+0x1000),true)
  assert.equal(mapNativeMethods('sample.dat',f.dat,f.dll).symbols.get(0x1000)?.length,2)
})

test('decoding exposes comparisons, branches, calls, aliases and split-region continuation without executing code', () => {
  const f=fixture(), c=mapNativeMethods('sample.dat',f.dat,f.dll), body=decodeNativeBody(c,0x1000,iced)
  assert.deepEqual(body.instructions.map(i=>i.kind),['比較','条件分岐','呼出し','戻る'])
  assert.deepEqual(body.instructions.map(i=>i.flow),['next','branch','call','return'])
  assert.equal(body.instructions[2].target,0x1020)
  assert.deepEqual(body.instructions[2].names,['Battle.Gdglow.OnHitTarget()'])
  assert.equal(body.instructions[2].follow,true)
  assert.equal(body.instructions[1].follow,false)
  assert.equal(body.nextRva,undefined)
  assert.match(body.warnings.join(' '),/複数区間/)
  assert.throws(()=>decodeNativeBody(c,0x2080,iced))
  f.p.setUint32(0xC04,0x1005,true)
  const split=decodeNativeBody(mapNativeMethods('sample.dat',f.dat,f.dll),0x1000,iced)
  assert.equal(split.nextRva,0x1005)
  assert.equal(split.instructions[1].follow,true)
  const text=formatNativeBody({methods:c.methods,modules:c.modules,symbolCount:c.symbols.size,datName:'sample.dat',dllName:'GameAssembly.dll',datHash:'dat-hash',dllHash:'dll-hash'},body)
  assert.match(text,/DLL SHA-256: dll-hash/)
  assert.match(text,/実行順やゲーム仕様を確定した記録ではありません/)
  assert.match(text,/0x1005\t0x405/)
  assert.match(text,/命令\t意味\t区分/)
  assert.ok(text.includes(body.instructions[0].meaning))
  assert.match(text,/表示中の区間の流れ（自動生成）/)
})

test('instruction meanings follow decoded operands and distinguish data, addresses and flags', () => {
  const cases: [number[], RegExp][] = [
    [[0x53], /rbxの値をスタックに保存/],
    [[0x5B], /スタックの先頭の値をrbxに取り出す/],
    [[0x48,0x89,0xD8], /rbxの値をraxへコピー/],
    [[0x48,0x8D,0x43,0x08], /アドレスを計算.*データは読み取らない/],
    [[0x83,0xF8,0x01], /eaxから1を引いた結果.*値自体は書き換えない/],
    [[0x85,0xC0], /eaxとeaxのビットごとのAND.*値自体は書き換えない/],
    [[0x75,0x00], /ZF=0.*それ以外は次/],
    [[0xFF,0xD0], /戻り先をスタックに保存.*raxの処理/],
    [[0x0F,0xA2], /未対応/],
  ]
  for (const [code, expected] of cases) {
    const f=fixture()
    new Uint8Array(f.dll).set(code,0x400)
    f.p.setUint32(0xC04,0x1000+code.length,true)
    const body=decodeNativeBody(mapNativeMethods('sample.dat',f.dat,f.dll),0x1000,iced)
    assert.equal(body.instructions.length,1)
    assert.match(body.instructions[0].meaning,expected)
  }
})
