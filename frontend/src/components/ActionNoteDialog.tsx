import { useEffect, useRef, useState } from 'react'
import { operationError } from '../utils/asyncOperation'
import { useModalFocus } from './useModalFocus'

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
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const activeDialog = useRef(dialog)
  activeDialog.current = dialog
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useModalFocus(!!dialog, dialogRef, close)

  function close() {
    if (!inFlight.current) onClose()
  }

  useEffect(() => {
    setNote('')
    setIdentityChecked(false)
    setSubmitting(false)
    setError('')
    inFlight.current = false
  }, [dialog])

  if (!dialog) return null

  const currentDialog = dialog
  const needsNote = dialog.noteLabel && dialog.noteRequired !== false
  const canSubmit = (!needsNote || note.trim().length > 0) && (!dialog.requireIdentityCheck || identityChecked)

  async function submit() {
    if (!canSubmit || inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    setError('')
    try {
      await currentDialog.onConfirm(note.trim())
      if (activeDialog.current === currentDialog) onClose()
    } catch (err) {
      if (activeDialog.current === currentDialog) setError(operationError(err))
    } finally {
      if (activeDialog.current === currentDialog) {
        inFlight.current = false
        setSubmitting(false)
      }
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div ref={dialogRef} tabIndex={-1} className="action-dialog" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title" aria-busy={submitting}>
        <button type="button" className="dialog-close" aria-label="Close" onClick={close} disabled={submitting}>×</button>
        <div>
          <p className="eyebrow">Action confirmation</p>
          <h2 id="action-dialog-title">{dialog.title}</h2>
          <p>{dialog.message}</p>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {dialog.requireIdentityCheck && (
          <label className="checkbox">
            <input type="checkbox" checked={identityChecked} disabled={submitting} onChange={(event) => setIdentityChecked(event.target.checked)} />
            Identity verified against the approved visitor record
          </label>
        )}
        {dialog.noteLabel && (
          <label>
            {dialog.noteLabel}
            <textarea value={note} disabled={submitting} onChange={(event) => setNote(event.target.value)} data-modal-initial-focus />
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={close} disabled={submitting}>Cancel</button>
          <button type="button" className={dialog.danger ? 'danger' : ''} onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? 'Saving...' : dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export type { ActionNoteDialogState }
