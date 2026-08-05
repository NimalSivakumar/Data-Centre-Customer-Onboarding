import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { hasAnyRole } from '../../auth/permissions'
import { Cards } from '../../components/Cards'
import { LoadingState } from '../../components/LoadingState'
import { Page } from '../../components/Page'
import { SectionHeading } from '../../components/SectionHeading'
import type { AuthState } from '../../types/api'

export function Dashboard({ auth }: { auth: AuthState }) {
  const [summary, setSummary] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState('')
  const isCustomerDashboard = hasAnyRole(auth.user, ['CUSTOMER_ADMIN', 'CUSTOMER_USER'])

  useEffect(() => {
    const path = isCustomerDashboard ? '/dashboard/customer-summary' : '/dashboard/admin-summary'
    api<Record<string, number>>(path, auth).then(setSummary).catch((err: Error) => setError(err.message))
  }, [auth, isCustomerDashboard])

  const total = summary ? Object.values(summary).reduce((sum, value) => sum + value, 0) : 0
  const actions = getDashboardQuickActions(isCustomerDashboard)

  return (
    <Page title="Dashboard" error={error}>
      {summary ? (
        <section className="dashboard-page">
          <div className="dashboard-hero">
            <div>
              <p className="eyebrow">Live overview</p>
              <h2>{isCustomerDashboard ? 'Your visitor access summary' : 'Operations control dashboard'}</h2>
              <p>{isCustomerDashboard ? 'Monitor your submitted requests and prepare upcoming visitor access.' : 'Track customers, pending approvals, today\'s visits, and live visitor movement from one place.'}</p>
            </div>
            <div className="dashboard-total">
              <span>Total activity</span>
              <strong>{total}</strong>
            </div>
          </div>
          <Cards data={summary} />
          <section className="quick-actions-panel">
            <SectionHeading title="Quick actions" helpText="Common tasks for this role." />
            <div className="dashboard-actions">
              {actions.map((action) => (
                <Link className={`dashboard-action ${action.tone}`} to={action.to} key={action.title}>
                  <span>{action.kicker}</span>
                  <h3>{action.title}</h3>
                  <p>{action.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </section>
      ) : <LoadingState label="Loading dashboard summary..." />}
    </Page>
  )
}

function getDashboardQuickActions(isCustomerDashboard: boolean) {
  if (isCustomerDashboard) {
    return [
      {
        kicker: 'Visitor access',
        title: 'Submit request',
        description: 'Create a new visitor access request for your assigned company.',
        to: '/visitor-request',
        tone: 'action-primary',
      },
      {
        kicker: 'Tracking',
        title: 'My requests',
        description: 'View submitted, approved, rejected, and cancelled visitor requests.',
        to: '/requests',
        tone: 'action-secondary',
      },
    ]
  }

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
      description: 'Maintain customer contacts and customer login access from one place.',
      to: '/contacts?action=list',
      tone: 'action-secondary',
    },
    {
      kicker: 'Governance',
      title: 'Audit logs',
      description: 'Review system activity, approvals, visitor movement, and user changes.',
      to: '/audit',
      tone: 'action-success',
    },
  ]
}
