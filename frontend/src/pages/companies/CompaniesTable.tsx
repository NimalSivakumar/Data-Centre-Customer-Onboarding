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
  page: number
  pageSize: number
  total: number
  loading: boolean
  saving?: boolean
  onPageChange: (page: number) => void
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  onClearFilters: () => void
  onEdit: (company: Company) => void
}

export function CompaniesTable({
  companies, search, status, page, pageSize, total, loading, saving = false,
  onPageChange, onSearchChange, onStatusChange, onClearFilters, onEdit,
}: CompaniesTableProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return (
    <>
      <SectionHeading title="Companies" count={total} />
      <SearchFilterBar
        search={search}
        onSearchChange={onSearchChange}
        placeholder="Search company, code, or email..."
        resultCount={total}
        filters={[{ label: 'Status', value: status, onChange: onStatusChange, options: companyStatusOptions }]}
        onClear={onClearFilters}
      />
      <div aria-busy={loading}>
        {loading ? <p role="status">Loading companies...</p> : (
          <DataTable
            rows={companies}
            columns={['name', 'customer_code', 'main_email', 'main_phone', 'status']}
            emptyMessage="No companies match your filters."
            actions={(company) => (
              <TableActionButton type="button" disabled={saving} onClick={() => onEdit(company as Company)}>
                Edit
              </TableActionButton>
            )}
          />
        )}
      </div>
      <nav aria-label="Company pages" className="filter-bar">
        <button type="button" disabled={loading || saving || page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        <span>Page {page} of {pageCount} · {total} companies</span>
        <button type="button" disabled={loading || saving || page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
      </nav>
    </>
  )
}
