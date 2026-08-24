-- Flag full_text rows populated from the RSS excerpt fallback (in
-- fetchArticleContent / refreshStaleArticles) rather than genuine page
-- extraction. A short RSS teaser can coincidentally pass MIN_EXTRACTED_LENGTH,
-- which previously let hasReliableFullText and the "incomplete content"
-- banner treat a truncated teaser as a full, reliable article.
ALTER TABLE articles ADD COLUMN full_text_is_excerpt INTEGER NOT NULL DEFAULT 0;
