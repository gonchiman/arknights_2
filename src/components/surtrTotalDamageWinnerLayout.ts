export interface SurtrTotalDamageWinnerGeometry {
  columnWidth: number
  rowHeight: number
  minimumWidth: number
}

export interface SurtrTotalDamageWinnerAppliedLayout extends SurtrTotalDamageWinnerGeometry {
  /** Complete table height with natural headers/footer and 44px body rows. */
  naturalHeight: number
}

const MINIMUM_COLUMN_WIDTH = 96
const BODY_ROW_HEIGHT = 44
const HORIZONTAL_TEXT_RESERVE = 24
const TABLE_BORDER_RESERVE = 2

/** Shared geometry for the screen, unscaled image preview and PNG source. */
export function calculateSurtrTotalDamageWinnerGeometry(
  textWidths: readonly number[],
  dataColumnCount: number,
  leadingColumnWidth: number,
  bodyRowCount = 0,
  bodyHeight?: number,
): SurtrTotalDamageWinnerGeometry {
  if (textWidths.some(width => !Number.isFinite(width) || width < 0)
    || !Number.isInteger(dataColumnCount) || dataColumnCount < 0
    || !Number.isFinite(leadingColumnWidth) || leadingColumnWidth <= 0
    || !Number.isInteger(bodyRowCount) || bodyRowCount < 0
    || (bodyHeight !== undefined && (!Number.isFinite(bodyHeight) || bodyHeight < 0))) {
    throw new Error('最大のMOD表のサイズを取得できませんでした。')
  }
  const columnWidth = Math.max(MINIMUM_COLUMN_WIDTH, Math.ceil(Math.max(0, ...textWidths)) + HORIZONTAL_TEXT_RESERVE)
  return {
    columnWidth,
    rowHeight: bodyRowCount > 0 && bodyHeight !== undefined
      ? Math.max(BODY_ROW_HEIGHT, bodyHeight / bodyRowCount) : BODY_ROW_HEIGHT,
    minimumWidth: Math.ceil(leadingColumnWidth + dataColumnCount * columnWidth + TABLE_BORDER_RESERVE),
  }
}

function tableColumns(table: HTMLTableElement): HTMLTableColElement[] {
  return Array.from(table.querySelectorAll<HTMLTableColElement>('col'))
}

function leadingWidth(table: HTMLTableElement): number {
  return tableColumns(table)[0]?.classList.contains('surtr-total-damage-resistance-column') ? 80 : 130
}

/**
 * Read matching typography in a hidden, untransformed probe. Measuring label
 * bounds directly would include the save dialog's scaled preview transform.
 */
export function measureSurtrTotalDamageWinnerLayout(table: HTMLTableElement): SurtrTotalDamageWinnerGeometry {
  const doc = table.ownerDocument
  const view = doc.defaultView
  if (!view) throw new Error('最大のMOD表のサイズを取得できませんでした。')
  const probe = doc.createElement('span')
  Object.assign(probe.style, {
    position: 'fixed', left: '0', top: '0', visibility: 'hidden', whiteSpace: 'pre',
    width: 'max-content', maxWidth: 'none', padding: '0', border: '0', margin: '0',
  })
  probe.setAttribute('aria-hidden', 'true')
  doc.body.appendChild(probe)
  const range = doc.createRange()
  try {
    const labels = Array.from(table.querySelectorAll<HTMLElement>('.surtr-total-damage-winner-label'))
    // Winner labels share one typography rule. Thousands of cells repeat the
    // same compact module names, so only distinct labels need a layout read.
    if (labels[0]) {
      const style = view.getComputedStyle(labels[0])
      Object.assign(probe.style, {
        fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
        fontStyle: style.fontStyle, fontStretch: style.fontStretch, fontVariantNumeric: style.fontVariantNumeric,
        fontFeatureSettings: style.fontFeatureSettings, fontKerning: style.fontKerning,
        letterSpacing: style.letterSpacing, lineHeight: style.lineHeight, textTransform: style.textTransform,
      })
    }
    const textWidths = Array.from(new Set(labels.map(label => label.textContent ?? ''))).map(text => {
      probe.textContent = text
      range.selectNodeContents(probe)
      return Math.max(range.getBoundingClientRect().width, probe.getBoundingClientRect().width)
    })
    const columnCount = Math.max(0, tableColumns(table).length - 1)
    return calculateSurtrTotalDamageWinnerGeometry(textWidths, columnCount, leadingWidth(table))
  } finally {
    range.detach()
    probe.remove()
  }
}

