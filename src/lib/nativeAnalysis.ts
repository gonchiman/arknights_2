import { extractGoldenglow, readAnalysisFile } from './codeAnalysis.ts'
import { getNativeMethodGuide } from './nativeMethodGuide.ts'
import { nativeInstructionMeaning } from './nativeInstructionMeaning.ts'
import { formatNativeFlow, type NativeFlowKind } from './nativeFlow.ts'
import type * as Iced from 'iced-x86'

export const MAX_NATIVE_BYTES = 256 * 1024 * 1024
export const address = (n: number) => `0x${n.toString(16).toUpperCase()}`
type Section = { rva: number; raw: number; size: number; executable: boolean }
export type NativeMethod = { id: number; name: string; owner: string; token: number; module: string; rva: number | null; offset: number | null; autoChess: boolean }
export type NativeSummary = { methods: NativeMethod[]; modules: string[]; symbolCount: number; dllName: string; datName: string; dllHash: string; datHash: string }
export type NativeInstruction = { rva: number; offset: number; bytes: string; text: string; meaning: string; kind: string; flow: NativeFlowKind; target?: number; names: string[]; follow: boolean; facts?: { operation: string; operands: string[]; writesZeroFlag: boolean } }
export type NativeBody = { rva: number; offset: number; names: string[]; range: string; warnings: string[]; instructions: NativeInstruction[]; nextRva?: number }
export type NativeContext = { pe: ReturnType<typeof readPE>; symbols: Map<number, string[]>; methods: NativeMethod[]; modules: string[] }

// PE/COFF addresses are translated only through file-backed sections; never execute the DLL.
export function readPE(buffer: ArrayBuffer) {
  if (buffer.byteLength > MAX_NATIVE_BYTES) throw new Error('DLLは256 MBまで読み込めます。')
  const v = new DataView(buffer), bytes = new Uint8Array(buffer)
  const range = (p: number, n: number) => Number.isSafeInteger(p) && Number.isSafeInteger(n) && p >= 0 && n >= 0 && p + n <= bytes.length
  if (!range(0, 64) || v.getUint16(0, true) !== 0x5A4D) throw new Error('Windows版のGameAssembly.dllを選んでください。')
  const header = v.getUint32(60, true)
  if (!range(header, 24) || v.getUint32(header, true) !== 0x4550) throw new Error('DLLのPEヘッダーを読み取れません。')
  const count = v.getUint16(header + 6, true), optionalSize = v.getUint16(header + 20, true), opt = header + 24
  if (v.getUint16(header + 4, true) !== 0x8664 || !range(opt, optionalSize) || optionalSize < 144 || v.getUint16(opt, true) !== 0x20B) throw new Error('現在はWindows x64版のDLLに対応しています。')
  const base = Number(v.getBigUint64(opt + 24, true)), table = opt + optionalSize
  if (!Number.isSafeInteger(base) || count < 1 || count > 96 || !range(table, count * 40)) throw new Error('DLLの領域情報が正しくありません。')
  const sections: Section[] = []
  for (let i = 0; i < count; i++) {
    const p = table + i * 40
    const s = { rva: v.getUint32(p + 12, true), size: v.getUint32(p + 16, true), raw: v.getUint32(p + 20, true), executable: !!(v.getUint32(p + 36, true) & 0x20000000) }
    if (!range(s.raw, s.size) || s.rva + s.size > 0x100000000) throw new Error('DLLの領域がファイル外を指しています。')
    if (s.size) sections.push(s)
  }
  for (const key of ['rva', 'raw'] as const) {
    const sorted = [...sections].sort((a, b) => a[key] - b[key])
    if (sorted.some((s, i) => i > 0 && sorted[i - 1][key] + sorted[i - 1].size > s[key])) throw new Error('DLLの領域が重複しています。')
  }
  const section = (rva: number, size = 1) => sections.find(s => Number.isSafeInteger(rva) && size >= 0 && rva >= s.rva && rva + size <= s.rva + s.size)
  const raw = (rva: number, size = 1) => { const s = section(rva, size); if (!s) throw new Error('DLL内の参照先を読み取れません。'); return s.raw + rva - s.rva }
  const vaRaw = (va: number, size = 1) => raw(va - base, size)
  const executable = (rva: number) => !!section(rva)?.executable
  const functions: { start: number; end: number }[] = []
  if (v.getUint32(opt + 108, true) >= 4) {
    const rva = v.getUint32(opt + 136, true), size = v.getUint32(opt + 140, true)
    if (size) {
      if (size % 12) throw new Error('DLLの関数範囲表が壊れています。')
      const p = raw(rva, size)
      for (let i = 0; i < size; i += 12) {
        const start = v.getUint32(p + i, true), end = v.getUint32(p + i + 4, true)
        if (start >= end || !section(start, end - start)?.executable || (functions.length && start < functions[functions.length - 1].end)) throw new Error('DLLの関数範囲が正しくありません。')
        functions.push({ start, end })
      }
    }
  }
  const functionAt = (rva: number) => {
    let lo = 0, hi = functions.length - 1
    while (lo <= hi) { const mid = (lo + hi) >>> 1, f = functions[mid]; if (rva < f.start) hi = mid - 1; else if (rva >= f.end) lo = mid + 1; else return f }
    return undefined
  }
  return { v, bytes, base, sections, raw, vaRaw, executable, section, functionAt }
}

