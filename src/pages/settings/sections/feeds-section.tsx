import { useState, useCallback, useRef, useEffect } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Pencil, Trash2, Check, X, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, PowerOff, Power, Loader2 } from 'lucide-react'
import { useI18n } from '../../../lib/i18n'
import { fetcher, apiPatch, apiDelete, authHeaders } from '../../../lib/fetcher'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FeedErrorBanner } from '@/components/feed/feed-error-banner'
import type { FeedWithCounts, Category } from '../../../../shared/types'

interface FeedsData {
  feeds: FeedWithCounts[]
}

interface CategoriesData {
  categories: Category[]
}

export function FeedsSection() {
  const { t } = useI18n()
  const { mutate: globalMutate } = useSWRConfig()

  const { data: feedsData, mutate: mutateFeeds } = useSWR<FeedsData>('/api/feeds', fetcher)
  const { data: catData } = useSWR<CategoriesData>('/api/categories', fetcher)

  const feeds = feedsData?.feeds ?? []
  const categories = catData?.categories ?? []

  const errorFeeds = feeds.filter(f => f.last_error && !f.disabled)

  const revalidate = useCallback(() => {
    void mutateFeeds()
    void globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/feeds'))
  }, [mutateFeeds, globalMutate])

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-base font-semibold text-text mb-1">{t('settings.viewer')}</h2>
        <p className="text-xs text-muted">{t('settings.feedsDesc')}</p>
      </div>

      {errorFeeds.length > 0 && (
        <FeedIssuesPanel feeds={errorFeeds} onRevalidate={revalidate} />
      )}

      <div>
        <h3 className="text-sm font-medium text-text mb-3">{t('settings.feedAllFeeds')}</h3>
        {feeds.length === 0 ? (
          <p className="text-sm text-muted">{t('settings.feedsEmpty')}</p>
        ) : (
          <FeedList feeds={feeds} categories={categories} onRevalidate={revalidate} />
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Feed Issues Panel
// ---------------------------------------------------------------------------

function FeedIssuesPanel({ feeds, onRevalidate }: { feeds: FeedWithCounts[]; onRevalidate: () => void }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState<number | null>(null)

  const startFeedFetch = useCallback(async (feedId: number) => {
    const headers = { ...authHeaders(), 'Content-Type': 'application/json' }
    const res = await fetch(`/api/feeds/${feedId}/fetch`, { method: 'POST', headers, signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // drain SSE
    if (res.body) {
      const reader = res.body.getReader()
      for (;;) { const { done } = await reader.read(); if (done) break }
    }
  }, [])

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={14} className="text-error shrink-0" />
        <h3 className="text-sm font-medium text-error">{t('settings.feedIssues')}</h3>
        <span className="text-xs text-muted">({feeds.length})</span>
      </div>
      <div className="space-y-2">
        {feeds.map(feed => (
          <div key={feed.id} className="rounded-lg border border-error/30 bg-error/5 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded(prev => prev === feed.id ? null : feed.id)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-error/10 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-text truncate block">{feed.name}</span>
                <span className="text-xs text-error/80 truncate block mt-0.5">{feed.last_error}</span>
              </div>
              {expanded === feed.id
                ? <ChevronUp size={14} className="text-muted shrink-0 ml-2" />
                : <ChevronDown size={14} className="text-muted shrink-0 ml-2" />
              }
            </button>

            {expanded === feed.id && (
              <div className="border-t border-error/20">
                <FeedErrorBanner
                  lastError={feed.last_error!}
                  feedId={feed.id}
                  onMutate={async () => { onRevalidate() }}
                  onFetch={async () => {
                    await startFeedFetch(feed.id)
                    onRevalidate()
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Full feed list
// ---------------------------------------------------------------------------

function FeedList({
  feeds,
  categories,
  onRevalidate,
}: {
  feeds: FeedWithCounts[]
  categories: Category[]
  onRevalidate: () => void
}) {
  const categoryMap = new Map(categories.map(c => [c.id, c.name]))

  return (
    <div className="space-y-1.5">
      {feeds.map(feed => (
        <FeedRow
          key={feed.id}
          feed={feed}
          categoryName={feed.category_id ? (categoryMap.get(feed.category_id) ?? null) : null}
          onRevalidate={onRevalidate}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single feed row
// ---------------------------------------------------------------------------

function FeedRow({
  feed,
  categoryName,
  onRevalidate,
}: {
  feed: FeedWithCounts
  categoryName: string | null
  onRevalidate: () => void
}) {
  const { t } = useI18n()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(feed.name)
  const [fetching, setFetching] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingName) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingName])

  async function handleSaveName() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === feed.name) { setEditingName(false); return }
    try {
      await apiPatch(`/api/feeds/${feed.id}`, { name: trimmed })
      onRevalidate()
    } catch {
      setNameValue(feed.name)
    }
    setEditingName(false)
  }

  async function handleToggleDisabled() {
    await apiPatch(`/api/feeds/${feed.id}`, { disabled: feed.disabled ? 0 : 1 })
    onRevalidate()
  }

  async function handleDelete() {
    await apiDelete(`/api/feeds/${feed.id}`)
    onRevalidate()
    setDeleteConfirm(false)
  }

  async function handleFetch() {
    if (fetching) return
    setFetching(true)
    try {
      const headers = { ...authHeaders(), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/feeds/${feed.id}/fetch`, { method: 'POST', headers, signal: AbortSignal.timeout(120_000) })
      if (res.body) {
        const reader = res.body.getReader()
        for (;;) { const { done } = await reader.read(); if (done) break }
      }
      onRevalidate()
    } catch {
      // fetch failed — revalidate anyway so error shows
      onRevalidate()
    } finally {
      setFetching(false)
    }
  }

  const hasError = !!feed.last_error && !feed.disabled

  return (
    <>
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
        hasError ? 'border-error/30 bg-error/5' : 'border-border bg-bg-card'
      } ${feed.disabled ? 'opacity-50' : ''}`}>

        {/* Name (editable) */}
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void handleSaveName()
                  if (e.key === 'Escape') { setNameValue(feed.name); setEditingName(false) }
                }}
                className="flex-1 px-1.5 py-0.5 text-sm rounded border border-accent bg-bg text-text focus:outline-none"
              />
              <button type="button" onClick={() => void handleSaveName()} className="p-1 text-accent hover:opacity-80"><Check size={13} /></button>
              <button type="button" onClick={() => { setNameValue(feed.name); setEditingName(false) }} className="p-1 text-muted hover:text-text"><X size={13} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-medium text-text truncate">{feed.name}</span>
              {feed.disabled ? (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted/20 text-muted">{t('settings.feedDisabled')}</span>
              ) : hasError ? (
                <AlertTriangle size={12} className="text-error shrink-0" />
              ) : null}
            </div>
          )}

          {!editingName && (
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
              {categoryName && <span>{categoryName}</span>}
              {categoryName && <span>·</span>}
              <span>{feed.article_count} {t('settings.feedArticles')}</span>
              {feed.unread_count > 0 && (
                <>
                  <span>·</span>
                  <span className="text-accent">{feed.unread_count} {t('settings.feedUnread')}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {!editingName && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleFetch()}
              disabled={fetching || !!feed.disabled}
              title={t('feeds.fetch')}
              className="p-1 text-muted hover:text-text transition-colors disabled:opacity-40"
            >
              {fetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
            <button
              type="button"
              onClick={() => { setNameValue(feed.name); setEditingName(true) }}
              title={t('feeds.rename')}
              className="p-1 text-muted hover:text-text transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => void handleToggleDisabled()}
              title={feed.disabled ? t('settings.feedEnable') : t('settings.feedDisable')}
              className="p-1 text-muted hover:text-text transition-colors"
            >
              {feed.disabled ? <Power size={14} /> : <PowerOff size={14} />}
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              title={t('feeds.delete')}
              className="p-1 text-muted hover:text-error transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmDialog
          title={t('feeds.deleteFeed')}
          message={t('feeds.deleteConfirm', { name: feed.name })}
          danger
          confirmLabel={t('feeds.delete')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}
    </>
  )
}
