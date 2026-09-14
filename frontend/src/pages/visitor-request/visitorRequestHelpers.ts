export function cleanPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, value === '' ? null : value]))
}
