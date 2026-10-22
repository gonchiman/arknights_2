import type { Connect, Plugin } from 'vite'

export interface LocalGameDataSnapshot {
  id: string
  directory: string
  files: string[]
  generatedAt: string
  revision: string
}
export interface LocalGameDataSource extends Omit<LocalGameDataSnapshot, 'files'> { files: Set<string> }
export interface LocalGameDataLogger { info?(message: string): void; warn?(message: string): void }
export interface LocalGameDataPluginOptions {
  env?: Record<string, string | undefined>
  logger?: LocalGameDataLogger
  readSnapshot?: (root: string) => Promise<LocalGameDataSnapshot | null>
  refresh?: (options: { root: string; signal: AbortSignal; logger: LocalGameDataLogger }) => Promise<{
    status: 'updated' | 'unchanged' | 'failed' | 'busy'
    snapshot: LocalGameDataSnapshot | null
  }>
}
export function createLocalGameDataMiddleware(options: {
  base?: string
  getActive: () => LocalGameDataSource | null
  getPrevious?: () => LocalGameDataSource | null
  publicSource?: Pick<LocalGameDataSource, 'directory' | 'generatedAt' | 'files'> | null
}): Connect.NextHandleFunction
export function localGameDataPlugin(options?: LocalGameDataPluginOptions): Plugin
