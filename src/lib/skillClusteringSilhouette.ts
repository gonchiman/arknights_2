/** Exact mean silhouette from a zero-diagonal, row-major distance matrix. */
export function calculateSkillClusteringSilhouette(distances: Float64Array, assignments: readonly number[]): number | null {
  const n = assignments.length
  if (distances.length !== n * n) throw new RangeError('距離行列と所属の件数が一致しません。')
  const labels = new Map<number, number>()
  const counts: number[] = []
  const groups = assignments.map((label) => {
    if (!Number.isInteger(label) || label < 0) throw new RangeError('所属の番号が不正です。')
    let group = labels.get(label)
    if (group === undefined) {
      group = labels.size
      labels.set(label, group)
      counts.push(0)
    }
    counts[group] += 1
    return group
  })
  if (counts.length < 2 || counts.length >= n) return null
  const sums = new Float64Array(counts.length)
  let total = 0
  for (let row = 0; row < n; row += 1) {
    const own = groups[row]
    // A singleton contributes zero, but remains in the overall average.
    if (counts[own] === 1) continue
    sums.fill(0)
    for (let other = 0; other < n; other += 1) sums[groups[other]] += distances[row * n + other]
    const within = sums[own] / (counts[own] - 1)
    let nearest = Infinity
    for (let group = 0; group < counts.length; group += 1) {
      if (group !== own) nearest = Math.min(nearest, sums[group] / counts[group])
    }
    const scale = Math.max(within, nearest)
    if (scale > 0) total += (nearest - within) / scale
  }
  return total / n
}
