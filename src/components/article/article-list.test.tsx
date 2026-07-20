import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'
import { LocaleContext } from '../../lib/i18n'
import { KeyboardNavigationProvider } from '../../contexts/keyboard-navigation-context'
import { saveScrollPosition } from '../../hooks/use-scroll-restoration'
import type { ArticleListItem } from '../../../shared/types'

// --- Mocks ---

// Control useSWRInfinite return value per test
let swrInfiniteReturn: any = {
  data: undefined,
  error: undefined,
  size: 1,
  setSize: vi.fn(),
  isLoading: true,
  isValidating: false,
  mutate: vi.fn(),
}

// Control useSWR return value for /api/feeds
let swrFeedsData: any = undefined

vi.mock('swr/infinite', () => ({
  default: () => swrInfiniteReturn,
}))

vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr')
  return {
    ...actual,
    default: (key: string) => {
      if (key === '/api/feeds') return { data: swrFeedsData }
      return { data: undefined }
    },
    useSWRConfig: () => ({ mutate: vi.fn() }),
  }
})

vi.mock('../feed/feed-metrics-bar', () => ({
  FeedMetricsBar: ({ feed }: any) => <div data-testid="metrics-bar">{feed.name}</div>,
}))

vi.mock('../../lib/fetcher', () => ({
  fetcher: vi.fn(),
  apiPatch: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../lib/markSeenWithQueue', () => ({
  markSeenOnServer: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../lib/readTracker', () => ({
  trackRead: vi.fn(),
  isReadInSession: vi.fn(() => false),
}))

vi.mock('../../hooks/use-is-touch-device', () => ({
  useIsTouchDevice: vi.fn(() => false),
}))

vi.mock('../../hooks/use-clip-feed-id', () => ({
  useClipFeedId: vi.fn(() => null),
}))

vi.mock('../layout/pull-to-refresh', () => ({
  PullToRefresh: () => null,
}))

vi.mock('../../contexts/fetch-progress-context', () => ({
  useFetchProgressContext: () => ({
    progress: new Map(),
    startFeedFetch: vi.fn(() => Promise.resolve({ totalNew: 0 })),
    subscribeFeedFetch: vi.fn(),
  }),
}))


vi.mock('../ui/mascot', () => ({
  Mascot: () => <div data-testid="mascot" />,
}))

vi.mock('./swipeable-article-card', () => ({
  SwipeableArticleCard: ({ article }: { article: ArticleListItem }) => (
    <div data-testid={`swipeable-${article.id}`}>{article.title}</div>
  ),
}))

vi.mock('./article-card', () => ({
  ArticleCard: ({ article }: { article: ArticleListItem }) => (
    <div data-testid={`article-${article.id}`}>{article.title}</div>
  ),
}))

vi.mock('./article-overlay', () => ({
  ArticleOverlay: () => null,
}))

vi.mock('./article-detail', () => ({
  ArticleDetail: ({ articleUrl }: { articleUrl: string }) => (
    <div data-testid="article-detail-preview">{articleUrl}</div>
  ),
}))

vi.mock('../feed/feed-error-banner', () => ({
  FeedErrorBanner: () => null,
}))

