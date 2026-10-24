import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { createEnemyHistogramSnapshot } from '../src/lib/enemyHistogramSnapshot.ts'

const version = { id: 'v2', label: '第2版', sourceRevision: 'source-v2', ruleVersion: 'rules-v2' }
const row = { id: 'enemy_fixture', name: '検証用の敵', levelType: 'NORMAL', stats: { magicResistance: 10 } }
const counts = { schemaVersion: 1, generatedAt: 'v2-fixture', sourceGeneratedAt: null,
  summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
  enemies: { enemy_fixture: { mapCount: 1, spawnCount: 7 } } }
let server, Editor, fixture

before(async () => {
  server = await createServer({ configFile: false, plugins: [react(), {
    name: 'enemy-histogram-version-routing-fixture', enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'virtual:enemy-version-fixture') return '\0enemy-version-fixture'
      if (!importer?.endsWith('/EnemyResistanceHistogramEditor.tsx')) return
      if (source === '../lib/useEnemyAggregation' || source === '../lib/useEnemyRecords') return '\0enemy-version-fixture'
      if (source === './EnemyStatisticsPanel') return '\0enemy-version-panel'
      if (source === './EnemyAnalysisFilters') return '\0enemy-version-filters'
    },
    load(id) {
      if (id === '\0enemy-version-fixture') return `
        export let calls = [];
        export let current;
        export function setState(state) { current = state; calls.length = 0; }
        export function useEnemyAggregation(options) { calls.push(['versioned', options]); return current; }
        export function useEnemyRecords() { calls.push(['legacy']); return { rows: [], loading: false, error: null, retry() {} }; }
      `
      if (id === '\0enemy-version-panel') return `
        import { createElement } from 'react';
        export function useEnemyStatisticsControls() { return {}; }
        export function EnemyStatisticsPanel(props) {
          return createElement('output', { 'data-aggregation-version': props.aggregationVersion?.id,
            'data-counts-version': props.aggregationCounts?.generatedAt }, props.rows.map(row => row.id).join(','));
        }
      `
      if (id === '\0enemy-version-filters') return 'export function EnemyAnalysisFilters() { return null }'
    },
  }], cacheDir: 'node_modules/.vite/enemy-histogram-version-routing-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  fixture = await server.ssrLoadModule('virtual:enemy-version-fixture')
  ;({ EnemyResistanceHistogramEditor: Editor } = await server.ssrLoadModule('/src/components/EnemyResistanceHistogramEditor.tsx'))
})
after(async () => { await server?.close() })

function ready(overrides = {}) {
  return { data: { rows: [row], counts }, version, loading: false, error: null, retry() {}, ...overrides }
}
function snapshot(aggregationVersion) {
  return createEnemyHistogramSnapshot({ metric: 'magicResistance',
    source: { scopeLabel: '通常', enemyIds: [row.id], countGeneratedAt: counts.generatedAt,
      ...(aggregationVersion ? { aggregationVersion } : {}) },
    countMode: 'SPAWNS', coverage: counts.summary, scale: 'LINEAR',
    statistics: calculateWeightedHistogram([{ value: 10, weight: 7 }]), ratingBins: null,
    customLinearUpperBound: null, showPercentages: false, showBinRanges: false,
    referenceVisibility: { mean: false, median: false },
  })
}
function render(initialSnapshot) {
  return renderToStaticMarkup(createElement(Editor, { initialSnapshot, onChange() {} }))
}

test('新規ヒストグラムは選択中の集計版と出現数を使用する', () => {
  fixture.setState(ready())
  const markup = render(null)
  assert.deepEqual(fixture.calls, [['versioned', { versionId: undefined }]])
  assert.match(markup, /data-aggregation-version="v2"/)
  assert.match(markup, /data-counts-version="v2-fixture"/)
  assert.match(markup, /enemy_fixture/)
})

test('版付き分布の編集は保存された版を指定し、旧分布だけ従来の読込を維持する', () => {
  fixture.setState(ready())
  assert.match(render(snapshot(version)), /data-aggregation-version="v2"/)
  assert.deepEqual(fixture.calls, [['versioned', { versionId: 'v2' }]])
  fixture.setState(ready())
  assert.doesNotMatch(render(snapshot()), /data-aggregation-version/)
  assert.deepEqual(fixture.calls, [['legacy']])
})

test('新規分布の読込中・失敗時と固定版の不一致では現行データを代用しない', () => {
  for (const state of [ready({ data: null, loading: true }), ready({ data: null, error: '取得失敗' })]) {
    fixture.setState(state)
    assert.doesNotMatch(render(null), /<output/)
    assert.ok(fixture.calls.every(([kind]) => kind === 'versioned'))
  }
  fixture.setState(ready({ version: { ...version, sourceRevision: 'different-source' } }))
  const mismatch = render(snapshot(version))
  assert.doesNotMatch(mismatch, /<output/)
  assert.match(mismatch, /版情報が一致しません/)
})
