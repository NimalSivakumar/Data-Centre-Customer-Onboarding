export function operationError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return typeof error === 'string' ? error : 'The operation failed. Please try again.'
}
