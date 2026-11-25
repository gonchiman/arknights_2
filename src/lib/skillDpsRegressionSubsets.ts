export function getSkillDpsPredictorColumnSets(candidateCount: number): number[][] {
  const columnSets: number[][] = []
  const candidateColumns = Array.from({ length: candidateCount }, (_, index) => index)
  // There are at most eight supported candidates. Preserve column order in every fit.
  for (let mask = 1; mask < 2 ** candidateCount; mask++) {
    const columns = candidateColumns.filter(index => mask & (1 << index))
    if (columns.length >= 2) columnSets.push(columns)
  }
  return columnSets
}
