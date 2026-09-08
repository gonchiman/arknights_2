export interface PassiveDescriptionSegment {
  text: string
  changed: boolean
}

/** Split the current description into unchanged and added/replaced text. */
export function splitPassiveDescriptionChanges(before: string, after: string): PassiveDescriptionSegment[] {
  if (!after) return []
  if (before === after) return [{ text: after, changed: false }]

  // Keep values (including their sign and percentage) together, and preserve
  // Unicode code points instead of splitting surrogate pairs.
  const tokenize = (text: string) => text.match(/[+\-−＋－]?\p{Nd}+(?:[.．]\p{Nd}+)?[%％]?|[\s\S]/gu) ?? []
  const previous = tokenize(before)
  const current = tokenize(after)
  const segments: PassiveDescriptionSegment[] = []
  const append = (text: string, changed: boolean) => {
    if (!text) return
    const last = segments.at(-1)
    if (last?.changed === changed) last.text += text
    else segments.push({ text, changed })
  }

  // Anchor shared edges first so an inserted clause containing repeated words
  // remains one highlight rather than borrowing characters from its neighbors.
  let start = 0
  while (start < previous.length && start < current.length && previous[start] === current[start]) start += 1
  let previousEnd = previous.length
  let currentEnd = current.length
  while (previousEnd > start && currentEnd > start && previous[previousEnd - 1] === current[currentEnd - 1]) {
    previousEnd -= 1
    currentEnd -= 1
  }
  append(current.slice(0, start).join(''), false)

  const previousMiddle = previous.slice(start, previousEnd)
  const currentMiddle = current.slice(start, currentEnd)
  const lengths = Array.from({ length: previousMiddle.length + 1 }, () => new Uint32Array(currentMiddle.length + 1))
  for (let i = previousMiddle.length - 1; i >= 0; i -= 1) {
    for (let j = currentMiddle.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = previousMiddle[i] === currentMiddle[j]
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }

  let i = 0
  let j = 0
  while (j < currentMiddle.length) {
    if (i < previousMiddle.length && previousMiddle[i] === currentMiddle[j]) {
      append(currentMiddle[j], false)
      i += 1
      j += 1
    } else if (i < previousMiddle.length && lengths[i + 1][j] >= lengths[i][j + 1]) {
      i += 1
    } else {
      append(currentMiddle[j], true)
      j += 1
    }
  }
  append(current.slice(currentEnd).join(''), false)
  return segments
}
