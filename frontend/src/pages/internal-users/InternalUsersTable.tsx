import { DataTable } from '../../components/DataTable'
import { SearchFilterBar } from '../../components/SearchFilterBar'
import { SectionHeading } from '../../components/SectionHeading'
import { TableActionButton } from '../../components/TableActionButton'
import { activeStatusOptions, internalRoleOptions } from '../../constants/options'
import type { InternalUser } from '../../types/api'
import type { InternalUserRow } from './internalUserTypes'

type InternalUsersTableProps = {
  rows: InternalUserRow[]
  search: string
  roleFilter: string
  statusFilter: string
  onSearchChange: (value: string) => void
  onRoleFilterChange: (value: string) => void
  onStatusFilterChange: (value: string) => void
  onClearFilters: () => void
  onEdit: (user: InternalUser) => void
}

export function InternalUsersTable({ rows, search, roleFilter, statusFilter, onSearchChange, onRoleFilterChange, onStatusFilterChange, onClearFilters, onEdit }: InternalUsersTableProps) {
  return <><SectionHeading title="Internal accounts" helpText="Search, filter, and manage OPS and SECURITY accounts." count={rows.length} /><SearchFilterBar search={search} onSearchChange={onSearchChange} placeholder="Search name, email, role, or status..." resultCount={rows.length} filters={[{ label: 'Role', value: roleFilter, onChange: onRoleFilterChange, options: internalRoleOptions }, { label: 'Status', value: statusFilter, onChange: onStatusFilterChange, options: activeStatusOptions }]} onClear={onClearFilters} /><DataTable rows={rows} columns={['full_name', 'email', 'role', 'status']} emptyMessage="No internal users match your filters." actions={(user) => <TableActionButton type="button" onClick={() => onEdit(user as unknown as InternalUser)}>Edit</TableActionButton>} /></>
}
