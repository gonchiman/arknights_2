import { mapNativeMethods, decodeNativeBody, type NativeContext, type NativeSummary } from './nativeAnalysis'
import { decodeNativeSectionGraph } from './nativeSectionGraph'
export type NativeRequest = { id: number; type: 'load'; datName: string; dllName: string; dat: ArrayBuffer; dll: ArrayBuffer } | { id: number; type: 'body'; rva: number }
let context: NativeContext | null = null
const digest = async (buffer: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('')
self.onmessage = async ({ data }: MessageEvent<NativeRequest>) => {
  try {
    if (data.type === 'load') {
      context = null
      self.postMessage({ id: data.id, type: 'progress', text: 'ファイルの出典を確認しています…' })
      const [datHash, dllHash] = await Promise.all([digest(data.dat), digest(data.dll)])
      self.postMessage({ id: data.id, type: 'progress', text: 'DATの処理番号とDLLの対応表を照合しています…' })
      context = mapNativeMethods(data.datName, data.dat, data.dll)
      const summary: NativeSummary = { methods: context.methods, modules: context.modules, symbolCount: context.symbols.size, datName: data.datName, dllName: data.dllName, datHash, dllHash }
      self.postMessage({ id: data.id, type: 'loaded', summary })
    } else {
      if (!context) throw new Error('DLLを読み込んでください。')
      const iced = (await import('virtual:iced-browser')).default
      const body = decodeNativeBody(context, data.rva, iced)
      const graph = (() => {
        try { return decodeNativeSectionGraph(context!, data.rva, iced) }
        catch { return { entry: data.rva, names: body.names, nodes: [], edges: [], warnings: ['フロー図を生成できませんでした。命令の表示は利用できます。'] } }
      })()
      self.postMessage({ id: data.id, type: 'body', body, graph })
    }
  } catch (error) { self.postMessage({ id: data.id, type: 'error', error: error instanceof Error ? error.message : '処理本体を読み取れませんでした。' }) }
}
