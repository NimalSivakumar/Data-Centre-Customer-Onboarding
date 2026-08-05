import type { ReactNode } from 'react'
import { isReactNode } from '../utils/react'

export function DataTable<T extends Record<string, unknown>>({ rows, columns, labels = {}, emptyMessage = 'No records yet.', compact = false, actions }: { rows: T[]; columns: string[]; labels?: Record<string, string>; emptyMessage?: string; compact?: boolean; actions?: (row: T) => ReactNode }) {
  const actionCells = actions ? rows.map((row) => actions(row)) : []
  const showActions = actionCells.some(Boolean)
  return <div className="table-wrap table-responsive"><table className={`table table-striped table-hover align-middle${compact ? ' table-compact' : ''}`}><thead><tr>{columns.map((column) => <th key={column}>{labels[column] ?? column.replaceAll('_', ' ')}</th>)}{showActions && <th>Actions</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? row.visitor_access_id ?? index)}>{columns.map((column) => <td key={column} className={`cell-${column}`}>{isReactNode(row[column]) ? row[column] : String(row[column] ?? '')}</td>)}{showActions && <td className="actions">{actionCells[index]}</td>}</tr>)}</tbody></table>{rows.length === 0 && <p className="empty">{emptyMessage}</p>}</div>
}
