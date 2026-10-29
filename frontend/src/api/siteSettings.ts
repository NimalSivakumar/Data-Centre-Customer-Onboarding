import { API_BASE_URL } from '../constants/app'

export type SiteSettings = { site_timezone: string; site_location: string }
let siteSettings: SiteSettings | null = null

export async function loadSiteSettings(accessToken: string) {
  siteSettings = null
  const response = await fetch(`${API_BASE_URL}/auth/site-settings`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error('Could not load site settings')
  const data: unknown = await response.json()
  if (typeof data !== 'object' || data === null || !('site_timezone' in data) || !('site_location' in data)
    || typeof data.site_timezone !== 'string' || typeof data.site_location !== 'string' || !data.site_location.trim()) {
    throw new Error('Invalid site settings')
  }
  // Fail explicitly rather than silently falling back to browser-local time.
  new Intl.DateTimeFormat('en', { timeZone: data.site_timezone }).format()
  siteSettings = { site_timezone: data.site_timezone, site_location: data.site_location }
}

export function getSiteSettings(): SiteSettings {
  if (!siteSettings) throw new Error('Site settings have not loaded')
  return siteSettings
}
