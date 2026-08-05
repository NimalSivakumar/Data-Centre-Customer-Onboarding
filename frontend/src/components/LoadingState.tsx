export function LoadingState({ label = 'Loading records...' }: { label?: string }) {
  return <div className="state-card loading-state">{label}</div>
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="state-card empty-state"><strong>{title}</strong><span>{message}</span></div>
}
