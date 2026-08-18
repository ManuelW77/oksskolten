import { getAutoSummarizeCandidates, updateArticleContent } from '../db.js'
import { summarizeArticle } from './ai.js'
import { hasReliableFullText } from './content.js'
import { logger } from '../logger.js'

const log = logger.child('label-summarize')

export async function autoSummarizeIfNeeded(articleId: number, fullText: string | null): Promise<void> {
  if (!hasReliableFullText(fullText)) return

  try {
    const shouldSummarize = getAutoSummarizeCandidates(articleId)
    if (!shouldSummarize) return

    const result = await summarizeArticle(fullText)
    updateArticleContent(articleId, { summary: result.summary })
    log.info(`Auto-summarized article ${articleId} (${result.inputTokens}→${result.outputTokens} tokens)`)
  } catch (err) {
    log.warn(`Auto-summarize failed for article ${articleId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
