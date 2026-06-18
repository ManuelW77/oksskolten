import { useState, useCallback } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Pencil, Plus, Trash2, X, Check } from 'lucide-react'
import { useI18n } from '../../../lib/i18n'
import { fetcher, apiPost, apiPatch, apiDelete } from '../../../lib/fetcher'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup } from '@/components/ui/radio-group'
import { useAppLayout } from '../../../app'
import type { LabelWithCount } from '../../../../shared/types'

type MatchField = 'title' | 'full_text' | 'both'

interface LabelForm {
  name: string
  match_text: string
  match_field: MatchField
}

const EMPTY_FORM: LabelForm = { name: '', match_text: '', match_field: 'both' }

function matchFieldLabel(field: MatchField, t: ReturnType<typeof useI18n>['t']): string {
  if (field === 'title') return t('settings.labelMatchFieldTitle')
  if (field === 'full_text') return t('settings.labelMatchFieldFullText')
  return t('settings.labelMatchFieldBoth')
}

export function LabelsSection() {
  const { t } = useI18n()
  const { settings } = useAppLayout()
  const { mutate: globalMutate } = useSWRConfig()
  const { data, mutate } = useSWR<{ labels: LabelWithCount[] }>('/api/labels', fetcher)
  const labels = data?.labels ?? []

  const [form, setForm] = useState<LabelForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const revalidate = useCallback(() => {
    void mutate()
    void globalMutate('/api/labels')
  }, [mutate, globalMutate])

  const handleStartEdit = useCallback((label: LabelWithCount) => {
    setEditingId(label.id)
    setForm({ name: label.name, match_text: label.match_text, match_field: label.match_field })
    setShowAdd(false)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !form.name.trim() || !form.match_text.trim()) return
    await apiPatch(`/api/labels/${editingId}`, form)
    setEditingId(null)
    setForm(EMPTY_FORM)
    revalidate()
  }, [editingId, form, revalidate])

  const handleCreate = useCallback(async () => {
    if (!form.name.trim() || !form.match_text.trim()) return
    await apiPost('/api/labels', form)
    setForm(EMPTY_FORM)
    setShowAdd(false)
    revalidate()
  }, [form, revalidate])

  const handleDelete = useCallback(async () => {
    if (deleteId === null) return
    await apiDelete(`/api/labels/${deleteId}`)
    setDeleteId(null)
    revalidate()
  }, [deleteId, revalidate])

  const deletingLabel = deleteId !== null ? labels.find(l => l.id === deleteId) : null

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-1">{t('settings.labels')}</h2>
      <p className="text-xs text-muted mb-4">{t('settings.labelsDesc')}</p>

      <div className="mb-5">
        <p className="text-sm text-text mb-2">{t('settings.labelUnreadOnly')}</p>
        <RadioGroup
          name="labelUnreadOnly"
          options={[
            { value: 'on' as const, label: 'ON' },
            { value: 'off' as const, label: 'OFF' },
          ]}
          value={settings.labelUnreadOnly}
          onChange={(val) => settings.setLabelUnreadOnly(val as 'on' | 'off')}
        />
      </div>

      <div className="space-y-2">
        {labels.length === 0 && !showAdd && (
          <p className="text-sm text-muted">{t('settings.labelsEmpty')}</p>
        )}

        {labels.map((label) =>
          editingId === label.id ? (
            <LabelFormRow
              key={label.id}
              form={form}
              onChange={setForm}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          ) : (
            <div
              key={label.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-bg-card"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium text-text">{label.name}</span>
                <span className="ml-2 text-xs text-muted">
                  {label.match_text}
                  {' · '}
                  {matchFieldLabel(label.match_field, t)}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted tabular-nums">{label.article_count}</span>
                <button
                  type="button"
                  onClick={() => handleStartEdit(label)}
                  className="text-muted hover:text-text transition-colors"
                  aria-label={t('settings.editLabel')}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(label.id)}
                  className="text-muted hover:text-error transition-colors"
                  aria-label={t('feeds.delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ),
        )}

        {showAdd && (
          <LabelFormRow
            form={form}
            onChange={setForm}
            onSave={handleCreate}
            onCancel={() => { setShowAdd(false); setForm(EMPTY_FORM) }}
          />
        )}
      </div>

      {!showAdd && editingId === null && (
        <button
          type="button"
          onClick={() => { setShowAdd(true); setForm(EMPTY_FORM) }}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:opacity-80 transition-opacity"
        >
          <Plus size={14} />
          {t('settings.addLabel')}
        </button>
      )}

      {deletingLabel && (
        <ConfirmDialog
          title={t('settings.editLabel')}
          message={t('settings.labelDeleteConfirm', { name: deletingLabel.name })}
          danger
          confirmLabel={t('feeds.delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </section>
  )
}

interface LabelFormRowProps {
  form: LabelForm
  onChange: (f: LabelForm) => void
  onSave: () => void
  onCancel: () => void
}

function LabelFormRow({ form, onChange, onSave, onCancel }: LabelFormRowProps) {
  const { t } = useI18n()
  const canSave = form.name.trim().length > 0 && form.match_text.trim().length > 0

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-accent bg-bg-card">
      <input
        type="text"
        placeholder={t('settings.labelName')}
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        className="w-full px-2 py-1 text-sm rounded-lg border border-border bg-bg text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <input
        type="text"
        placeholder={t('settings.labelMatchText')}
        value={form.match_text}
        onChange={(e) => onChange({ ...form, match_text: e.target.value })}
        className="w-full px-2 py-1 text-sm rounded-lg border border-border bg-bg text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <div className="flex items-center gap-2">
        <Select
          value={form.match_field}
          onValueChange={(v) => onChange({ ...form, match_field: v as MatchField })}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue>{matchFieldLabel(form.match_field, t)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="both">{t('settings.labelMatchFieldBoth')}</SelectItem>
            <SelectItem value="title">{t('settings.labelMatchFieldTitle')}</SelectItem>
            <SelectItem value="full_text">{t('settings.labelMatchFieldFullText')}</SelectItem>
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="p-1.5 rounded-lg text-accent hover:bg-hover disabled:opacity-40 transition-colors"
          aria-label={t('settings.addLabel')}
        >
          <Check size={16} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 rounded-lg text-muted hover:bg-hover transition-colors"
          aria-label={t('confirm.cancel')}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
