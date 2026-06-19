import { getDb, runNamed } from './connection.js'
import type { ArticleListItem, Label, LabelRule, LabelWithCount } from '../../shared/types.js'

// ---------------------------------------------------------------------------
// Rule-based WHERE clause builder
// ---------------------------------------------------------------------------

type MatchExpr = { clause: string; args: string[] }

function buildFieldMatch(text: string, field: string, alias: string): MatchExpr {
  if (field === 'title') {
    return { clause: `${alias}.title LIKE '%' || ? || '%'`, args: [text] }
  }
  if (field === 'full_text') {
    return { clause: `${alias}.full_text LIKE '%' || ? || '%'`, args: [text] }
  }
  return {
    clause: `(${alias}.title LIKE '%' || ? || '%' OR ${alias}.full_text LIKE '%' || ? || '%')`,
    args: [text, text],
  }
}

export function buildRulesWhere(rules: LabelRule[], alias = 'a'): MatchExpr {
  const orExprs: MatchExpr[] = []
  const andExprs: MatchExpr[] = []
  const notExprs: MatchExpr[] = []

  for (const rule of rules) {
    const expr = buildFieldMatch(rule.match_text, rule.match_field, alias)
    if (rule.rule_type === 'or') orExprs.push(expr)
    else if (rule.rule_type === 'and') andExprs.push(expr)
    else notExprs.push(expr)
  }

  if (orExprs.length === 0 && andExprs.length === 0 && notExprs.length === 0) {
    return { clause: '0=1', args: [] }
  }

  const parts: string[] = []
  const args: string[] = []

  if (orExprs.length > 0) {
    parts.push(`(${orExprs.map(e => e.clause).join(' OR ')})`)
    for (const e of orExprs) args.push(...e.args)
  }
  for (const e of andExprs) { parts.push(e.clause); args.push(...e.args) }
  for (const e of notExprs) { parts.push(`NOT ${e.clause}`); args.push(...e.args) }

  return { clause: parts.join(' AND '), args }
}

// ---------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------

function getLabelRules(labelId: number): LabelRule[] {
  return getDb().prepare(
    'SELECT * FROM label_rules WHERE label_id = ? ORDER BY id ASC',
  ).all(labelId) as LabelRule[]
}

function replaceRules(
  labelId: number,
  rules: Array<{ match_text: string; match_field: 'title' | 'full_text' | 'both'; rule_type: 'and' | 'or' | 'not' }>,
): void {
  const db = getDb()
  db.prepare('DELETE FROM label_rules WHERE label_id = ?').run(labelId)
  const insert = db.prepare(
    'INSERT INTO label_rules (label_id, match_text, match_field, rule_type) VALUES (?, ?, ?, ?)',
  )
  for (const r of rules) {
    insert.run(labelId, r.match_text, r.match_field, r.rule_type)
  }
}

// ---------------------------------------------------------------------------
// Exclusion clause: articles already claimed by higher-priority exclusive labels
// ---------------------------------------------------------------------------

type LabelWithRules = Label & { rules: LabelRule[] }

/**
 * Build a NOT IN clause that excludes articles matched by any exclusive label
 * with higher priority (lower sort_order) than the current label.
 */
function buildExclusionClause(claimers: LabelWithRules[]): MatchExpr | null {
  const active = claimers.filter(l => l.rules.length > 0)
  if (active.length === 0) return null

  const subqueries: string[] = []
  const args: string[] = []
  for (const l of active) {
    const { clause, args: la } = buildRulesWhere(l.rules, 'e')
    subqueries.push(`SELECT e.id FROM active_articles e WHERE (${clause})`)
    args.push(...la)
  }
  return { clause: `a.id NOT IN (${subqueries.join(' UNION ')})`, args }
}

// ---------------------------------------------------------------------------
// Label CRUD
// ---------------------------------------------------------------------------

export function getLabels(opts: { unreadOnly?: boolean } = {}): LabelWithCount[] {
  const rows = getDb().prepare(
    'SELECT * FROM labels ORDER BY sort_order ASC, name COLLATE NOCASE ASC',
  ).all() as Label[]

  const unreadClause = opts.unreadOnly ? ' AND a.seen_at IS NULL' : ''

  // Pre-compute rules for all exclusive labels once (used for exclusion logic)
  const exclusiveWithRules: LabelWithRules[] = rows
    .filter(l => l.exclusive === 1)
    .map(l => ({ ...l, rules: getLabelRules(l.id) }))

  return rows.map(label => {
    const rules = getLabelRules(label.id)
    const { clause, args } = buildRulesWhere(rules)

    const claimers = exclusiveWithRules.filter(l => l.sort_order < label.sort_order)
    const excl = buildExclusionClause(claimers)
    const fullClause = excl ? `(${clause}) AND ${excl.clause}` : clause
    const fullArgs = excl ? [...args, ...excl.args] : args

    const count = (getDb().prepare(
      `SELECT COUNT(*) AS n FROM active_articles a WHERE (${fullClause})${unreadClause}`,
    ).get(...fullArgs) as { n: number }).n
    return { ...label, rules, article_count: count }
  })
}

export function getLabelById(id: number): Label | undefined {
  const row = getDb().prepare('SELECT * FROM labels WHERE id = ?').get(id) as Label | undefined
  if (!row) return undefined
  return { ...row, rules: getLabelRules(id) }
}

