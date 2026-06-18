import { getDb, runNamed } from './connection.js'
import type { Label, LabelWithCount } from '../../shared/types.js'

export function getLabels(opts: { unreadOnly?: boolean } = {}): LabelWithCount[] {
  const unreadClause = opts.unreadOnly ? ' AND a.seen_at IS NULL' : ''
  return getDb().prepare(`
    SELECT l.*,
      (SELECT COUNT(*) FROM active_articles a
       WHERE CASE l.match_field
         WHEN 'title'     THEN a.title LIKE '%' || l.match_text || '%'
         WHEN 'full_text' THEN a.full_text LIKE '%' || l.match_text || '%'
         ELSE a.title LIKE '%' || l.match_text || '%'
              OR a.full_text LIKE '%' || l.match_text || '%'
       END${unreadClause}
      ) AS article_count
    FROM labels l
    ORDER BY l.sort_order ASC, l.name COLLATE NOCASE ASC
  `).all() as LabelWithCount[]
}

export function getLabelById(id: number): Label | undefined {
  return getDb().prepare('SELECT * FROM labels WHERE id = ?').get(id) as Label | undefined
}

export function createLabel(data: { name: string; match_text: string; match_field: 'title' | 'full_text' | 'both' }): Label {
  const maxOrder = getDb().prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM labels').get() as { next: number }
  const info = getDb().prepare(
    'INSERT INTO labels (name, match_text, match_field, sort_order) VALUES (?, ?, ?, ?)',
  ).run(data.name, data.match_text, data.match_field, maxOrder.next)
  return getDb().prepare('SELECT * FROM labels WHERE id = ?').get(info.lastInsertRowid) as Label
}

export function updateLabel(
  id: number,
  data: { name?: string; match_text?: string; match_field?: 'title' | 'full_text' | 'both'; sort_order?: number },
): Label | undefined {
  const label = getLabelById(id)
  if (!label) return undefined

  const fields: string[] = []
  const params: Record<string, unknown> = { id }

  if (data.name !== undefined) { fields.push('name = @name'); params.name = data.name }
  if (data.match_text !== undefined) { fields.push('match_text = @match_text'); params.match_text = data.match_text }
  if (data.match_field !== undefined) { fields.push('match_field = @match_field'); params.match_field = data.match_field }
  if (data.sort_order !== undefined) { fields.push('sort_order = @sort_order'); params.sort_order = data.sort_order }

  if (fields.length === 0) return label

  runNamed(`UPDATE labels SET ${fields.join(', ')} WHERE id = @id`, params)
  return getDb().prepare('SELECT * FROM labels WHERE id = ?').get(id) as Label
}

export function deleteLabel(id: number): boolean {
  const result = getDb().prepare('DELETE FROM labels WHERE id = ?').run(id)
  return result.changes > 0
}

export function getArticlesByLabel(
  labelId: number,
  opts: { limit: number; offset: number; unreadOnly?: boolean },
): { items: import('./types.js').ArticleListItem[]; total: number } {
  const label = getLabelById(labelId)
  if (!label) return { items: [], total: 0 }

  const matchExpr = label.match_field === 'title'
    ? `a.title LIKE '%' || ? || '%'`
    : label.match_field === 'full_text'
      ? `a.full_text LIKE '%' || ? || '%'`
      : `(a.title LIKE '%' || ? || '%' OR a.full_text LIKE '%' || ? || '%')`

  const matchArgs = label.match_field === 'both'
    ? [label.match_text, label.match_text]
    : [label.match_text]

  const unreadClause = opts.unreadOnly ? ' AND a.seen_at IS NULL' : ''

  const total = (getDb().prepare(
    `SELECT COUNT(*) AS n FROM active_articles a WHERE ${matchExpr}${unreadClause}`,
  ).get(...matchArgs) as { n: number }).n

  // Fetch limit+1 so the caller can determine has_more without relying on total
  const itemsWithExtra = getDb().prepare(`
    SELECT a.id, a.feed_id, f.name AS feed_name, a.title, a.url,
           a.published_at, a.lang, a.summary, a.excerpt, a.og_image,
           a.seen_at, a.read_at, a.bookmarked_at, a.liked_at, a.score
    FROM active_articles a
    JOIN feeds f ON f.id = a.feed_id
    WHERE ${matchExpr}${unreadClause}
    ORDER BY a.published_at DESC
    LIMIT ? OFFSET ?
  `).all(...matchArgs, opts.limit + 1, opts.offset) as import('./types.js').ArticleListItem[]

  const items = itemsWithExtra.length > opts.limit ? itemsWithExtra.slice(0, opts.limit) : itemsWithExtra

  return { items, total }
}
