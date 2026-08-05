export function cleanFormPayload(form: FormData) {
  return Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, value === '' ? null : value]))
}
