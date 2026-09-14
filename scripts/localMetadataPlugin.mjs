import { open } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'

export const LOCAL_METADATA_ROUTE = '/__local-analysis/metadata'
export const LOCAL_BINARY_ROUTE = '/__local-analysis/binary'
export const MAX_METADATA_BYTES = 128 * 1024 * 1024
export const MAX_BINARY_BYTES = 256 * 1024 * 1024
const DEFAULT_METADATA_PATH = 'C:/YostarGames/Arknights_JP/Arknights_Data/il2cpp_data/Metadata/global-metadata.dat'
const DEFAULT_BINARY_PATH = 'C:/YostarGames/Arknights_JP/GameAssembly.dll'
const LOOPBACK_PEERS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function expectedOrigin(req) {
  const host = req.headers.host
  if (typeof host !== 'string' || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)) return null
  try { return new URL(`${req.socket.encrypted ? 'https' : 'http'}://${host}`).origin }
  catch { return null }
}

function allowedRequest(req) {
  if (!LOOPBACK_PEERS.has(req.socket.remoteAddress)) return false
  const origin = expectedOrigin(req)
  if (!origin || req.headers['x-arknights-local-read'] !== '1') return false
  if (req.headers.origin !== undefined && req.headers.origin !== origin) return false
  const site = req.headers['sec-fetch-site']
  return site === undefined || site === 'same-origin'
}

function prepareResponse(res) {
  // Some dev-server middleware may already have supplied CORS response headers.
  for (const name of res.getHeaderNames()) {
    if (name.toLowerCase().startsWith('access-control-')) res.removeHeader(name)
  }
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

function fail(res, status, message) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(message)
}

/** The filesystem path is server configuration only; requests cannot select it. */
export function createLocalMetadataMiddleware({ metadataPath = DEFAULT_METADATA_PATH, binaryPath = DEFAULT_BINARY_PATH, base = '/' } = {}) {
  const prefix = base === '/' ? '' : `/${base.replace(/^\/+|\/+$/g, '')}`
  const resources = new Map([
    [prefix + LOCAL_METADATA_ROUTE, { path: metadataPath, maxBytes: MAX_METADATA_BYTES, message: 'Local metadata is unavailable.' }],
    [prefix + LOCAL_BINARY_ROUTE, { path: binaryPath, maxBytes: MAX_BINARY_BYTES, message: 'Local binary is unavailable.' }],
  ])
  return async function localMetadataMiddleware(req, res, next) {
    const requestUrl = req.url || ''
    const route = requestUrl.split(/[?#]/, 1)[0]
    const resource = resources.get(route)
    if (!resource) return next()
    const reject = status => fail(res, status, resource.message)
    prepareResponse(res)
    if (!allowedRequest(req)) return reject(403)
    if (requestUrl !== route) return reject(400)
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return reject(405)
    }

    let file
    try {
      file = await open(resource.path, 'r')
      const stat = await file.stat()
      if (!stat.isFile()) return reject(404)
      if (stat.size > resource.maxBytes) return reject(413)
      if (req.destroyed || res.destroyed) return
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Length', String(stat.size))
      if (!stat.size) return res.end()
      // Bound the stream even if the source grows after stat().
      await pipeline(file.createReadStream({ start: 0, end: stat.size - 1, autoClose: false }), res)
    } catch (error) {
      if (res.headersSent || res.destroyed) {
        if (!res.destroyed) res.destroy()
      } else {
        res.removeHeader('Content-Length')
        reject(error?.code === 'ENOENT' || error?.code === 'ENOTDIR' ? 404 : 503)
      }
    } finally {
      await file?.close().catch(() => {})
    }
  }
}

export function localMetadataPlugin(options = {}) {
  return {
    name: 'local-analysis-metadata',
    apply: 'serve',
    configureServer(server) {
      const middleware = createLocalMetadataMiddleware({ ...options, base: server.config.base })
      server.middlewares.use(middleware)
      // Vite installs CORS before configureServer, including automatic OPTIONS
      // responses. Put this exact-route guard first so CORS never exposes it.
      const stack = server.middlewares.stack
      const index = stack.findIndex(layer => layer.handle === middleware)
      if (index > 0) stack.unshift(...stack.splice(index, 1))
    },
  }
}
