import { AlertTriangle } from 'lucide-react'
import { useI18n } from '../../lib/i18n'

export function ArticleIncompleteContentBanner() {
  const { t } = useI18n()

  return (
    <div className="flex items-center gap-2 text-sm text-muted mb-6 select-none">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>{t('article.incompleteContent')}</span>
    </div>
  )
}
