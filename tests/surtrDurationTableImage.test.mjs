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
const sectionRows = (markup, section) => {
  const body = new RegExp(`<${section}\\b[^>]*>([\\s\\S]*?)<\\/${section}>`).exec(markup)?.[1] ?? ''
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(row => [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(cell => text(cell[1])))
}
const bodyRows = markup => sectionRows(markup, 'tbody')
const timelineRows = (markup, layout = 'vertical') => {
  const body = bodyRows(markup)
  if (layout === 'vertical') return body
  const head = sectionRows(markup, 'thead')
  assert.equal(head.length, 1)
  assert.equal(head[0][0], '経過時間（秒）')
  assert.deepEqual(body.map(row => row[0]), ['残りHP', '残HP率', '状態'])
  assert.ok(body.every(row => row.length === head[0].length))
  return head[0].slice(1).map((time, index) => [time, ...body.map(row => row[index + 1])])
}
const verifyHeaderReferences = markup => {
  const headerIds = [...markup.matchAll(/<th\b[^>]*\bid="([^"]+)"[^>]*>/g)].map(match => match[1])
  assert.equal(new Set(headerIds).size, headerIds.length, 'header IDs must be unique')
  const cells = [...markup.matchAll(/<td\b[^>]*\bheaders="([^"]+)"[^>]*>/g)]
  assert.ok(cells.length > 0, 'horizontal values must reference their time and metric headers')
  for (const cell of cells) {
    const references = cell[1].split(' ')
    assert.equal(references.length, 2)
    for (const reference of references) assert.ok(headerIds.includes(reference), `missing header ${reference}`)
  }
}
const rowsFor = (changes = {}, step = 1) => {
  const current = { ...model, ...changes }
  const result = calculateSurtrDuration(current)
  assert.ok(result)
  return buildSurtrDurationTimeline(current, result, step)
}

test('both layouts retain all HP values and event times in the page, image and preview', () => {
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
      for (const layout of ['vertical', 'horizontal']) {
        const arranged = render(timeline.SurtrDurationTimelineTable, {
          rows, step, layout, onStepChange: () => {}, precision: 2, selectedTime: 25, onSelect: () => {},
        })
        assert.deepEqual(timelineRows(arranged, layout), expected)
        for (const component of [image.SurtrDurationTableImage, image.SurtrDurationTableImagePreview]) {
          for (const aspectRatio of [undefined, 16 / 9]) {
            const saved = render(component, { rows, layout, precision: 2, title, conditions, aspectRatio })
            assert.deepEqual(timelineRows(saved, layout), expected, `${component.name}/${layout}/${step}/${aspectRatio ?? 'auto'}`)
            assert.doesNotMatch(saved, /<button\b|<select\b|<details\b|is-selected|aria-pressed/)
            if (layout === 'horizontal') verifyHeaderReferences(saved)
          }
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

test('horizontal time selection highlights exactly one entire column and is absent from images', () => {
  const rows = rowsFor({}, 5)
  const props = { rows, layout: 'horizontal', precision: 2, selectedTime: 25, onSelect: () => {} }
  const live = render(timeline.SurtrDurationTimelineTableContent, props)
  assert.equal((live.match(/<button\b/g) ?? []).length, rows.length)
  assert.equal((live.match(/aria-pressed="true"/g) ?? []).length, 1)
  assert.match(live, /aria-label="25.0秒をグラフで確認" aria-pressed="true"/)
  const selectedCells = [...live.matchAll(/<(th|td)\b[^>]*class="[^"]*\bis-selected\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/g)]
  assert.deepEqual(selectedCells.map(cell => text(cell[2])), ['25.0', '1', '0.01%', '余燼発動'])
  assert.deepEqual(timelineRows(live, 'horizontal'), bodyRows(render(timeline.SurtrDurationTimelineTableContent, { ...props, layout: 'vertical' })))
  verifyHeaderReferences(live)
  const saved = render(timeline.SurtrDurationTimelineTableContent, { ...props, forImage: true })
  assert.deepEqual(timelineRows(saved, 'horizontal'), timelineRows(live, 'horizontal'))
  assert.doesNotMatch(saved, /<button\b|is-selected|aria-pressed/)
  assert.equal((saved.match(/scope="col"/g) ?? []).length, rows.length + 1)
  assert.equal((saved.match(/scope="row"/g) ?? []).length, 3)
  verifyHeaderReferences(saved)
})

test('five-second horizontal output retains the startup, remnant and retreat columns', () => {
  const rows = rowsFor({}, 5)
  const saved = render(image.SurtrDurationTableImage, { rows, layout: 'horizontal', precision: 2, title, conditions })
  const values = timelineRows(saved, 'horizontal')
  assert.deepEqual(values.map(row => row[0]), ['0.0', '0.6', '5.0', '10.0', '15.0', '20.0', '25.0', '30.0', '33.0'])
  assert.deepEqual(values.find(row => row[0] === '0.6'), ['0.6', '7,916', '100.00%', '全回復'])
  assert.deepEqual(values.find(row => row[0] === '25.0'), ['25.0', '1', '0.01%', '余燼発動'])
  assert.deepEqual(values.at(-1), ['33.0', '—', '—', '退場'])
})

test('percentage precision matches the PNG without rounding stored HP or changing time precision', () => {
  const rows = rowsFor({}, 5)
  const original = structuredClone(rows)
  const expectedRemnantPercent = ['0%', '0.0%', '0.01%', '0.013%']
  for (const layout of ['vertical', 'horizontal']) {
    for (const precision of [0, 1, 2, 3]) {
      const live = render(timeline.SurtrDurationTimelineTableContent, { rows, layout, precision })
      const saved = render(image.SurtrDurationTableImage, { rows, layout, precision, title, conditions })
      assert.deepEqual(timelineRows(saved, layout), timelineRows(live, layout))
      assert.deepEqual(timelineRows(saved, layout).find(row => row[3] === '余燼発動'),
        ['25.0', '1', expectedRemnantPercent[precision], '余燼発動'])
      assert.deepEqual(timelineRows(saved, layout).find(row => row[0] === '5.0').slice(0, 2), ['5.0', '7,649'])
    }
    for (const precision of [-1, 1.5, 4, Infinity, NaN]) {
      const saved = render(image.SurtrDurationTableImage, { rows, layout, precision, title, conditions })
      assert.equal(timelineRows(saved, layout).find(row => row[3] === '余燼発動')[2], '0.01%')
    }
  }
  assert.deepEqual(rows, original)
  assert.notEqual(rows.find(row => row.time === 5).hp, Math.round(rows.find(row => row.time === 5).hp))
})

test('edited titles and calculation conditions are escaped as text in the image and preview', () => {
  const snapshot = {
    rows: rowsFor({}, 5), precision: 2, title: '<script>HP & 時刻</script>',
    conditions: ['潜在1 <img onerror="run">', '外部回復なし & 被ダメージなし'],
  }
  const before = structuredClone(snapshot)
  for (const layout of ['vertical', 'horizontal']) {
    for (const component of [image.SurtrDurationTableImage, image.SurtrDurationTableImagePreview]) {
      const markup = render(component, { ...snapshot, layout })
      assert.match(markup, /&lt;script&gt;HP &amp; 時刻&lt;\/script&gt;/)
      assert.match(markup, /潜在1 &lt;img onerror=&quot;run&quot;&gt;/)
      assert.match(markup, /外部回復なし &amp; 被ダメージなし/)
      assert.doesNotMatch(markup, /<script\b|<img\b/)
      assert.deepEqual(timelineRows(markup, layout), bodyRows(render(timeline.SurtrDurationTimelineTableContent, snapshot)))
    }
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
