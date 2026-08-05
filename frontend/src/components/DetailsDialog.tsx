import type { ReactNode } from 'react'

export type DetailItem = { label: string; value: ReactNode }
export type DetailsDialogState = { title: string; subtitle?: string; items: DetailItem[] }

export function DetailsDialog({ details, onClose }: { details: DetailsDialogState | null; onClose: () => void }) {
  if (!details) return null

  return <div className="dialog-backdrop" role="presentation"><div className="details-dialog" role="dialog" aria-modal="true" aria-labelledby="details-dialog-title"><div><p className="eyebrow">Record details</p><h2 id="details-dialog-title">{details.title}</h2>{details.subtitle && <p>{details.subtitle}</p>}</div><dl className="details-list">{details.items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value || '-'}</dd></div>)}</dl><div className="dialog-actions"><button type="button" onClick={onClose}>Close</button></div></div></div>
}
