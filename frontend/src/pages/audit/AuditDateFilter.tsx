import type { AuditDateRange } from './auditFilters'

type AuditDateFilterProps = {
  value: AuditDateRange
  onChange: (value: AuditDateRange) => void
  onClear: () => void
}

export function AuditDateFilter({ value, onChange, onClear }: AuditDateFilterProps) {
  const hasFilter = Boolean(value.from || value.to)

  return <div className="audit-controls" aria-label="Audit log filters"><label>From date<input type="date" value={value.from} max={value.to || undefined} onChange={(event) => onChange({ ...value, from: event.target.value })} /></label><label>To date<input type="date" value={value.to} min={value.from || undefined} onChange={(event) => onChange({ ...value, to: event.target.value })} /></label><button type="button" className="secondary" onClick={onClear} disabled={!hasFilter}>Clear dates</button></div>
}