vi.mock('../ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={`animate-pulse ${className ?? ''}`} />,
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

import { ArticleList } from './article-list'

function makeArticle(overrides: Partial<ArticleListItem> = {}): ArticleListItem {
  return {
    id: 1,
    feed_id: 1,
    feed_name: 'Test Feed',
    title: 'Test Article',
    url: 'https://example.com/1',
    published_at: '2026-01-01T00:00:00Z',
    lang: 'en',
    summary: null,
    excerpt: 'Excerpt text',
    og_image: null,
    seen_at: null,
    read_at: null,
    bookmarked_at: null,
    liked_at: null,
    ...overrides,
  }
}

const mockSettings = {
  colorMode: 'system' as const,
  setColorMode: vi.fn(),
  themeName: 'default',
  setTheme: vi.fn(),
  themes: [{ name: 'default', label: 'Default' }],
  dateMode: 'relative' as const,
  setDateMode: vi.fn(),
  autoMarkRead: 'off' as const,
  setAutoMarkRead: vi.fn(),
  showUnreadIndicator: 'on' as const,
  setShowUnreadIndicator: vi.fn(),
  indicatorStyle: 'dot' as const,
  internalLinks: 'on' as const,
  setInternalLinks: vi.fn(),
  showThumbnails: 'on' as const,
  setShowThumbnails: vi.fn(),
  showFeedActivity: 'on' as const,
  setShowFeedActivity: vi.fn(),
  highlightTheme: 'github-dark' as const,
  setHighlightTheme: vi.fn(),
  articleFont: 'sans' as const,
  setArticleFont: vi.fn(),
  save: vi.fn(),
}

function OutletWrapper() {
  return (
    <KeyboardNavigationProvider>
      <Outlet context={{ settings: mockSettings, sidebarOpen: false, setSidebarOpen: vi.fn() }} />
    </KeyboardNavigationProvider>
  )
}

function renderArticleList(initialPath = '/inbox') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
        <Routes>
          <Route element={<OutletWrapper />}>
            <Route path="feeds/:feedId" element={<ArticleList />} />
            <Route path="*" element={<ArticleList />} />
          </Route>
        </Routes>
      </LocaleContext.Provider>
    </MemoryRouter>,
  )
}