// v29 image ownership + method token RID -> Il2CppCodeGenModule.methodPointers.
// Reference layouts: Perfare/Il2CppDumper MetadataClass.cs, Il2CppClass.cs, GetMethodPointer.
export function mapNativeMethods(datName: string, dat: ArrayBuffer, dll: ArrayBuffer): NativeContext {
  const doc = readAnalysisFile(datName, dat), gg = extractGoldenglow(doc), v = new DataView(dat), pe = readPE(dll)
  const imageStart = v.getUint32(168, true), imageSize = v.getUint32(172, true), strings = v.getUint32(24, true), stringSize = v.getUint32(28, true)
  if (imageSize === 0 || imageSize % 40 || imageStart < 256 || imageStart + imageSize > dat.byteLength) throw new Error('DATの所属モジュール情報を読み取れません。')
  const nameBytes = new Uint8Array(dat, strings, stringSize), decoder = new TextDecoder('utf-8', { fatal: true })
  const images: { name: string; start: number; end: number }[] = []
  for (let p = imageStart; p < imageStart + imageSize; p += 40) {
    const nameAt = v.getUint32(p, true), endAt = nameBytes.indexOf(0, nameAt), start = v.getUint32(p + 8, true), end = start + v.getUint32(p + 12, true)
    if (nameAt >= nameBytes.length || endAt < 0 || end > doc.classes.length) throw new Error('DATの所属モジュール参照が範囲外です。')
    images.push({ name: decoder.decode(nameBytes.subarray(nameAt, endAt)), start, end })
  }
  const owners = new Int32Array(doc.classes.length).fill(-1)
  images.forEach((image, id) => { for (let i = image.start; i < image.end; i++) { if (owners[i] !== -1) throw new Error('DATの所属モジュールが重複しています。'); owners[i] = id } })
  const needed = new Set(gg.methods.map(m => owners[m.owner!.id]))
  if (needed.has(-1) || !needed.size) throw new Error('GGの処理に対応するモジュールが見つかりません。')
  const symbols = new Map<number, string[]>(), resolved = new Map<number, number>(), modules: string[] = []
  for (const imageId of needed) {
    const image = images[imageId], records = doc.methods.flatMap((m, id) => owners[m.ownerId] === imageId ? [{ ...m, id, token: v.getUint32(m.offset + 20, true) }] : [])
    const tokens = new Set(records.map(m => m.token & 0xFFFFFF)), maxToken = records.reduce((n, m) => Math.max(n, m.token & 0xFFFFFF), 0)
    if (records.some(m => (m.token >>> 24) !== 6) || tokens.size !== records.length || tokens.has(0) || maxToken !== records.length) throw new Error('DATの処理番号に未対応の形式が含まれています。')
    const pattern = new TextEncoder().encode(image.name + '\0'), nameVAs = new Set<number>()
    for (const s of pe.sections.filter(s => !s.executable)) {
      const end = s.raw + s.size - pattern.length
      for (let p = s.raw; p <= end; p++) {
        if (pe.bytes[p] !== pattern[0]) continue
        if (pattern.every((b, i) => pe.bytes[p + i] === b)) nameVAs.add(pe.base + s.rva + p - s.raw)
      }
    }
    const candidates: { at: number; pointers: number }[] = []
    for (const s of pe.sections.filter(s => !s.executable)) {
      for (let p = Math.ceil(s.raw / 8) * 8; p + 24 <= s.raw + s.size; p += 8) {
        if (!nameVAs.has(Number(pe.v.getBigUint64(p, true))) || pe.v.getBigUint64(p + 8, true) !== BigInt(maxToken)) continue
        try {
          const pointers = pe.vaRaw(Number(pe.v.getBigUint64(p + 16, true)), maxToken * 8)
          let valid = true, nonzero = 0
          for (let i = 0; i < maxToken; i++) { const ptr = Number(pe.v.getBigUint64(pointers + i * 8, true)); if (!ptr) continue; nonzero++; if (!Number.isSafeInteger(ptr) || !pe.executable(ptr - pe.base)) { valid = false; break } }
          if (valid && nonzero) candidates.push({ at: p, pointers })
        } catch { /* Not a valid code-generation module. */ }
      }
    }
    if (candidates.length !== 1) throw new Error(`${image.name}の対応を一意に確認できません。同じインストールのDATとDLLを選んでください。`)
    modules.push(`${image.name}（${maxToken}処理、DLL位置 ${address(candidates[0].at)}）`)
    for (const m of records) {
      const ptr = Number(pe.v.getBigUint64(candidates[0].pointers + ((m.token & 0xFFFFFF) - 1) * 8, true))
      if (!ptr) continue
      const rva = ptr - pe.base, name = `${doc.classes[m.ownerId].fullName}.${m.name}(${doc.parameters.slice(m.parameterStart, m.parameterStart + m.parameterCount).join(', ')})`
      resolved.set(m.id, rva)
      const aliases = symbols.get(rva) || []; aliases.push(name); symbols.set(rva, aliases)
    }
  }
  return { pe, symbols, modules, methods: gg.methods.map(m => { const rva = resolved.get(m.id) ?? null; return { id: m.id, name: m.name, owner: m.owner!.name, token: v.getUint32(doc.methods[m.id].offset + 20, true), module: images[owners[m.owner!.id]].name, rva, offset: rva === null ? null : pe.raw(rva), autoChess: m.autoChess } }) }
}

