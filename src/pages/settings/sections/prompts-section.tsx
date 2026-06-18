import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher, apiPatch } from '../../../lib/fetcher'
import { useI18n } from '../../../lib/i18n'

interface PromptsPrefs {
  'prompt.summarize': string | null
  'prompt.translate': string | null
}

function PromptEditor({
  label,
  prefKey,
  placeholder,
  value,
  onChange,
}: {
  label: string
  prefKey: 'prompt.summarize' | 'prompt.translate'
  placeholder: string
  value: string
  onChange: (key: 'prompt.summarize' | 'prompt.translate', val: string) => void
}) {
  const { t } = useI18n()
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [local, setLocal] = useState(value)

  useEffect(() => { setLocal(value) }, [value])

  function handleChange(val: string) {
    setLocal(val)
    setDirty(true)
    setSaved(false)
  }

  async function handleSave() {
    await apiPatch('/api/settings/preferences', { [prefKey]: local })
    onChange(prefKey, local)
    setDirty(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleReset() {
    await apiPatch('/api/settings/preferences', { [prefKey]: '' })
    onChange(prefKey, '')
    setLocal('')
    setDirty(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text">{label}</label>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-accent">{t('settings.promptSaved')}</span>}
          {local && (
            <button
              type="button"
              onClick={() => void handleReset()}
              className="text-xs text-muted hover:text-text transition-colors"
            >
              {t('settings.promptReset')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty}
            className="px-3 py-1 text-xs rounded-md bg-accent text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {t('settings.save')}
          </button>
        </div>
      </div>
      <textarea
        value={local}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        rows={10}
        className="w-full text-xs font-mono rounded-md border border-border bg-bg-subtle text-text placeholder:text-muted/50 px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  )
}

export function PromptsSection() {
  const { t } = useI18n()
  const { data, mutate } = useSWR<PromptsPrefs>('/api/settings/preferences', fetcher, {
    revalidateOnFocus: false,
  })

  const [prefs, setPrefs] = useState<PromptsPrefs>({ 'prompt.summarize': null, 'prompt.translate': null })

  useEffect(() => {
    if (data) {
      setPrefs({
        'prompt.summarize': data['prompt.summarize'] ?? null,
        'prompt.translate': data['prompt.translate'] ?? null,
      })
    }
  }, [data])

  const handleChange = useCallback((key: 'prompt.summarize' | 'prompt.translate', val: string) => {
    setPrefs(prev => ({ ...prev, [key]: val || null }))
    void mutate(prev => prev ? { ...prev, [key]: val || null } : prev, false)
  }, [mutate])

  const summarizePlaceholder = `Summarize the following article in German. Follow the format strictly.

## Format
Line 1: A concise 1-2 sentence summary...
Line 2: Empty line
Line 3+: Key points as bullet points: "**Title** — explanation"

## Rules
- Output in Markdown (bullet points start with "- ")
- Do not include any text other than the summary

--- Article body ---
{{article}}`

  const translatePlaceholder = `Translate the following article into German.
Translate every word faithfully — do not summarize or omit anything.
Preserve Markdown formatting.

--- Article body ---
{{article}}`

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-text mb-1">{t('settings.aiPrompts')}</h2>
        <p className="text-xs text-muted">{t('settings.aiPromptsDesc')}</p>
      </div>

      <PromptEditor
        label={t('settings.summarizePrompt')}
        prefKey="prompt.summarize"
        placeholder={summarizePlaceholder}
        value={prefs['prompt.summarize'] ?? ''}
        onChange={handleChange}
      />

      <PromptEditor
        label={t('settings.translatePrompt')}
        prefKey="prompt.translate"
        placeholder={translatePlaceholder}
        value={prefs['prompt.translate'] ?? ''}
        onChange={handleChange}
      />
    </section>
  )
}
