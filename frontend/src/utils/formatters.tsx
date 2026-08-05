import type { ReactNode } from 'react'

export function formatStatus(value: string) {
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export function statusBadge(value: string): ReactNode {
  const status = value.toUpperCase()
  const tone = status.includes('APPROVED') || status.includes('CHECKED_IN') || status.includes('ACTIVE') ? 'success'
    : status.includes('REJECTED') || status.includes('DENIED') || status.includes('CANCELLED') ? 'danger'
      : status.includes('CHECKED_OUT') ? 'neutral'
        : 'warning'
  return <span className={`status-badge status-${tone}`}>{formatStatus(value)}</span>
}