export function decodeNativeBody(context: NativeContext, rva: number, iced: typeof Iced): NativeBody {
  const { pe, symbols } = context
  if (!pe.executable(rva)) throw new Error('処理の実行領域にない位置です。')
  const f = pe.functionAt(rva), offset = pe.raw(rva), s = pe.section(rva)!, warnings: string[] = []
  const confirmed = !!f
  const available = confirmed ? f.end - rva : Math.min(256, s.rva + s.size - rva)
  const size = Math.min(available, 65536), code = pe.bytes.subarray(offset, offset + size)
  if (confirmed) warnings.push('DLLの範囲表にある1区間を表示しています。同じ処理が複数区間に分かれる場合は、分岐先や続きへ進んでください。')
  else warnings.push('区間の終端を確認できないため、先頭256バイト以内の参考表示です。別の処理の命令を含む可能性があります。')
  if (available > size) warnings.push('大きな処理のため先頭64 KBまで表示しています。')
  const decoder = new iced.Decoder(64, code, iced.DecoderOptions.None), formatter = new iced.Formatter(iced.FormatterSyntax.Nasm)
  decoder.ip = BigInt(pe.base + rva)
  const instructions: NativeInstruction[] = []
  let nextRva: number | undefined
  try {
    while (decoder.canDecode && instructions.length < 5000) {
      const ins = decoder.decode()
      try {
        if (ins.isInvalid) { warnings.push('読み取れない命令があり、そこで表示を止めました。'); break }
        const pos = Number(ins.ip) - pe.base, flow = ins.flowControl, direct = [iced.FlowControl.Call, iced.FlowControl.UnconditionalBranch, iced.FlowControl.ConditionalBranch].includes(flow)
        const near = [iced.OpKind.NearBranch16, iced.OpKind.NearBranch32, iced.OpKind.NearBranch64].includes(ins.op0Kind)
        const target = direct && near ? Number(ins.nearBranchTarget) - pe.base : undefined
        const kind = flow === iced.FlowControl.Call ? '呼出し' : flow === iced.FlowControl.IndirectCall ? '間接呼出し' : flow === iced.FlowControl.ConditionalBranch ? '条件分岐' : flow === iced.FlowControl.UnconditionalBranch ? '移動' : flow === iced.FlowControl.IndirectBranch ? '間接移動' : flow === iced.FlowControl.Return ? '戻る' : [iced.Mnemonic.Cmp, iced.Mnemonic.Test].includes(ins.mnemonic) ? '比較' : '操作'
        const flowKind: NativeFlowKind = flow === iced.FlowControl.Next ? 'next'
          : flow === iced.FlowControl.Call && ins.mnemonic === iced.Mnemonic.Call && near ? 'call'
          : flow === iced.FlowControl.IndirectCall ? 'indirect-call'
          : flow === iced.FlowControl.ConditionalBranch && near ? 'branch'
          : flow === iced.FlowControl.UnconditionalBranch && near ? 'jump'
          : flow === iced.FlowControl.IndirectBranch ? 'indirect-jump'
          : flow === iced.FlowControl.Return && ins.mnemonic === iced.Mnemonic.Ret ? 'return'
          : flow === iced.FlowControl.Interrupt || flow === iced.FlowControl.Exception ? 'interrupt' : 'unknown'
        instructions.push({ rva: pos, offset: pe.raw(pos), bytes: Array.from(code.subarray(pos - rva, pos - rva + ins.length), b => b.toString(16).padStart(2, '0')).join(' '), text: formatter.format(ins), meaning: nativeInstructionMeaning(ins, formatter, iced), kind, flow: flowKind, target, names: target === undefined ? [] : symbols.get(target) || [], follow: target !== undefined && pe.executable(target) && (flow === iced.FlowControl.Call || target < rva || target >= rva + available), facts: { operation: iced.Mnemonic[ins.mnemonic].toLowerCase(), operands: Array.from({ length: ins.opCount }, (_, n) => formatter.formatOperand(ins, n)), writesZeroFlag: (ins.rflagsModified & iced.RflagsBits.ZF) !== 0 } })
        if (confirmed && pos + ins.length === f.end && [iced.FlowControl.Next, iced.FlowControl.ConditionalBranch, iced.FlowControl.Call, iced.FlowControl.IndirectCall].includes(flow) && pe.executable(f.end)) nextRva = f.end
      } finally { ins.free() }
    }
    if (decoder.canDecode && instructions.length === 5000) warnings.push('表示上限の5000命令で止めました。')
  } finally { decoder.free(); formatter.free() }
  return { rva, offset, names: symbols.get(rva) || [], range: confirmed ? `DLLの区間: ${address(rva)}〜${address(f.end)}（終端を含まない）` : '終端未確認の参考表示', warnings, instructions, nextRva }
}

