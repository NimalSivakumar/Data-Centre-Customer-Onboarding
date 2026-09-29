import { PublicClientApplication } from '@azure/msal-browser'
import type { Configuration, RedirectRequest } from '@azure/msal-browser'
import { ENTRA_API_SCOPE, ENTRA_AUTHORITY, ENTRA_CLIENT_ID, ENTRA_REDIRECT_URI, ENTRA_TENANT_ID } from '../constants/app'

if (!ENTRA_CLIENT_ID) throw new Error('Missing VITE_ENTRA_CLIENT_ID in frontend .env')
if (!ENTRA_TENANT_ID) throw new Error('Missing VITE_ENTRA_TENANT_ID in frontend .env')

const msalConfig: Configuration = {
  auth: {
    clientId: ENTRA_CLIENT_ID,
    authority: ENTRA_AUTHORITY,
    redirectUri: ENTRA_REDIRECT_URI,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
}

export const msalInstance = new PublicClientApplication(msalConfig)

export const entraLoginRequest: RedirectRequest = {
  scopes: ['openid', 'profile', 'email', ENTRA_API_SCOPE],
}
