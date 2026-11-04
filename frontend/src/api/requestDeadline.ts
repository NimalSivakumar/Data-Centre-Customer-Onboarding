type DeadlineOptions = { timeoutMs?: number; signal?: AbortSignal | null }

/** Bound token lookup, fetch AND body parsing; cancelling never retries a write. */
export function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  { timeoutMs = 15_000, signal }: DeadlineOptions = {},
): Promise<T> {
  const controller = new AbortController()
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const fail = (message: string, name: string) => {
      if (settled) return
      settled = true
      cleanup()
      const error = new Error(message)
      error.name = name
      reject(error)
      controller.abort()
    }
    const onAbort = () => fail('Request cancelled', 'AbortError')
    if (signal?.aborted) { onAbort(); return }
    signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => fail(
      'Request timed out. Check the connection and refresh before retrying a change.',
      'TimeoutError',
    ), timeoutMs)
    Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error('Request cancelled')
      return operation(controller.signal)
    }).then((value) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }, (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    })
  })
}
