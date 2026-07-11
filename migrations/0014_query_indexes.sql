-- Indexes for the three hottest read paths: unread list, score-sorted list,
-- and the per-feed sidebar aggregates in getFeeds().
--
-- Shape matters here: libsql (SQLite without STAT4) underestimates the row
-- count of `seen_at IS NULL`, so these indexes are designed to win on
-- ORDER BY satisfaction and covering-ness rather than on selectivity.
-- purged_at is included as a trailing *column* (not only as a partial-index
-- WHERE) because the planner's covering check must see it to serve
-- active_articles queries without touching the base table — base-table row
-- reads are expensive since they traverse full_text overflow pages.

-- Unread list: same (seen_at) search key the planner already prefers, but
-- yields published_at order directly (no temp B-tree over all unread rows).
CREATE INDEX IF NOT EXISTS idx_articles_seen_published
  ON articles(seen_at, published_at DESC, purged_at);

-- Score-sorted list: serves ORDER BY score DESC, published_at DESC with an
-- ordered scan instead of materializing and sorting all active rows.
CREATE INDEX IF NOT EXISTS idx_articles_active_score_published
  ON articles(score DESC, published_at DESC) WHERE purged_at IS NULL;

-- Sidebar aggregates: covering index for per-feed unread counts,
-- articles-per-week, and latest timestamp.
CREATE INDEX IF NOT EXISTS idx_articles_feed_counts
  ON articles(feed_id, seen_at, published_at, fetched_at, purged_at);

-- Populate sqlite_stat1 so the planner picks these over the older, narrower
-- indexes; kept fresh afterwards by the periodic PRAGMA optimize.
ANALYZE;
