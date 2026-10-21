import { open, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { LOCAL_GAME_DATA_FILES, LOCAL_GAME_DATA_GENERATED_FILES, LOCAL_GAME_DATA_MANIFEST_FILE,
  LOCAL_GAME_DATA_RUNTIME_FILES } from '../src/lib/localGameDataContract.ts'

const DATA_FILES = new Set(LOCAL_GAME_DATA_FILES)
const isRuntimeFile = file => file.startsWith('runtime/')
const isManagedFile = file => DATA_FILES.has(file) || /^maps\/details-[^/]+\.json$/.test(file) || isRuntimeFile(file)

function snapshotSource(snapshot) {
  if (!snapshot || typeof snapshot.id !== 'string' || !isAbsolute(snapshot.directory || '')
    || typeof snapshot.generatedAt !== 'string' || !Array.isArray(snapshot.files)) return null
  return { ...snapshot, files: new Set(snapshot.files.filter(file => DATA_FILES.has(file))) }
}

function fail(res, status, method) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(method === 'HEAD' ? undefined : 'Local game data is unavailable.')
}

function manifestResponse(res, method, active) {
  const available = active && Object.values(LOCAL_GAME_DATA_RUNTIME_FILES).every(file => active.files.has(file))
  const manifest = available
    ? { schemaVersion: 1, available: true, revision: active.revision, version: active.generatedAt }
    : { schemaVersion: 1, available: false }
  const bytes = Buffer.from(JSON.stringify(manifest))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(bytes.length))
  res.end(method === 'HEAD' ? undefined : bytes)
}

function inside(directory, file) {
  const child = relative(directory, file)
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

/** Only the generated data allowlist is exposed; all other public files retain Vite's handling. */
export function createLocalGameDataMiddleware({ base = '/', getActive, getPrevious = () => null, publicSource = null }) {
  const prefix = `${base === '/' ? '' : `/${base.replace(/^\/+|\/+$/g, '')}`}/data/`
  return async function localGameDataMiddleware(req, res, next) {
    const [rawPath, query = ''] = (req.url || '').split('?', 2)
    let pathname
    try { pathname = decodeURIComponent(rawPath) }
    catch { return rawPath.startsWith(prefix) ? fail(res, 400, req.method) : next() }
    if (!pathname.startsWith(prefix)) return next()
    const file = pathname.slice(prefix.length)
    if (/[\\\0]/.test(file) || file.split('/').some(segment => segment === '.' || segment === '..')) {
      return fail(res, 400, req.method)
    }
    if (!isManagedFile(file)) return next()
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      return fail(res, 405, req.method)
    }
    const active = getActive()
    if (file === LOCAL_GAME_DATA_MANIFEST_FILE) return manifestResponse(res, req.method, active)
    if (!active) return isRuntimeFile(file) ? fail(res, 404, req.method) : next()
    let source = active
    const versions = new URLSearchParams(query).getAll('v')
    if (versions.length > 1) return fail(res, 400, req.method)
    const version = versions[0]
    if (version && version !== active.generatedAt) {
      const previous = getPrevious()
      source = previous?.generatedAt === version ? previous
        : publicSource?.generatedAt === version ? publicSource : null
    }
    if (!source?.files.has(file)) return fail(res, 404, req.method)
    let handle
    try {
      const directory = await realpath(source.directory)
      const path = await realpath(resolve(directory, file))
      if (!inside(directory, path)) return fail(res, 404, req.method)
      handle = await open(path, 'r')
      const stat = await handle.stat()
      if (!stat.isFile()) return fail(res, 404, req.method)
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Length', String(stat.size))
      if (req.method === 'HEAD' || !stat.size) return res.end()
      await pipeline(handle.createReadStream({ start: 0, end: stat.size - 1, autoClose: false }), res)
    } catch (error) {
      if (res.headersSent || res.destroyed) {
        if (!res.destroyed) res.destroy()
      } else {
        res.removeHeader('Content-Length')
        fail(res, error?.code === 'ENOENT' || error?.code === 'ENOTDIR' ? 404 : 503, req.method)
      }
    } finally {
      await handle?.close().catch(() => {})
    }
  }
}

async function publicSnapshot(root, publicDir) {
  if (publicDir === false) return null
  const directory = resolve(publicDir || resolve(root, 'public'), 'data')
  try {
    const index = JSON.parse(await readFile(resolve(directory, 'maps/index.json'), 'utf8'))
    if (typeof index.generatedAt !== 'string') return null
    return { directory, generatedAt: index.generatedAt, files: new Set(LOCAL_GAME_DATA_GENERATED_FILES) }
  } catch { return null }
}

/** Refresh only the development server; production builds and preview remain reproducible. */
export function localGameDataPlugin(options = {}) {
  let controller
  return {
    name: 'local-game-data',
    apply: 'serve',
    async configureServer(server) {
      const currentController = new AbortController()
      controller = currentController
      const signal = currentController.signal
      const root = server.config.root
      const logger = options.logger || server.config.logger
      const log = message => logger.info?.(`[ローカルデータ] ${message}`)
      const warn = message => logger.warn?.(`[ローカルデータ] ${message}`)
      const readSnapshot = options.readSnapshot || (async path =>
        (await import('./refreshLocalGameData.mjs')).readActiveLocalDataSnapshot(path))
      const refresh = options.refresh || (async request =>
        (await import('./refreshLocalGameData.mjs')).refreshLocalGameData(request))
      let active = null
      let previous = null
      server.httpServer?.once('close', () => currentController.abort())
      try { active = snapshotSource(await readSnapshot(root)) }
      catch { warn('保存済みデータを読めないため、同梱データを使用します。') }
      const shipped = await publicSnapshot(root, server.config.publicDir)
      if (signal.aborted) return
      server.middlewares.use(createLocalGameDataMiddleware({
        base: server.config.base, getActive: () => active, getPrevious: () => previous, publicSource: shipped,
      }))
      if ((options.env || process.env).ARKNIGHTS_AUTO_UPDATE === '0') {
        log('起動時の更新確認は無効です。')
        return
      }
      // Do not return this promise: network access and generation must not delay Vite startup.
      void Promise.resolve().then(() => refresh({ root, signal, logger })).then(result => {
        if (signal.aborted) return
        const next = snapshotSource(result.snapshot)
        if ((result.status === 'updated' || result.status === 'unchanged') && next) {
          const changed = next.id !== active?.id
          if (changed) { previous = active; active = next }
          if (changed) server.ws.send({ type: 'full-reload', path: '*' })
        }
      }).catch(() => {
        if (!signal.aborted) warn('更新できなかったため、現在のデータを使用します。')
      })
    },
    closeBundle() { controller?.abort() },
  }
}
