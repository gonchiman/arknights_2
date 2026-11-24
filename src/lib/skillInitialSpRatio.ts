/** Percentage of the required SP already available at the selected skill level. */
export function calculateInitialSpRatio(initialSp: number | null, spCost: number | null): number | null {
  if (initialSp === null || !Number.isFinite(initialSp) || initialSp < 0 ||
      spCost === null || !Number.isFinite(spCost) || spCost <= 0) return null
  const percent = initialSp / spCost * 100
  return Number.isFinite(percent) ? percent : null
}
