export function Cards({ data }: { data: Record<string, number> }) {
  return <div className="cards dashboard-cards">{Object.entries(data).map(([key, value], index) => <div className={`card metric-card metric-${index + 1}`} key={key}><span>{formatMetricLabel(key)}</span><strong>{value}</strong><small>{getMetricHint(key)}</small></div>)}</div>
}

function formatMetricLabel(value: string) {
  return value.replaceAll('_', ' ')
}

function getMetricHint(key: string) {
  if (key.includes('pending')) return 'Needs review'
  if (key.includes('approved')) return 'Ready for access'
  if (key.includes('checked_in')) return 'Currently inside'
  if (key.includes('customer')) return 'Active customer base'
  if (key.includes('rejected')) return 'Requires follow-up'
  return 'Current count'
}
