import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { BrowserRouter } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './index.css'
import App from './App.tsx'
import { msalInstance } from './auth/entra.ts'

const routerBaseName = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')

async function bootstrap() {
  await msalInstance.initialize()

  createRoot(document.getElementById('root')!).render(
    <MsalProvider instance={msalInstance}>
      <BrowserRouter basename={routerBaseName}>
        <App />
      </BrowserRouter>
    </MsalProvider>,
  )
}

void bootstrap()
