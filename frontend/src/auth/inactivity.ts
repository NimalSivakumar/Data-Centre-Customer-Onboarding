type IdleOptions = {
  timeoutMs: number
  warningMs: number
  initialRemainingMs: number
  onWarning: (remainingSeconds: number | null) => void
  onActivity: () => void
  onExpire: () => void
}

type IdleEnvironment = {
  target: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
  now: () => number
  interval: typeof window.setInterval
  clearInterval: typeof window.clearInterval
  timeout: typeof window.setTimeout
  clearTimeout: typeof window.clearTimeout
}

export function startInactivityMonitor(options: IdleOptions, environment?: IdleEnvironment) {
  const env = environment ?? {
    target: document, now: Date.now,
    interval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window),
    timeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
  }
  let lastActivity = env.now() - options.timeoutMs + Math.min(options.timeoutMs, options.initialRemainingMs)
  let lastReport = -Infinity
  let pending: number | undefined
  let stopped = false
  let expired = false

  function check() {
    if (stopped || expired) return
    const remaining = options.timeoutMs - (env.now() - lastActivity)
    if (remaining <= 0) {
      expired = true
      if (pending !== undefined) env.clearTimeout(pending)
      options.onWarning(null)
      options.onExpire()
      return
    }
    options.onWarning(remaining <= options.warningMs ? Math.ceil(remaining / 1000) : null)
  }

  function report() {
    pending = undefined
    check()
    if (stopped || expired) return
    lastReport = env.now()
    options.onActivity()
  }

  function stayActive() {
    // Check BEFORE resetting: waking a suspended tab cannot revive an expired session.
    check()
    if (stopped || expired) return
    lastActivity = env.now()
    options.onWarning(null)
    if (pending !== undefined) env.clearTimeout(pending)
    if (env.now() - lastReport >= 30_000) report()
    else pending = env.timeout(report, 500)
  }

  const activity: EventListener = (event) => {
    if (event.isTrusted && env.target.visibilityState === 'visible') stayActive()
  }
  const events = ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel']
  events.forEach((name) => env.target.addEventListener(name, activity, { passive: true, capture: true }))
  env.target.addEventListener('visibilitychange', check)
  const timer = env.interval(check, 1000)
  check()
  return {
    stayActive,
    stop() {
      stopped = true
      env.clearInterval(timer)
      if (pending !== undefined) env.clearTimeout(pending)
      events.forEach((name) => env.target.removeEventListener(name, activity, true))
      env.target.removeEventListener('visibilitychange', check)
    },
  }
}
