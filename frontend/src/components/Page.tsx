import type { ReactNode } from 'react'

export function Page({ error, message, children }: { title: string; error?: string; message?: string; children: ReactNode }) {
  return <>{(error || message) && <div className="page-toast" role="status">{error && <div className="alert alert-danger">{error}</div>}{message && <div className="alert alert-success">{message}</div>}</div>}{children}</>
}
