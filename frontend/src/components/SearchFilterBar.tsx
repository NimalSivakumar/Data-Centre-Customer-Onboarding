type FilterOption = { label: string; value: string }
type SelectFilter = { label: string; value: string; onChange: (value: string) => void; options: FilterOption[] }

export function SearchFilterBar({ search, onSearchChange, placeholder = 'Search records...', filters = [], resultCount, onClear }: { search: string; onSearchChange: (value: string) => void; placeholder?: string; filters?: SelectFilter[]; resultCount?: number; onClear: () => void }) {
  const hasFilters = search.trim() || filters.some((filter) => filter.value)

  return <div className="search-filter-bar"><label className="search-field">Search<input value={search} placeholder={placeholder} onChange={(event) => onSearchChange(event.target.value)} /></label>{filters.map((filter) => <label key={filter.label}>{filter.label}<select value={filter.value} onChange={(event) => filter.onChange(event.target.value)}>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}<div className="filter-summary"><span>{typeof resultCount === 'number' ? `${resultCount} records` : ''}</span><button type="button" className="secondary table-action" onClick={onClear} disabled={!hasFilters}>Clear</button></div></div>
}
