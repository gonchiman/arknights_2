const LOCAL_FILES = {
  metadata: { name: 'global-metadata.dat', maxBytes: 128 * 1024 * 1024 },
  binary: { name: 'GameAssembly.dll', maxBytes: 256 * 1024 * 1024 },
}

export async function readLocalAnalysisFile(kind: keyof typeof LOCAL_FILES, baseUrl: string, signal: AbortSignal): Promise<File> {
  const file = LOCAL_FILES[kind]
  const response = await fetch(`${baseUrl}__local-analysis/${kind}`, {
    signal, cache: 'no-store', redirect: 'error', mode: 'same-origin', credentials: 'omit',
    headers: { 'X-Arknights-Local-Read': '1' },
  })
  const size = Number(response.headers.get('Content-Length'))
  if (!response.ok || response.headers.get('Content-Type')?.split(';')[0] !== 'application/octet-stream' || !Number.isSafeInteger(size) || size <= 0 || size > file.maxBytes) {
    await response.body?.cancel()
    throw new Error('Local analysis file unavailable')
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength !== size) throw new Error('Incomplete local analysis file')
  signal.throwIfAborted()
  return new File([bytes], file.name, { type: 'application/octet-stream' })
}
