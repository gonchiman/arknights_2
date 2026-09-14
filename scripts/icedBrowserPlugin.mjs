import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

// Adapt the pinned upstream Node WASM glue at build time, without eval or vendored edits.
export function icedBrowserPlugin() {
  return {
    name: 'iced-browser',
    resolveId(id) { if (id === 'virtual:iced-browser') return '\0iced-browser' },
    load(id) {
      if (id !== '\0iced-browser') return
      const entry = require.resolve('iced-x86')
      const source = readFileSync(entry, 'utf8')
      const util = 'const { TextDecoder, TextEncoder } = require(`util`);'
      const end = source.indexOf("const path = require('path').join(__dirname, 'iced_x86_bg.wasm');")
      if (!source.includes(util) || end < 0) throw new Error('iced-x86 glue changed; review the browser adapter.')
      const wasmPath = entry.replace(/iced_x86\.js$/, 'iced_x86_bg.wasm').replace(/\\/g, '/')
      return `import wasmUrl from ${JSON.stringify(wasmPath + '?url')};\nconst api = {};\n` +
        source.slice(0, end).replace(util, '').replaceAll('module.exports', 'api') +
        '\nconst response = await fetch(wasmUrl);\nif (!response.ok) throw new Error("命令の読み取り機能を取得できませんでした。");\n' +
        'const loaded = await WebAssembly.instantiate(await response.arrayBuffer(), imports);\nwasm = loaded.instance.exports;\nexport default api;'
    },
  }
}
