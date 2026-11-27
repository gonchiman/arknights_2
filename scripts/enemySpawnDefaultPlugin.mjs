import { resolve } from 'node:path'
import { normalizePath } from 'vite'
import { getEnemySpawnCalculationHash } from './lib/enemySpawnCalculationHash.mjs'

/** A saved summary can only be served with the calculator that produced it. */
export function enemySpawnDefaultPlugin() {
  let root, command, artifact
  const dependencies = new Set()
  return {
    name: 'dc3-enemy-default',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
      command = config.command
      artifact = normalizePath(resolve(root, 'src/data/damageThreeEnemySpawnDefault.json'))
    },
    transform(source, id) {
      if (id !== artifact) return
      dependencies.clear()
      const currentHash = getEnemySpawnCalculationHash(root, file => {
        dependencies.add(normalizePath(file))
        this.addWatchFile(file)
      })
      const saved = JSON.parse(source)
      if (currentHash === saved.calculationSha256 && Array.isArray(saved.statistics?.professionRows)
        && Array.isArray(saved.statistics?.rarityRows)) return
      const message = 'DC3の事前集計を npm run generate:dc3-enemy-default で更新してください。'
      if (command === 'build') this.error(message)
      this.warn(message)
      // A development edit can change the calculator before its summary is regenerated.
      return { code: JSON.stringify({ ...saved, skillDataSha256: '' }), map: null }
    },
    handleHotUpdate({ file, modules, server }) {
      if (!dependencies.has(normalizePath(file))) return
      const saved = server.moduleGraph.getModuleById(artifact)
      if (saved) return [...new Set([...modules, saved])]
    },
  }
}