export function createLabel(data: {
  name: string
  auto_summarize?: boolean
  exclusive?: boolean
  rules: Array<{ match_text: string; match_field: 'title' | 'full_text' | 'both'; rule_type: 'and' | 'or' | 'not' }>
}): Label {
  const maxOrder = getDb().prepare(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM labels',
  ).get() as { next: number }

  // Legacy columns: store first OR rule text for backward compat; empty otherwise
  const firstOr = data.rules.find(r => r.rule_type === 'or')
  const legacyText = firstOr?.match_text ?? ''
  const legacyField = firstOr?.match_field ?? 'both'

  const info = getDb().prepare(
    'INSERT INTO labels (name, match_text, match_field, sort_order, auto_summarize, exclusive) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(data.name, legacyText, legacyField, maxOrder.next, data.auto_summarize ? 1 : 0, data.exclusive ? 1 : 0)

  const id = Number(info.lastInsertRowid)
  replaceRules(id, data.rules)

  return getLabelById(id)!
}

export function updateLabel(
  id: number,
  data: {
    name?: string
    sort_order?: number
    auto_summarize?: boolean
    exclusive?: boolean
    rules?: Array<{ match_text: string; match_field: 'title' | 'full_text' | 'both'; rule_type: 'and' | 'or' | 'not' }>
  },
): Label | undefined {
  if (!getLabelById(id)) return undefined

  const fields: string[] = []
  const params: Record<string, unknown> = { id }

  if (data.name !== undefined) { fields.push('name = @name'); params.name = data.name }
  if (data.sort_order !== undefined) { fields.push('sort_order = @sort_order'); params.sort_order = data.sort_order }
  if (data.auto_summarize !== undefined) {
    fields.push('auto_summarize = @auto_summarize')
    params.auto_summarize = data.auto_summarize ? 1 : 0
  }
  if (data.exclusive !== undefined) {
    fields.push('exclusive = @exclusive')
    params.exclusive = data.exclusive ? 1 : 0
  }

  if (fields.length > 0) {
    runNamed(`UPDATE labels SET ${fields.join(', ')} WHERE id = @id`, params)
  }

  if (data.rules !== undefined) {
    replaceRules(id, data.rules)
    // Sync legacy columns — clear when no or-rules remain so stale values don't mislead old clients
    const firstOr = data.rules.find(r => r.rule_type === 'or')
    getDb().prepare('UPDATE labels SET match_text = ?, match_field = ? WHERE id = ?')
      .run(firstOr?.match_text ?? null, firstOr?.match_field ?? null, id)
  }

  return getLabelById(id)
}

export function deleteLabel(id: number): boolean {
  const result = getDb().prepare('DELETE FROM labels WHERE id = ?').run(id)
  return result.changes > 0
}

// ---------------------------------------------------------------------------
// Article queries
// ---------------------------------------------------------------------------

export function getArticlesByLabel(
  labelId: number,
  opts: { limit: number; offset: number; unreadOnly?: boolean },
): { items: ArticleListItem[]; total: number; hasMore: boolean } {
  const label = getLabelById(labelId)
  if (!label) return { items: [], total: 0, hasMore: false }

  const { clause, args } = buildRulesWhere(label.rules)
  const unreadClause = opts.unreadOnly ? ' AND a.seen_at IS NULL' : ''

  // Exclude articles already claimed by exclusive labels with higher priority
  const claimers = (getDb().prepare(
    'SELECT * FROM labels WHERE exclusive = 1 AND sort_order < ?',
  ).all(label.sort_order) as Label[]).map(l => ({ ...l, rules: getLabelRules(l.id) }))
  const excl = buildExclusionClause(claimers)
  const fullClause = excl ? `(${clause}) AND ${excl.clause}` : clause
  const fullArgs = excl ? [...args, ...excl.args] : args

  const total = (getDb().prepare(
    `SELECT COUNT(*) AS n FROM active_articles a WHERE (${fullClause})${unreadClause}`,
  ).get(...fullArgs) as { n: number }).n

  const itemsWithExtra = getDb().prepare(`
    SELECT a.id, a.feed_id, f.name AS feed_name, a.title, a.url,
           a.published_at, a.lang, a.summary, a.excerpt, a.og_image,
           a.seen_at, a.read_at, a.bookmarked_at, a.liked_at, a.score
    FROM active_articles a
    JOIN feeds f ON f.id = a.feed_id
    WHERE (${fullClause})${unreadClause}
    ORDER BY a.published_at DESC
    LIMIT ? OFFSET ?
  `).all(...fullArgs, opts.limit + 1, opts.offset) as ArticleListItem[]

  const hasMore = itemsWithExtra.length > opts.limit
  const items = hasMore ? itemsWithExtra.slice(0, opts.limit) : itemsWithExtra
  return { items, total, hasMore }
}

/** Returns true if the article matches any label with auto_summarize=1 and has no summary yet. */
export function getAutoSummarizeCandidates(articleId: number): boolean {
  const alreadySummarized = getDb().prepare(
    'SELECT 1 FROM articles WHERE id = ? AND summary IS NOT NULL AND summary != \'\'',
  ).get(articleId)
  if (alreadySummarized) return false

  const autoLabels = getDb().prepare(
    'SELECT * FROM labels WHERE auto_summarize = 1',
  ).all() as Omit<Label, 'rules'>[]

  for (const row of autoLabels) {
    const rules = getLabelRules(row.id)
    if (rules.length === 0) continue
    const { clause, args } = buildRulesWhere(rules)
    const match = getDb().prepare(
      `SELECT 1 FROM active_articles a WHERE a.id = ? AND (${clause})`,
    ).get(articleId, ...args) as Record<string, unknown> | undefined
    if (match) return true
  }
  return false
}
