import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let timeline
let image
let calculateSurtrDuration
let buildSurtrDurationTimeline
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/surtr-duration-table-image-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  timeline = await server.ssrLoadModule('/src/components/SurtrDurationTimelineTable.tsx')
  image = await server.ssrLoadModule('/src/components/SurtrDurationTableImage.tsx')
  ;({ calculateSurtrDuration } = await server.ssrLoadModule('/src/lib/surtrDuration.ts'))
  ;({ buildSurtrDurationTimeline } = await server.ssrLoadModule('/src/lib/surtrDurationTimeline.ts'))
})
after(async () => { await server?.close() })

const model = {
  moduleId: '', moduleType: null, moduleLevel: 0,
  skillName: 'ラグナロク', skillLevelIndex: 9, skillLevelLabel: '特化3', calculationKind: 'tick-estimate',
  baseMaxHp: 2916, skillHpBonus: 5000, maxHp: 7916, activationDelay: 0.6,
  drainInterval: 0.2, rampDuration: 60, maxDrainRate: 0.2, remnantDuration: 8,
}
const title = 'スルト S3 HPの推移（推定）'
const conditions = ['特化3・昇進2 Lv.90・信頼100・潜在1・未装備', '外部回復なし・被ダメージなし・準備0.6秒']
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const text = markup => markup.replace(/<[^>]*>/g, '')
const bodyRows = markup => {
  const body = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/.exec(markup)?.[1] ?? ''
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(row => [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(cell => text(cell[1])))
}
const rowsFor = (changes = {}, step = 1) => {
  const current = { ...model, ...changes }
  const result = calculateSurtrDuration(current)
  assert.ok(result)
  return buildSurtrDurationTimeline(current, result, step)
}

test('page, image and preview retain all HP rows and event times at either display interval', () => {
  for (const changes of [{}, { remnantDuration: 10 }, { activationDelay: 0.7, remnantDuration: 8.35 }]) {
    for (const step of [1, 5]) {
      const rows = rowsFor(changes, step)
      const before = structuredClone(rows)
      const live = render(timeline.SurtrDurationTimelineTable, {
        rows, step, onStepChange: () => {}, precision: 2, selectedTime: 25, onSelect: () => {},
      })
      const expected = bodyRows(live)
      assert.equal(expected.length, rows.length)
      assert.deepEqual(expected[0], ['0.0', '2,916', '100.00%', '発動'])
      assert.ok(expected.some(row => row[3] === '全回復'))
      assert.ok(expected.some(row => row[3] === '余燼発動'))
      assert.deepEqual(expected.at(-1).slice(1), ['—', '—', '退場'])
      assert.equal(Number(expected.at(-1)[0]), rows.at(-1).time)
      for (const component of [image.SurtrDurationTableImage, image.SurtrDurationTableImagePreview]) {
        for (const aspectRatio of [undefined, 16 / 9]) {
          const saved = render(component, { rows, precision: 2, title, conditions, aspectRatio })
          assert.deepEqual(bodyRows(saved), expected, `${component.name}/${step}/${aspectRatio ?? 'auto'}`)
          assert.doesNotMatch(saved, /<button\b|<select\b|<details\b|is-selected|aria-pressed/)
        }
      }
      assert.deepEqual(rows, before)
    }
  }
})

test('shared image content removes time controls and selection while retaining accessible table headers', () => {
  const rows = rowsFor({}, 5)
  const props = { rows, precision: 2, selectedTime: 25, onSelect: () => {} }
  const live = render(timeline.SurtrDurationTimelineTableContent, props)
  assert.equal((live.match(/<button\b/g) ?? []).length, rows.length)
  assert.equal((live.match(/class="is-selected"/g) ?? []).length, 1)
  assert.match(live, /aria-label="25.0秒をグラフで確認" aria-pressed="true"/)
  const saved = render(timeline.SurtrDurationTimelineTableContent, { ...props, forImage: true })
  assert.deepEqual(bodyRows(saved), bodyRows(live))
  assert.doesNotMatch(saved, /<button\b|is-selected|aria-pressed/)
  assert.equal((saved.match(/scope="col"/g) ?? []).length, 4)
  assert.equal((saved.match(/scope="row"/g) ?? []).length, rows.length)
})

test('percentage precision matches the PNG without rounding stored HP or changing time precision', () => {
  const rows = rowsFor({}, 5)
  const original = structuredClone(rows)
  const expectedRemnantPercent = ['0%', '0.0%', '0.01%', '0.013%']
  for (const precision of [0, 1, 2, 3]) {
    const live = render(timeline.SurtrDurationTimelineTableContent, { rows, precision })
    const saved = render(image.SurtrDurationTableImage, { rows, precision, title, conditions })
    assert.deepEqual(bodyRows(saved), bodyRows(live))
    assert.deepEqual(bodyRows(saved).find(row => row[3] === '余燼発動'),
      ['25.0', '1', expectedRemnantPercent[precision], '余燼発動'])
    assert.deepEqual(bodyRows(saved).find(row => row[0] === '5.0').slice(0, 2), ['5.0', '7,649'])
  }
  assert.deepEqual(rows, original)
  assert.notEqual(rows.find(row => row.time === 5).hp, Math.round(rows.find(row => row.time === 5).hp))
  for (const precision of [-1, 1.5, 4, Infinity, NaN]) {
    const saved = render(image.SurtrDurationTableImage, { rows, precision, title, conditions })
    assert.equal(bodyRows(saved).find(row => row[3] === '余燼発動')[2], '0.01%')
  }
})

test('edited titles and calculation conditions are escaped as text in the image and preview', () => {
  const snapshot = {
    rows: rowsFor({}, 5), precision: 2, title: '<script>HP & 時刻</script>',
    conditions: ['潜在1 <img onerror="run">', '外部回復なし & 被ダメージなし'],
  }
  const before = structuredClone(snapshot)
  for (const component of [image.SurtrDurationTableImage, image.SurtrDurationTableImagePreview]) {
    const markup = render(component, snapshot)
    assert.match(markup, /&lt;script&gt;HP &amp; 時刻&lt;\/script&gt;/)
    assert.match(markup, /潜在1 &lt;img onerror=&quot;run&quot;&gt;/)
    assert.match(markup, /外部回復なし &amp; 被ダメージなし/)
    assert.doesNotMatch(markup, /<script\b|<img\b/)
    assert.deepEqual(bodyRows(markup), bodyRows(render(timeline.SurtrDurationTimelineTableContent, snapshot)))
  }
  assert.deepEqual(snapshot, before)
})

test('the exporter rejects an empty table or invalid aspect before requesting browser rendering', async () => {
  const snapshot = { rows: [], precision: 2, title, conditions }
  await assert.rejects(image.saveSurtrDurationTableImage({ snapshot, filename: 'HP.png' }), /保存するHP推移表がありません/)
  for (const aspectRatio of [0, -1, Infinity, NaN, 0.09, 11]) {
    await assert.rejects(image.saveSurtrDurationTableImage({ snapshot, filename: 'HP.png', aspectRatio }), /表の縦横比/)
  }
})
