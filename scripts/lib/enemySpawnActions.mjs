/**
 * Upstream wave fragments sometimes encode an empty action collection as {}.
 * Read only that exact empty representation as zero actions. Missing/null,
 * keyed records and scalar values remain unknown, and source objects are never
 * changed. Keep the enclosing fragment: its delay and position still matter.
 */
export function readEnemySpawnActions(value) {
  if (Array.isArray(value)) return value
  if (value === null || typeof value !== 'object') return null
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return null
  return Reflect.ownKeys(value).length === 0 ? [] : null
}