type SavedStyles = Map<HTMLElement, Map<string, { value: string; priority: string }>>
const savedStyles = new WeakMap<HTMLTableElement, SavedStyles>()

function setStyle(table: HTMLTableElement, element: HTMLElement, property: string, value: string): void {
  let elements = savedStyles.get(table)
  if (!elements) { elements = new Map(); savedStyles.set(table, elements) }
  let properties = elements.get(element)
  if (!properties) { properties = new Map(); elements.set(element, properties) }
  if (!properties.has(property)) properties.set(property, {
    value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property),
  })
  element.style.setProperty(property, value)
}

/** Restore only helper-owned inline properties when returning to numeric mode. */
export function clearSurtrTotalDamageWinnerLayout(table: HTMLTableElement): void {
  const elements = savedStyles.get(table)
  if (!elements) return
  elements.forEach((properties, element) => properties.forEach((original, property) => {
    if (original.value) element.style.setProperty(property, original.value, original.priority)
    else element.style.removeProperty(property)
  }))
  savedStyles.delete(table)
}

/**
 * Call after each candidate image width, then once more for the final body
 * height. Headers and footer always retain their natural height. Observing
 * width/font changes is the caller's responsibility.
 */
export function applySurtrTotalDamageWinnerLayout(
  table: HTMLTableElement,
  { bodyHeight }: { bodyHeight?: number } = {},
): SurtrTotalDamageWinnerAppliedLayout {
  const measured = measureSurtrTotalDamageWinnerLayout(table)
  const columns = tableColumns(table)
  const axisWidth = columns[0]?.classList.contains('surtr-total-damage-resistance-column') ? 80 : 130
  const rows = Array.from(table.tBodies).flatMap(body => Array.from(body.rows))
  const geometry = calculateSurtrTotalDamageWinnerGeometry(
    [measured.columnWidth - HORIZONTAL_TEXT_RESERVE], Math.max(0, columns.length - 1), axisWidth, rows.length, bodyHeight,
  )
  // Batch all computed-style reads before changing any table geometry. Reuse
  // border measurements for natural sizing and optional aspect-ratio expansion.
  const rowCells = rows.map(row => ({ row, cells: Array.from(row.cells).map(cell => {
    const button = cell.querySelector<HTMLElement>('.surtr-total-damage-value-button')
    const style = button ? table.ownerDocument.defaultView!.getComputedStyle(cell) : null
    const borders = style ? (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0) : 0
    return { cell, button, borders }
  }) }))
  setStyle(table, table, 'height', 'auto')
  setStyle(table, table, 'min-width', `${geometry.minimumWidth}px`)
  columns.forEach((column, index) => setStyle(table, column, 'width', `${index === 0 ? axisWidth : geometry.columnWidth}px`))

  const applyRowHeight = (height: number) => {
    setStyle(table, table, '--surtr-total-damage-winner-row-height', `${height}px`)
    for (const { row, cells } of rowCells) {
      setStyle(table, row, 'height', `${height}px`)
      for (const { cell, button, borders } of cells) {
        setStyle(table, cell, 'box-sizing', 'border-box')
        setStyle(table, cell, 'height', `${height}px`)
        if (button) {
          setStyle(table, button, 'box-sizing', 'border-box')
          setStyle(table, button, 'height', `${Math.max(0, height - borders)}px`)
          setStyle(table, button, 'min-height', `${Math.max(0, height - borders)}px`)
        }
      }
    }
  }
  applyRowHeight(BODY_ROW_HEIGHT)
  const naturalHeight = table.offsetHeight
  if (geometry.rowHeight > BODY_ROW_HEIGHT) applyRowHeight(geometry.rowHeight)
  return { ...geometry, naturalHeight }
}
