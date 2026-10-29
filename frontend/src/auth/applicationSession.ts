export const SESSION_STORAGE_KEY = 'dc_onboarding_session_id'
const SIGNED_OUT_KEY = 'dc_onboarding_signed_out'

export function sessionBootstrapAction(freshSignIn: boolean, locked: boolean, sessionId: string | null) {
  if (freshSignIn) return 'start'
  if (locked || !sessionId) return 'sign-in'
  return 'resume'
}

export function getApplicationSessionId() {
  return sessionStorage.getItem(SESSION_STORAGE_KEY)
}

export function setApplicationSessionId(id: string | null) {
  if (id) sessionStorage.setItem(SESSION_STORAGE_KEY, id)
  else sessionStorage.removeItem(SESSION_STORAGE_KEY)
}

export function lockApplicationSession() {
  sessionStorage.setItem(SIGNED_OUT_KEY, 'true')
  setApplicationSessionId(null)
}

export function isApplicationLocked() {
  return sessionStorage.getItem(SIGNED_OUT_KEY) === 'true'
}

export function unlockApplicationSession() {
  sessionStorage.removeItem(SIGNED_OUT_KEY)
}
