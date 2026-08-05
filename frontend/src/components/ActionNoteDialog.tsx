import { useEffect, useState } from 'react'

type ActionNoteDialogState = {
  title: string
  message: string
  noteLabel?: string
  confirmLabel: string
  danger?: boolean
  requireIdentityCheck?: boolean
  noteRequired?: boolean
  onConfirm: (note: string) => Promise<void>
}

export function ActionNoteDialog({ dialog, onClose }: { dialog: ActionNoteDialogState | null; onClose: () => void }) {
  const [note, setNote] = useState('')
  const [identityChecked, setIdentityChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setNote('')
    setIdentityChecked(false)
    setSubmitting(false)
  }, [dialog])

  if (!dialog) return null

  const currentDialog = dialog
  const needsNote = dialog.noteLabel && dialog.noteRequired !== false
  const canSubmit = (!needsNote || note.trim().length > 0) && (!dialog.requireIdentityCheck || identityChecked)

  async function submit() {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    try {
      await currentDialog.onConfirm(note.trim())
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="dialog-backdrop" role="presentation"><div className="action-dialog" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title"><div><p className="eyebrow">Action confirmation</p><h2 id="action-dialog-title">{dialog.title}</h2><p>{dialog.message}</p></div>{dialog.requireIdentityCheck && <label className="checkbox"><input type="checkbox" checked={identityChecked} onChange={(event) => setIdentityChecked(event.target.checked)} /> Identity verified against the approved visitor record</label>}{dialog.noteLabel && <label>{dialog.noteLabel}<textarea value={note} onChange={(event) => setNote(event.target.value)} autoFocus /></label>}<div className="dialog-actions"><button type="button" className="secondary" onClick={onClose} disabled={submitting}>Cancel</button><button type="button" className={dialog.danger ? 'danger' : ''} onClick={submit} disabled={!canSubmit || submitting}>{submitting ? 'Saving...' : dialog.confirmLabel}</button></div></div></div>
}

export type { ActionNoteDialogState }