describe('ArticleList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrFeedsData = undefined
    mockSettings.autoMarkRead = 'off' as any
    // Stub IntersectionObserver for tests that enable autoMarkRead
    vi.stubGlobal('IntersectionObserver', class {
      constructor() {}
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    })
    // Reset to loading state
    swrInfiniteReturn = {
      data: undefined,
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: true,
      isValidating: false,
      mutate: vi.fn(),
    }
  })

  it('shows skeleton when loading', () => {
    renderArticleList()
    // Skeleton renders divs with animate-pulse class
    const pulses = document.querySelectorAll('.animate-pulse')
    expect(pulses.length).toBeGreaterThan(0)
  })

  it('shows empty state when no articles', () => {
    swrInfiniteReturn = {
      data: [{ articles: [], total: 0, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByText('No articles')).toBeTruthy()
  })

  it('shows error state with retry button', () => {
    swrInfiniteReturn = {
      data: undefined,
      error: new Error('fetch failed'),
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByText('Failed to load')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('renders article cards', () => {
    swrInfiniteReturn = {
      data: [{
        articles: [
          makeArticle({ id: 1, title: 'First Article' }),
          makeArticle({ id: 2, title: 'Second Article' }),
        ],
        total: 2,
        has_more: false,
      }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByText('First Article')).toBeTruthy()
    expect(screen.getByText('Second Article')).toBeTruthy()
  })

  it('shows mascot at end of feed', () => {
    mockSettings.autoMarkRead = 'on' as any
    swrInfiniteReturn = {
      data: [{ articles: [makeArticle({ id: 1 })], total: 1, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByTestId('mascot')).toBeTruthy()
    expect(screen.getByText("You're all caught up!")).toBeTruthy()
  })

  it('does not show mascot when article list is empty', () => {
    swrInfiniteReturn = {
      data: [{ articles: [], total: 0, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.queryByTestId('mascot')).toBeNull()
  })

  it('uses ArticleCard on non-touch devices', () => {
    swrInfiniteReturn = {
      data: [{ articles: [makeArticle({ id: 10, title: 'Desktop Article' })], total: 1, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByTestId('article-10')).toBeTruthy()
  })

  it('uses SwipeableArticleCard on touch devices', async () => {
    const { useIsTouchDevice } = await import('../../hooks/use-is-touch-device')
    vi.mocked(useIsTouchDevice).mockReturnValue(true)

    swrInfiniteReturn = {
      data: [{ articles: [makeArticle({ id: 20, title: 'Mobile Article' })], total: 1, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByTestId('swipeable-20')).toBeTruthy()
  })

  it('does not show mascot when still loading', () => {
    renderArticleList()
    expect(screen.queryByTestId('mascot')).toBeNull()
  })

  it('renders multiple pages of articles', () => {
    swrInfiniteReturn = {
      data: [
        { articles: [makeArticle({ id: 1, title: 'Page 1' })], total: 2, has_more: true },
        { articles: [makeArticle({ id: 2, title: 'Page 2' })], total: 2, has_more: false },
      ],
      error: undefined,
      size: 2,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByText('Page 1')).toBeTruthy()
    expect(screen.getByText('Page 2')).toBeTruthy()
  })

  it('renders FeedMetricsBar for current feed', () => {
    swrFeedsData = {
      feeds: [
        { id: 1, name: 'My Feed', type: 'rss', unread_count: 5, total_count: 10 },
      ],
    }
    swrInfiniteReturn = {
      data: [{ articles: [makeArticle({ id: 1, feed_id: 1 })], total: 1, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList('/feeds/1')
    expect(screen.getByTestId('metrics-bar')).toBeTruthy()
    expect(screen.getByText('My Feed')).toBeTruthy()
  })

  it('does not render FeedMetricsBar for clip feed', () => {
    swrFeedsData = {
      feeds: [
        { id: 1, name: 'Clip Feed', type: 'clip', unread_count: 0, total_count: 3 },
      ],
    }
    swrInfiniteReturn = {
      data: [{ articles: [makeArticle({ id: 1, feed_id: 1 })], total: 1, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList('/feeds/1')
    expect(screen.queryByTestId('metrics-bar')).toBeNull()
  })

  it('retry button resets pagination', () => {
    const mockSetSize = vi.fn()
    swrInfiniteReturn = {
      data: undefined,
      error: new Error('fetch failed'),
      size: 3,
      setSize: mockSetSize,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    screen.getByText('Retry').click()
    expect(mockSetSize).toHaveBeenCalledWith(1)
  })

  it('skeleton respects showThumbnails=off', () => {
    mockSettings.showThumbnails = 'off' as any
    swrInfiniteReturn = {
      data: undefined,
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: true,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    // When showThumbnails is off, the 16x16 thumbnail placeholder should not be rendered
    const skeletonThumbnails = document.querySelectorAll('.w-16.h-16')
    expect(skeletonThumbnails.length).toBe(0)
    // Restore default
    mockSettings.showThumbnails = 'on' as any
  })

  it('data-article-unread attribute is set correctly', () => {
    swrInfiniteReturn = {
      data: [{
        articles: [
          makeArticle({ id: 1, title: 'Unread', seen_at: null }),
          makeArticle({ id: 2, title: 'Read', seen_at: '2026-01-01' }),
        ],
        total: 2,
        has_more: false,
      }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    // /history, not /inbox: unread-focused views drop articles that were
    // already read when the view was entered, so a read article would not
    // render there at all.
    renderArticleList('/history')
    const unreadEl = document.querySelector('[data-article-id="1"]')
    const readEl = document.querySelector('[data-article-id="2"]')
    expect(unreadEl?.getAttribute('data-article-unread')).toBe('1')
    expect(readEl?.getAttribute('data-article-unread')).toBe('0')
  })

  describe('auto-mark-read: reaching the bottom of the page', () => {
    function setScrollGeometry({ scrollHeight, innerHeight, scrollY }: { scrollHeight: number; innerHeight: number; scrollY: number }) {
      Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true, writable: true })
      Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true, writable: true })
    }

    /**
     * A genuine user-initiated scroll. The wheel gesture is what unlocks the
     * bottom safety net (a programmatic window.scrollTo emits `scroll` but no
     * wheel/touchmove), the scroll event is what the safety net listens on.
     */
    function userScroll() {
      fireEvent.wheel(window)
      fireEvent.scroll(window)
    }

    function loadedList() {
      swrInfiniteReturn = {
        data: [{
          articles: [
            makeArticle({ id: 1, title: 'First', seen_at: '2026-01-01' }),
            makeArticle({ id: 2, title: 'Last', seen_at: null }),
          ],
          total: 2,
          has_more: false,
        }],
        error: undefined,
        size: 1,
        setSize: vi.fn(),
        isLoading: false,
        isValidating: false,
        mutate: vi.fn(),
      }
    }

    it('marks the last article as read once the page is scrolled to the bottom', () => {
      mockSettings.autoMarkRead = 'on' as any
      loadedList()
      setScrollGeometry({ scrollHeight: 2000, innerHeight: 800, scrollY: 0 })

      renderArticleList()
      // Not at the bottom yet — the last article stays unread.
      expect(document.querySelector('[data-article-id="2"]')?.getAttribute('data-article-unread')).toBe('1')

      setScrollGeometry({ scrollHeight: 2000, innerHeight: 800, scrollY: 1200 })
      userScroll()

      expect(document.querySelector('[data-article-id="2"]')?.getAttribute('data-article-unread')).toBe('0')
    })

    it('tolerates a fractional gap at maximum scroll', () => {
      mockSettings.autoMarkRead = 'on' as any
      loadedList()
      setScrollGeometry({ scrollHeight: 2000, innerHeight: 800, scrollY: 0 })

      renderArticleList()

      // Browser leaves the page a sub-pixel short of the true bottom — the very
      // case that kept the last article stuck as unread.
      setScrollGeometry({ scrollHeight: 2000, innerHeight: 800, scrollY: 1197.5 })
      userScroll()

      expect(document.querySelector('[data-article-id="2"]')?.getAttribute('data-article-unread')).toBe('0')
    })

    it('does not mark articles read when the page cannot be scrolled', () => {
      mockSettings.autoMarkRead = 'on' as any
      loadedList()
      // Content fits entirely in the viewport: the user never scrolled past anything.
      setScrollGeometry({ scrollHeight: 800, innerHeight: 800, scrollY: 0 })

      renderArticleList()
      userScroll()

      expect(document.querySelector('[data-article-id="2"]')?.getAttribute('data-article-unread')).toBe('1')
    })

    it('does not mark articles read while more pages are still loading', () => {
      mockSettings.autoMarkRead = 'on' as any
      loadedList()
      swrInfiniteReturn.data[0].has_more = true
      setScrollGeometry({ scrollHeight: 2000, innerHeight: 800, scrollY: 1200 })

      renderArticleList()
      userScroll()

      expect(document.querySelector('[data-article-id="2"]')?.getAttribute('data-article-unread')).toBe('1')
    })

    it('does nothing when auto-mark-read is off', () => {
      mockSettings.autoMarkRead = 'off' as any
      loadedList()
      setScrollGeometry({ scrollHeight: 2000, innerHeight: 800, scrollY: 1200 })

      renderArticleList()
      userScroll()

      expect(document.querySelector('[data-article-id="2"]')?.getAttribute('data-article-unread')).toBe('1')
    })

    // Regression: returning to a category that was read empty and has since
    // received new articles. Scroll restoration puts the window at the bottom
    // position saved for the old list; without a user gesture the safety net
    // must not treat that as "scrolled past everything".
    it('does not mark articles read when scroll position was restored programmatically', () => {
      mockSettings.autoMarkRead = 'on' as any
      loadedList()
      setScrollGeometry({ scrollHeight: 2000, innerHeight: 800, scrollY: 1200 })

      renderArticleList()
      // A programmatic window.scrollTo emits `scroll` but no wheel/touchmove.
      fireEvent.scroll(window)

      expect(document.querySelector('[data-article-id="2"]')?.getAttribute('data-article-unread')).toBe('1')
    })

    // Regression: resuming a category after a break. A revalidation or the
    // stale-read filter shortens the document, the browser clamps scrollY to
    // the new maximum, and the user's next wheel tick arrives with the page
    // already at the bottom. That is the page moving, not the user scrolling
    // past everything.
    it('does not mark articles read when the document shrank under the user', () => {
      mockSettings.autoMarkRead = 'on' as any
      loadedList()
      setScrollGeometry({ scrollHeight: 4000, innerHeight: 800, scrollY: 1200 })

      renderArticleList()

      // List shrinks; scrollY is clamped to the new bottom.
      setScrollGeometry({ scrollHeight: 2000, innerHeight: 800, scrollY: 1200 })
      userScroll()

      expect(document.querySelector('[data-article-id="2"]')?.getAttribute('data-article-unread')).toBe('1')

      // Once the height is stable again, a real gesture still works.
      userScroll()
      expect(document.querySelector('[data-article-id="2"]')?.getAttribute('data-article-unread')).toBe('0')
    })

    // Regression: a gesture early in the visit must not license a mark-read
    // that happens much later without any user involvement.
    it('does not mark articles read long after the last user gesture', () => {
      mockSettings.autoMarkRead = 'on' as any
      loadedList()
      setScrollGeometry({ scrollHeight: 2000, innerHeight: 800, scrollY: 0 })

      renderArticleList()
      fireEvent.wheel(window)

      vi.useFakeTimers()
      try {
        vi.setSystemTime(Date.now() + 60_000)
        setScrollGeometry({ scrollHeight: 2000, innerHeight: 800, scrollY: 1200 })
        fireEvent.scroll(window)
      } finally {
        vi.useRealTimers()
      }

      expect(document.querySelector('[data-article-id="2"]')?.getAttribute('data-article-unread')).toBe('1')
    })
  })

  describe('stale read articles on view entry', () => {
    it('hides articles that were already read when an unread-only view is entered', () => {
      swrInfiniteReturn = {
        data: [{
          articles: [
            makeArticle({ id: 1, title: 'Read Earlier', seen_at: '2026-01-01' }),
            makeArticle({ id: 2, title: 'New Article', seen_at: null }),
          ],
          total: 2,
          has_more: false,
        }],
        error: undefined,
        size: 1,
        setSize: vi.fn(),
        isLoading: false,
        isValidating: false,
        mutate: vi.fn(),
      }

      renderArticleList('/inbox')

      expect(screen.queryByText('Read Earlier')).toBeNull()
      expect(screen.getByText('New Article')).toBeTruthy()
    })

    it('keeps showing read articles in views that are not unread-only', () => {
      swrInfiniteReturn = {
        data: [{
          articles: [
            makeArticle({ id: 1, title: 'Read Earlier', seen_at: '2026-01-01' }),
            makeArticle({ id: 2, title: 'New Article', seen_at: null }),
          ],
          total: 2,
          has_more: false,
        }],
        error: undefined,
        size: 1,
        setSize: vi.fn(),
        isLoading: false,
        isValidating: false,
        mutate: vi.fn(),
      }

      renderArticleList('/history')

      expect(screen.getByText('Read Earlier')).toBeTruthy()
      expect(screen.getByText('New Article')).toBeTruthy()
    })

    // Regression: resuming mid-list. The saved scroll offset belongs to the
    // cached list including its read articles — filtering them out here would
    // shorten the document and throw the user to the end of the list.
    it('keeps read articles when returning to a saved scroll position', () => {
      swrInfiniteReturn = {
        data: [{
          articles: [
            makeArticle({ id: 1, title: 'Read Earlier', seen_at: '2026-01-01' }),
            makeArticle({ id: 2, title: 'New Article', seen_at: null }),
          ],
          total: 2,
          has_more: false,
        }],
        error: undefined,
        size: 1,
        setSize: vi.fn(),
        isLoading: false,
        isValidating: false,
        mutate: vi.fn(),
      }

      Object.defineProperty(window, 'scrollY', { value: 1200, configurable: true, writable: true })
      saveScrollPosition('/inbox')
      try {
        renderArticleList('/inbox')

        expect(screen.getByText('Read Earlier')).toBeTruthy()
        expect(screen.getByText('New Article')).toBeTruthy()
      } finally {
        Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true })
        saveScrollPosition('/inbox')
      }
    })
  })

  it('validating state shows skeleton in sentinel', () => {
    // Stub IntersectionObserver for this test since sentinel ref callback uses it
    const observeMock = vi.fn()
    const disconnectMock = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor() {}
      observe = observeMock
      unobserve = vi.fn()
      disconnect = disconnectMock
    })

    swrInfiniteReturn = {
      data: [{ articles: [makeArticle({ id: 1 })], total: 2, has_more: true }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: true,
      mutate: vi.fn(),
    }
    renderArticleList()
    // Sentinel area should contain skeleton loading indicators (animate-pulse)
    const pulses = document.querySelectorAll('.animate-pulse')
    expect(pulses.length).toBeGreaterThan(0)

    vi.unstubAllGlobals()
  })
})
