const scrollPositions = new Map<string, number>()

export function saveScrollPosition(pathname: string) {
  scrollPositions.set(pathname, window.scrollY)
}

/** Scroll offset saved for a path, or 0 when the path will open at the top. */
export function getSavedScrollPosition(pathname: string) {
  return scrollPositions.get(pathname) ?? 0
}

/** Synchronously restore scroll – call from useLayoutEffect so it runs before paint. */
export function restoreScrollPosition(pathname: string) {
  const y = scrollPositions.get(pathname)
  if (y != null && y > 0) {
    window.scrollTo(0, y)
  }
}
