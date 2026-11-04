import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { BrowserRouter } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './index.css'
import App from './App.tsx'
import { msalInstance } from './auth/entra.ts'
import { withDeadline } from './api/requestDeadline'

const routerBaseName = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!)
  root.render(<div className="loading-screen" role="status">Starting Data Centre Customer Onboarding...</div>)
  try {
    await withDeadline(() => msalInstance.initialize(), { timeoutMs: 15_000 })
  } catch {
    root.render(<main className="login-page"><section className="login-card" role="alert">
      <h1>Unable to start Data Centre Customer Onboarding</h1>
      <p>Microsoft authentication could not be initialized or timed out. Check your connection, then reload. If this continues, contact support.</p>
      <button type="button" onClick={() => window.location.reload()}>Reload application</button>
    </section></main>)
    return
  }

  root.render(
    <MsalProvider instance={msalInstance}>
      <BrowserRouter basename={routerBaseName}>
        <App />
      </BrowserRouter>
    </MsalProvider>,
  )
}

void bootstrap()
