import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { RoleGate } from '../auth/RoleGate'
import { defaultPathForUser } from '../auth/permissions'
import { getNavItems } from './navigation'
import { AuditPage } from '../pages/audit/AuditPage'
import { CompaniesPage } from '../pages/companies/CompaniesPage'
import { ContactsUsersPage } from '../pages/contacts-users/ContactsUsersPage'
import { Dashboard } from '../pages/dashboard/Dashboard'
import { InternalUsersPage } from '../pages/internal-users/InternalUsersPage'
import { RequestsPage } from '../pages/requests/RequestsPage'
import { SecurityPage } from '../pages/security/SecurityPage'
import { VisitorRequestPage } from '../pages/visitor-request/VisitorRequestPage'
import type { AuthState } from '../types/api'

type DropdownNavItem = {
  path: string
  label: string
  links: { to: string; label: string }[]
}

const dropdownNavItems: Record<string, DropdownNavItem> = {
  '/companies': {
    path: '/companies',
    label: 'Companies',
    links: [
      { to: '/companies?action=create', label: 'Create company' },
      { to: '/companies?action=list', label: 'List companies' },
    ],
  },
  '/contacts': {
    path: '/contacts',
    label: 'Contacts',
    links: [
      { to: '/contacts?action=create', label: 'Create contact' },
      { to: '/contacts?action=list', label: 'List contacts' },
    ],
  },
  '/customer-users': {
    path: '/customer-users',
    label: 'Users',
    links: [
      { to: '/customer-users?action=new', label: 'Create new user' },
      { to: '/customer-users?action=existing', label: 'Existing contact user' },
      { to: '/customer-users?action=list', label: 'List users' },
    ],
  },
  '/internal-users': {
    path: '/internal-users',
    label: 'Internal Users',
    links: [
      { to: '/internal-users?action=create', label: 'Create internal user' },
      { to: '/internal-users?action=list', label: 'List internal users' },
    ],
  },
}

const pageRoutes: { path: string; roles: string[]; element: (auth: AuthState) => ReactNode }[] = [
  { path: '/dashboard', roles: ['ADMIN', 'OPS'], element: (auth) => <Dashboard auth={auth} /> },
  { path: '/companies', roles: ['ADMIN', 'OPS'], element: (auth) => <CompaniesPage auth={auth} /> },
  { path: '/contacts', roles: ['ADMIN', 'OPS'], element: (auth) => <ContactsUsersPage auth={auth} page="contacts" /> },
  { path: '/customer-users', roles: ['ADMIN', 'OPS'], element: (auth) => <ContactsUsersPage auth={auth} page="users" /> },
  { path: '/internal-users', roles: ['ADMIN'], element: (auth) => <InternalUsersPage auth={auth} /> },
  { path: '/visitor-request', roles: ['ADMIN', 'OPS', 'CUSTOMER_ADMIN', 'CUSTOMER_USER'], element: (auth) => <VisitorRequestPage auth={auth} /> },
  { path: '/requests', roles: ['ADMIN', 'OPS', 'CUSTOMER_ADMIN', 'CUSTOMER_USER'], element: (auth) => <RequestsPage auth={auth} user={auth.user} /> },
  { path: '/security', roles: ['SECURITY'], element: (auth) => <SecurityPage auth={auth} /> },
  { path: '/audit', roles: ['ADMIN', 'OPS'], element: (auth) => <AuditPage auth={auth} /> },
]

export function Shell({ auth, onLogout }: { auth: AuthState; onLogout: () => void }) {
  const navItems = getNavItems(auth.user)
  const [closedDropdown, setClosedDropdown] = useState<string | null>(null)
  const initials = auth.user.full_name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  function closeDropdown(key: string, event: MouseEvent<HTMLAnchorElement>) {
    setClosedDropdown(key)
    const dropdown = event.currentTarget.closest('.dropdown')
    dropdown?.querySelector('.dropdown-menu')?.classList.remove('show')
    const toggle = dropdown?.querySelector('.dropdown-toggle') as HTMLButtonElement | null
    toggle?.setAttribute('aria-expanded', 'false')
    setTimeout(() => {
      toggle?.blur()
      event.currentTarget.blur()
    }, 0)
  }

  function renderDropdown(item: DropdownNavItem) {
    return (
      <div className={`dropdown ${closedDropdown === item.path ? 'dropdown-closed' : ''}`} key={item.path} onMouseLeave={() => setClosedDropdown(null)}>
        <button className="btn btn-secondary dropdown-toggle w-100 text-start" type="button" data-bs-toggle="dropdown" aria-expanded="false">
          {item.label}
        </button>
        <ul className="dropdown-menu">
          {item.links.map((link) => (
            <li key={link.to}>
              <Link className="dropdown-item" to={link.to} onClick={(event) => closeDropdown(item.path, event)}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Data Centre</p>
          <h1>Visitor Access</h1>
        </div>
        <nav>
          {navItems.map((item) => dropdownNavItems[item.path] ? renderDropdown(dropdownNavItems[item.path]) : <NavLink key={item.path} to={item.path}>{item.label}</NavLink>)}
        </nav>
        <div className="sidebar-account">
          <div className="account-summary">
            <div className="account-avatar">{initials}</div>
            <div className="account-meta">
              <strong>{auth.user.full_name}</strong>
              <span>{auth.user.roles.join(', ')}</span>
            </div>
          </div>
          <button className="logout-button" onClick={onLogout}>Sign out</button>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <div>
            <span className="workspace-kicker">Operations Portal</span>
            <strong>Data Centre Onboarding Portal</strong>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Navigate to={defaultPathForUser(auth.user)} replace />} />
            {pageRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={<RoleGate user={auth.user} roles={route.roles}>{route.element(auth)}</RoleGate>}
              />
            ))}
          </Routes>
        </main>
      </div>
    </div>
  )
}
