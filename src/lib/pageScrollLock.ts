type ScrollRoot = { style: { overflow: string } }
const locks = new WeakMap<ScrollRoot, { count: number; previousOverflow: string }>()

/** Keep scrolling locked until every modal has closed, in any unmount order. */
export function lockPageScroll(root: ScrollRoot): () => void {
  const lock = locks.get(root) ?? { count: 0, previousOverflow: root.style.overflow }
  lock.count += 1
  locks.set(root, lock)
  root.style.overflow = 'hidden'
  let released = false
  return () => {
    if (released) return
    released = true
    lock.count -= 1
    if (lock.count === 0) {
      root.style.overflow = lock.previousOverflow
      locks.delete(root)
    }
  }
}
