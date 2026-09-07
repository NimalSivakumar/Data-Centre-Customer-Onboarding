import type { ReactNode } from 'react'

export type DetailItem = { label: string; value: ReactNode; wide?: boolean; prominent?: boolean }
export type DetailsDialogState = { title: string; subtitle?: string; items: DetailItem[] }

export function DetailsDialog({ details, onClose }: { details: DetailsDialogState | null; onClose: () => void }) {
  if (!details) return null

  return <div className="dialog-backdrop" role="presentation"><div className="details-dialog" role="dialog" aria-modal="true" aria-labelledby="details-dialog-title"><button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>×</button><div><p className="eyebrow">Record details</p><h2 id="details-dialog-title">{details.title}</h2>{details.subtitle && <p>{details.subtitle}</p>}</div><dl className="details-list">{details.items.map((item) => <div key={item.label} className={`${item.wide ? 'detail-wide' : ''} ${item.prominent ? 'detail-prominent' : ''}`.trim()}><dt>{item.label}</dt><dd>{item.value || '-'}</dd></div>)}</dl></div></div>
}