export function formatNativeBody(summary: NativeSummary, body: NativeBody) {
  const guide = getNativeMethodGuide(summary, body.rva)
  const explanation = guide ? [guide.title, '解析済みのファイルと一致。主な流れの説明であり、各行を順番に実行するとは限りません。異常時の処理などは一部省略しています。', 'まとまり\t確認できた動作\tゲーム上の意味・未確認の点\t根拠のRVA', ...guide.blocks.map(block => [block.title, block.action, block.interpretation, block.evidence.map(item => address(item.rva)).join(' / ')].join('\t')), ''] : []
  return [`対象: ${body.names.join(' / ') || address(body.rva)}`, `DAT: ${summary.datName}`, `DAT SHA-256: ${summary.datHash}`, `DLL: ${summary.dllName}`, `DLL SHA-256: ${summary.dllHash}`, `開始RVA: ${address(body.rva)}`, `DLL内位置: ${address(body.offset)}`, body.range, ...body.warnings, '命令は配置順です。実行順やゲーム仕様を確定した記録ではありません。', '', formatNativeFlow(body), '', ...explanation, 'RVA\tDLL内位置\tバイト列\t命令\t意味\t区分\t移動・呼出し先', ...body.instructions.map(i => [address(i.rva), address(i.offset), i.bytes, i.text, i.meaning, i.kind, i.target === undefined ? '' : `${address(i.target)} ${i.names.join(' / ')}`].join('\t'))].join('\r\n')
}
