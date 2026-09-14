import { extractGoldenglow, readAnalysisFile, type GoldenglowExtraction } from './codeAnalysis'

export type AnalysisRequest = { type: 'load'; requestId: number; fileName: string; buffer: ArrayBuffer }
export type AnalysisResponse =
  | { requestId: number; extraction: GoldenglowExtraction }
  | { requestId: number; error: string }

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const request = event.data
  try {
    const document = readAnalysisFile(request.fileName, request.buffer)
    self.postMessage({ requestId: request.requestId, extraction: extractGoldenglow(document) } satisfies AnalysisResponse)
  } catch (error) {
    self.postMessage({ requestId: request.requestId, error: error instanceof Error ? error.message : '読み取りに失敗しました。' } satisfies AnalysisResponse)
  }
}
