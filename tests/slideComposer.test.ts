import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  containRect,
  fitText,
  imageDimensionError,
  imageFileError,
  legacyPortraitImageRect,
  portraitImageRect,
  renderSlide,
  slideFilename,
  slideLayout,
  transformPortraitRect,
  wrapText,
} from '../src/lib/slideComposer.ts'

function textContext() {
  return {
    font: '500 52px sans-serif',
    measureText(text: string) {
      const size = Number(this.font.match(/([\d.]+)px/)?.[1] ?? 52)
      return { width: Array.from(text).length * size }
    },
  }
}

test('スライドと主画像枠は16:9で、立ち絵と字幕に重ならない', () => {
  assert.equal(SLIDE_WIDTH / SLIDE_HEIGHT, 16 / 9)
  for (const showPortrait of [true, false]) {
    const boxes = slideLayout(showPortrait)
    assert.ok(Math.abs(boxes.main.width / boxes.main.height - 16 / 9) < 1e-12)
    assert.ok(boxes.main.y >= boxes.header.height)
    assert.ok(boxes.main.y + boxes.main.height < boxes.caption.y)
    assert.ok(boxes.main.x >= 0 && boxes.main.x + boxes.main.width <= SLIDE_WIDTH)
    if (showPortrait) assert.ok(boxes.main.x + boxes.main.width < boxes.portrait.x)
    else assert.ok(Math.abs(boxes.main.x + boxes.main.width / 2 - SLIDE_WIDTH / 2) < 1e-12)
  }
})

test('縦長・横長の画像の全体を収め、立ち絵は下端を揃える', () => {
  const box = { x: 10, y: 20, width: 200, height: 100 }
  assert.deepEqual(containRect(100, 200, box), { x: 85, y: 20, width: 50, height: 100 })
  assert.deepEqual(containRect(400, 100, box), { x: 10, y: 45, width: 200, height: 50 })
  assert.deepEqual(containRect(400, 100, box, 'bottom'), { x: 10, y: 70, width: 200, height: 50 })
  for (const width of [0, -1, NaN, Infinity]) assert.throws(() => containRect(width, 10, box))
})

test('以前に保存した530×930の立ち絵の基準配置をそのまま復元できる', () => {
  const box = slideLayout().portrait
  const rect = legacyPortraitImageRect(530, 930, box, 165, 100, 100)
  const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9)
  near(rect.width, 612.7141935483871)
  near(rect.height, 1075.14)
  near(rect.x, 1307.2858064516129)
  near(rect.y, 4.86)
  assert.deepEqual(portraitImageRect(530, 930, box, 165, rect.x, rect.y), rect)
})

test('530×930の立ち絵は基準の2倍まで拡大でき、画像全体のサイズで制限されない', () => {
  const box = slideLayout().portrait
  const base = portraitImageRect(530, 930, box, 165, 1200, 5)
  const enlarged = portraitImageRect(530, 930, box, 330, 1200, 5)
  assert.equal(enlarged.width, base.width * 2)
  assert.equal(enlarged.height, base.height * 2)
  assert.equal(enlarged.x, 1200)
  assert.equal(enlarged.y, 5)
  assert.ok(enlarged.height > SLIDE_HEIGHT)
  assert.ok(enlarged.x + enlarged.width > SLIDE_WIDTH)
})

test('立ち絵は縦横比を保ち、既定の配置では下端と中央を基準に拡大する', () => {
  const box = slideLayout().portrait
  for (const [width, height] of [[530, 930], [100, 2000], [500, 500], [2000, 100]]) {
    const fitted = containRect(width, height, box, 'bottom')
    assert.deepEqual(portraitImageRect(width, height, box), fitted)
    for (const scale of [25, 50, 100, 165, 330, 1000]) {
      const rect = portraitImageRect(width, height, box, scale)
      assert.ok(Math.abs(rect.width / rect.height - width / height) < 1e-9)
      assert.ok(Math.abs(rect.width - fitted.width * scale / 100) < 1e-9)
      assert.ok(Math.abs(rect.x + rect.width / 2 - fitted.x - fitted.width / 2) < 1e-9)
      assert.ok(Math.abs(rect.y + rect.height - fitted.y - fitted.height) < 1e-9)
    }
  }
})

