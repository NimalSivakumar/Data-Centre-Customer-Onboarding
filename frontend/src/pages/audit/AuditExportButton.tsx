type AuditExportButtonProps = {
  onExport: () => Promise<void>
  exporting: boolean
  disabled: boolean
}

export function AuditExportButton({ onExport, exporting, disabled }: AuditExportButtonProps) {
  return <button type="button" onClick={() => void onExport()} disabled={disabled || exporting}>{exporting ? 'Preparing export...' : 'Export all matching logs'}</button>
}
