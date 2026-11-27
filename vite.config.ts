import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { icedBrowserPlugin } from './scripts/icedBrowserPlugin.mjs'
import { localMetadataPlugin } from './scripts/localMetadataPlugin.mjs'
import { localGameDataPlugin } from './scripts/localGameDataPlugin.mjs'
import { enemySpawnDefaultPlugin } from './scripts/enemySpawnDefaultPlugin.mjs'

export default defineConfig({
  plugins: [react(), icedBrowserPlugin(), localMetadataPlugin(), localGameDataPlugin(), enemySpawnDefaultPlugin()],
  worker: { format: 'es', plugins: () => [icedBrowserPlugin()] },
  base: '/arknights_2/',
})