test('位置はスライドの絶対座標で指定でき、拡大しても200pxの移動量を保つ', () => {
  const box = slideLayout().portrait
  for (const scale of [25, 165, 330, 1000]) {
    const base = portraitImageRect(530, 930, box, scale, -100, -100)
    const moved = portraitImageRect(530, 930, box, scale, 100, 100)
    assert.equal(base.x, -100)
    assert.equal(base.y, -100)
    assert.equal(moved.x - base.x, 200)
    assert.equal(moved.y - base.y, 200)
    assert.equal(moved.width, base.width)
    assert.equal(moved.height, base.height)
  }
})

test('基準の上辺中央を保って拡大し、画像サイズに依存せず上下左右へ移動する', () => {
  const base = legacyPortraitImageRect(530, 930, slideLayout().portrait, 165, 100, 100)
  assert.deepEqual(transformPortraitRect(base), base)
  for (const scale of [25, 100, 150, 200]) {
    const enlarged = transformPortraitRect(base, scale)
    const moved = transformPortraitRect(base, scale, -200, 200)
    assert.ok(Math.abs(enlarged.x + enlarged.width / 2 - base.x - base.width / 2) < 1e-9)
    assert.equal(enlarged.y, base.y)
    assert.ok(Math.abs(enlarged.width - base.width * scale / 100) < 1e-9)
    assert.ok(Math.abs(enlarged.height - base.height * scale / 100) < 1e-9)
    assert.equal(moved.x - enlarged.x, -200)
    assert.equal(moved.y - enlarged.y, 200)
  }
})

test('不正な倍率は100%に戻し、不正な位置や移動量は既定値で扱う', () => {
  const box = slideLayout().portrait
  const fitted = containRect(530, 930, box, 'bottom')
  for (const invalid of [0, -100, NaN, Infinity, -Infinity]) {
    assert.deepEqual(portraitImageRect(530, 930, box, invalid), fitted)
    assert.deepEqual(transformPortraitRect(fitted, invalid), fitted)
  }
  const defaultRect = portraitImageRect(530, 930, box, 150)
  for (const invalid of [undefined, NaN, Infinity, -Infinity]) {
    assert.deepEqual(portraitImageRect(530, 930, box, 150, invalid, invalid), defaultRect)
    assert.equal(portraitImageRect(530, 930, box, 150, invalid, 0).x, defaultRect.x)
    assert.equal(portraitImageRect(530, 930, box, 150, 0, invalid).y, defaultRect.y)
    assert.deepEqual(transformPortraitRect(fitted, 100, invalid, invalid), fitted)
  }
})

test('立ち絵の倍率と位置を維持し、字幕の手前・背後の設定に応じて一度だけ描画する', () => {
  const mainImage = {} as HTMLImageElement
  const portraitImage = {} as HTMLImageElement
  const boxes = slideLayout()
  for (const percent of [50, 100, 165, 330]) {
    for (const portraitBehindCaption of [undefined, false, true]) {
      const calls: { name: string; args: unknown[] }[] = []
      const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args }) }
      const context = {
        ...textContext(),
        save: record('save'), restore: record('restore'), clearRect: record('clearRect'),
        fillRect: record('fillRect'), fillText: record('fillText'), drawImage: record('drawImage'),
        beginPath: record('beginPath'), rect: record('rect'), clip: record('clip'),
      }
      renderSlide(context as unknown as CanvasRenderingContext2D, {
        main: { image: mainImage, width: 1600, height: 900, name: 'main.png' },
        portrait: { image: portraitImage, width: 530, height: 930, name: 'portrait.png' },
        title: 'タイトル', caption: '字幕', theme: 'light', showPortrait: true,
        portraitScale: percent, portraitPositionX: -200, portraitPositionY: 200,
        ...(portraitBehindCaption === undefined ? {} : { portraitBehindCaption }),
      })
      const mainDraw = calls.find((call) => call.name === 'drawImage' && call.args[0] === mainImage)
      const mainRect = containRect(1600, 900, boxes.main)
      assert.deepEqual(mainDraw?.args, [mainImage, mainRect.x, mainRect.y, mainRect.width, mainRect.height])
      const portraitIndex = calls.findIndex((call) => call.name === 'drawImage' && call.args[0] === portraitImage)
      assert.equal(calls.filter((call) => call.name === 'drawImage' && call.args[0] === portraitImage).length, 1)
      assert.ok(portraitIndex > calls.indexOf(mainDraw!))
      const rect = portraitImageRect(530, 930, boxes.portrait, percent, -200, 200)
      assert.deepEqual(calls[portraitIndex].args, [portraitImage, rect.x, rect.y, rect.width, rect.height])
      assert.equal(calls.some((call) => call.name === 'clip'), false)
      const captionIndex = calls.findIndex((call) => call.name === 'fillText' && call.args[0] === '字幕')
      const captionBackgroundIndex = calls.findIndex((call) => call.name === 'fillRect' && call.args[1] === boxes.caption.y)
      assert.ok(captionBackgroundIndex >= 0 && captionIndex > captionBackgroundIndex)
      if (portraitBehindCaption) {
        assert.ok(portraitIndex < captionBackgroundIndex && portraitIndex < captionIndex)
      } else {
        assert.ok(portraitIndex > captionBackgroundIndex && portraitIndex > captionIndex)
        assert.deepEqual(calls.slice(portraitIndex + 1).map((call) => call.name), ['restore'])
      }
    }
  }
})

