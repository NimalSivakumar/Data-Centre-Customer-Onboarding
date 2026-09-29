export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'
export const FIXED_SITE_LOCATION = 'Cable & Wireless, Victoria'

export const ENTRA_TENANT_ID = import.meta.env.VITE_ENTRA_TENANT_ID
export const ENTRA_CLIENT_ID = import.meta.env.VITE_ENTRA_CLIENT_ID
export const ENTRA_AUTHORITY = `https://login.microsoftonline.com/${ENTRA_TENANT_ID}`
export const ENTRA_REDIRECT_URI = import.meta.env.VITE_ENTRA_REDIRECT_URI ?? window.location.origin
export const ENTRA_API_SCOPE = import.meta.env.VITE_ENTRA_API_SCOPE
