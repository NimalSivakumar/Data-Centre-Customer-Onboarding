import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { Cards } from '../../components/Cards'
import { LoadingState } from '../../components/LoadingState'
import { Page } from '../../components/Page'
import { SectionHeading } from '../../components/SectionHeading'
import type { AuthState } from '../../types/api'

export function Dashboard({ auth }: { auth: AuthState }) {
  const [summary, setSummary] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api<Record<string, number>>('/dashboard/admin-summary', auth).then(setSummary).catch((err: Error) => setError(err.message))
  }, [auth])

  const actions = getDashboardQuickActions()
  const [primaryAction, ...secondaryActions] = actions

  return (
    <Page title="Dashboard" error={error}>
      {summary ? (
        <section className="dashboard-page">
          <div className="dashboard-heading page-header">
            <div>
              <p className="eyebrow">Today&apos;s operations</p>
              <h1>Dashboard</h1>
              <p>Visitor access and onboarding activity for the current operational workload.</p>
            </div>
          </div>
          <Cards data={summary} />
          <section className="quick-actions-panel">
            <SectionHeading title="Priority actions" helpText="Common operational tasks for this role." />
            <div className="dashboard-actions dashboard-actions-priority">
              <Link className={`dashboard-action dashboard-action-primary ${primaryAction.tone}`} to={primaryAction.to} key={primaryAction.title}>
                <span>{primaryAction.kicker}</span>
                <h3>{primaryAction.title}</h3>
                <p>{primaryAction.description}</p>
              </Link>
              <div className="dashboard-secondary-actions">
                {secondaryActions.map((action) => (
                  <Link className={`dashboard-action ${action.tone}`} to={action.to} key={action.title}>
                  <span>{action.kicker}</span>
                  <h3>{action.title}</h3>
                  <p>{action.description}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </section>
      ) : <LoadingState label="Loading dashboard summary..." />}
    </Page>
  )
}

function getDashboardQuickActions() {
  return [
    {
      kicker: 'Approvals',
      title: 'Review requests',
      description: 'Open submitted visitor requests and approve or reject them with review notes.',
      to: '/requests',
      tone: 'action-warning',
    },
    {
      kicker: 'Customers',
      title: 'Create company',
      description: 'Onboard a new customer company and create its primary contact record.',
      to: '/companies?action=create',
      tone: 'action-primary',
    },
    {
      kicker: 'Directory',
      title: 'Manage contacts',
      description: 'Maintain customer company contacts as business records.',
      to: '/contacts?action=list',
      tone: 'action-secondary',
    },
    {
      kicker: 'Governance',
      title: 'Audit logs',
      description: 'Review system activity, approvals, and visitor movement.',
      to: '/audit',
      tone: 'action-success',
    },
  ]
}