test('日本語と改行を維持しながら、字幕を2行へ自動縮小する', () => {
  const ctx = textContext()
  assert.deepEqual(wrapText(ctx, 'あいう\r\nえお', 104), ['あい', 'う', 'えお'])
  assert.deepEqual(wrapText(ctx, '😀😀😀', 104), ['😀😀', '😀'])
  const caption = fitText(ctx, 'あ'.repeat(80), 1728, 2, 52, 28)
  assert.equal(caption.fits, true)
  assert.equal(caption.lines.length, 2)
  assert.ok(caption.size < 52 && caption.size >= 28)
  assert.ok(caption.lines.every((line) => ctx.measureText(line).width <= 1728))
  assert.equal(fitText(ctx, '1行目\n2行目\n3行目', 1728, 2, 52, 28).fits, false)
  assert.equal(fitText(ctx, 'あ'.repeat(125), 1728, 2, 52, 28).fits, false)
})

test('長いタイトルは1行へ縮小し、空欄と収まらない文章を区別する', () => {
  const ctx = textContext()
  const title = fitText(ctx, '章'.repeat(60), 1500, 1, 44, 22)
  assert.equal(title.fits, true)
  assert.equal(title.lines.length, 1)
  assert.equal(title.size, 25)
  assert.equal(fitText(ctx, '章'.repeat(69), 1500, 1, 44, 22).fits, false)
  assert.deepEqual(fitText(ctx, '', 1500, 1, 44, 22), { lines: [], size: 44, fits: true })
})

test('許可形式と容量を検証し、別形式の偽装や空ファイルを拒否する', () => {
  for (const [name, type] of [['a.png', 'image/png'], ['a.jpg', 'image/jpeg'], ['a.webp', 'image/webp'], ['a.JPEG', '']]) {
    assert.equal(imageFileError({ name, type, size: 25 * 1024 * 1024 }), '')
  }
  for (const file of [
    { name: 'a.png', type: 'image/svg+xml', size: 100 },
    { name: 'a.gif', type: '', size: 100 },
    { name: 'a.png', type: 'image/png', size: 0 },
    { name: 'a.png', type: 'image/png', size: 25 * 1024 * 1024 + 1 },
  ]) assert.notEqual(imageFileError(file), '')
})

test('画像の画素数と一辺の上限をそれぞれ検証する', () => {
  assert.equal(imageDimensionError(8000, 5000), '')
  assert.equal(imageDimensionError(16384, 1), '')
  for (const [width, height] of [[8001, 5000], [16385, 1], [1, 16385], [0, 100], [100, -1], [NaN, 100], [100, Infinity]]) {
    assert.notEqual(imageDimensionError(width, height), '')
  }
})

test('保存名は日本語タイトルを使い、禁止文字と末尾のドットを除く', () => {
  assert.equal(slideFilename(' ゴールデングロー解説 '), 'ゴールデングロー解説.png')
  assert.equal(slideFilename('S3: MOD/比較?.'), 'S3_ MOD_比較_.png')
  assert.equal(slideFilename('... '), 'arknights-slide.png')
  assert.equal(slideFilename('あ'.repeat(70)), `${'あ'.repeat(60)}.png`)
})
