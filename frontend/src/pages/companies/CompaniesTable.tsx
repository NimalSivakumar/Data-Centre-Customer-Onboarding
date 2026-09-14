import { DataTable } from '../../components/DataTable'
import { SearchFilterBar } from '../../components/SearchFilterBar'
import { SectionHeading } from '../../components/SectionHeading'
import { TableActionButton } from '../../components/TableActionButton'
import { companyStatusOptions } from '../../constants/options'
import type { Company } from '../../types/api'

type CompaniesTableProps = {
  companies: Company[]
  search: string
  status: string
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  onClearFilters: () => void
  onEdit: (company: Company) => void
}

export function CompaniesTable({ companies, search, status, onSearchChange, onStatusChange, onClearFilters, onEdit }: CompaniesTableProps) {
  return <><SectionHeading title="Companies" count={companies.length} /><SearchFilterBar search={search} onSearchChange={onSearchChange} placeholder="Search company, code, or email..." resultCount={companies.length} filters={[{ label: 'Status', value: status, onChange: onStatusChange, options: companyStatusOptions }]} onClear={onClearFilters} /><DataTable rows={companies} columns={['name', 'customer_code', 'main_email', 'main_phone', 'status']} emptyMessage="No companies match your filters." actions={(company) => <TableActionButton type="button" onClick={() => onEdit(company as Company)}>Edit</TableActionButton>} /></>
}
