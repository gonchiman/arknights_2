export const GOLDENGLOW_BAR_PALETTES = {
  blue: {
    label: '青',
    colors: ['#7aafd2', '#5b99c4', '#3e80af', '#2d6593', '#234e79', '#173650'],
  },
  green: {
    label: '緑',
    colors: ['#8abd9a', '#69a67f', '#4a8c65', '#357450', '#285d40', '#1b452f'],
  },
  purple: {
    label: '紫',
    colors: ['#bca0d4', '#a080bd', '#8562a4', '#6d4e89', '#553b6e', '#3e2a53'],
  },
  orange: {
    label: 'オレンジ',
    colors: ['#dfa36b', '#cf8a4e', '#b87036', '#99582b', '#7a4221', '#5e311b'],
  },
  pink: {
    label: 'ピンク',
    colors: ['#d9a0b8', '#c882a1', '#b1668b', '#94516f', '#783e58', '#5d2d43'],
  },
} as const

export type GoldenglowBarPaletteKey = keyof typeof GOLDENGLOW_BAR_PALETTES

type RgbColor = readonly [number, number, number]

function parseHexColor(color: string): RgbColor | null {
  if (!/^#[\da-f]{6}$/i.test(color)) return null
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ]
}

function rgbToHex(channels: readonly number[]): string {
  return '#' + channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')
}

const blueColors = GOLDENGLOW_BAR_PALETTES.blue.colors.map((color) => parseHexColor(color)!)
const barLightnesses = blueColors.map((channels) => (Math.max(...channels) + Math.min(...channels)) / 510)

export function createGoldenglowBarPalette(color: string): readonly string[] {
  const channels = parseHexColor(color)
  if (!channels) return GOLDENGLOW_BAR_PALETTES.blue.colors

  const [red, green, blue] = channels.map((channel) => channel / 255)
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const difference = maximum - minimum
  const lightness = (maximum + minimum) / 2
  const saturation = difference === 0 ? 0 : difference / (1 - Math.abs(2 * lightness - 1))
  let hue = 0
  if (difference !== 0) {
    if (maximum === red) hue = (green - blue) / difference
    else if (maximum === green) hue = (blue - red) / difference + 2
    else hue = (red - green) / difference + 4
    hue = (hue / 6 + 1) % 1
  }

  // Preserve the chosen hue and saturation, but keep a readable, ordered tone range.
  // Fixed lightness also gives black and white selections six distinct gray tones.
  return barLightnesses.map((toneLightness) => {
    const amplitude = saturation * Math.min(toneLightness, 1 - toneLightness)
    const channel = (offset: number) => {
      const position = (offset + hue * 12) % 12
      return 255 * (toneLightness - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1)))
    }
    return rgbToHex([channel(0), channel(8), channel(4)])
  })
}

export function goldenglowResistanceBarColor(
  resistance: number,
  colors: readonly string[] = GOLDENGLOW_BAR_PALETTES.blue.colors,
): string {
  const parsedColors = colors.map(parseHexColor)
  const resistanceBarColors = parsedColors.length >= 2 && parsedColors.every((color) => color !== null)
    ? parsedColors
    : blueColors
  // Anchor each color to its RES value so filtering or changing the step keeps it stable.
  const position = Math.max(0, Math.min(100, Number.isFinite(resistance) ? resistance : 0)) / 100 * (resistanceBarColors.length - 1)
  const lower = Math.floor(position)
  const upper = Math.min(lower + 1, resistanceBarColors.length - 1)
  const fraction = position - lower
  return rgbToHex(resistanceBarColors[lower].map((channel, index) => (
    channel + (resistanceBarColors[upper][index] - channel) * fraction
  )))
}
