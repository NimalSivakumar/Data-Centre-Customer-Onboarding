import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { RoleGate } from '../auth/RoleGate'
import { defaultPathForUser } from '../auth/permissions'
import { getNavItems } from './navigation'
import { AuditPage } from '../pages/audit/AuditPage'
import { CompaniesPage } from '../pages/companies/CompaniesPage'
import { ContactsUsersPage } from '../pages/contacts-users/ContactsUsersPage'
import { Dashboard } from '../pages/dashboard/Dashboard'
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
  '/requests': {
    path: '/requests',
    label: 'Requests',
    links: [
      { to: '/visitor-request', label: 'Submit request' },
      { to: '/requests', label: 'View requests' },
    ],
  },
}

function NavIcon({ path }: { path: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (path === '/dashboard') return <svg {...common}><path d="M4 13h6V4H4v9Z" /><path d="M14 20h6V4h-6v16Z" /><path d="M4 20h6v-3H4v3Z" /></svg>
  if (path === '/companies') return <svg {...common}><path d="M4 20V6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v14" /><path d="M8 8h5" /><path d="M8 12h5" /><path d="M8 16h2" /><path d="M17 10h1a2 2 0 0 1 2 2v8" /></svg>
  if (path === '/contacts') return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-8 0v2" /><circle cx="12" cy="7" r="4" /><path d="M20 8v6" /><path d="M23 11h-6" /></svg>
  if (path === '/requests') return <svg {...common}><path d="M14 3v4a2 2 0 0 0 2 2h4" /><path d="M20 15v3a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h7l6 6v2" /><path d="m10 14 2 2 4-5" /></svg>
  if (path === '/security') return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-5" /></svg>
  return <svg {...common}><path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h10" /><path d="M18 17v4" /><path d="M16 19h4" /></svg>
}

const pageRoutes: { path: string; roles: string[]; element: (auth: AuthState) => ReactNode }[] = [
  { path: '/dashboard', roles: ['ADMIN', 'OPS'], element: (auth) => <Dashboard auth={auth} /> },
  { path: '/companies', roles: ['ADMIN', 'OPS'], element: (auth) => <CompaniesPage auth={auth} /> },
  { path: '/contacts', roles: ['ADMIN', 'OPS'], element: (auth) => <ContactsUsersPage auth={auth} page="contacts" /> },
  { path: '/visitor-request', roles: ['ADMIN', 'OPS'], element: (auth) => <VisitorRequestPage auth={auth} /> },
  { path: '/requests', roles: ['ADMIN', 'OPS'], element: (auth) => <RequestsPage auth={auth} user={auth.user} /> },
  { path: '/security', roles: ['SECURITY'], element: (auth) => <SecurityPage auth={auth} /> },
  { path: '/audit', roles: ['ADMIN', 'OPS'], element: (auth) => <AuditPage auth={auth} /> },
]

export function Shell({ auth, onLogout }: { auth: AuthState; onLogout: () => void }) {
  const navItems = getNavItems(auth.user)
  const [navOpen, setNavOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const drawerId = useId()
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const location = useLocation()
  const initials = auth.user.full_name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const currentNavItem = navItems.find((item) => location.pathname === item.path || dropdownNavItems[item.path]?.links.some((link) => location.pathname === link.to))

  useEffect(() => {
    if (!navOpen) return
    const previousOverflow = document.body.style.overflow
    const menuButton = menuButtonRef.current
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeNavigation()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      menuButton?.focus()
    }
  }, [navOpen])

  function closeNavigation() {
    setNavOpen(false)
    setOpenDropdown(null)
  }

  function renderDropdown(item: DropdownNavItem) {
    const menuId = `${drawerId}-${item.path.replace('/', '')}-menu`
    const isOpen = openDropdown === item.path
    const isActive = location.pathname === item.path || item.links.some((link) => location.pathname === link.to)
    return (
      <div className={`nav-group ${isOpen ? 'nav-group-open' : ''}`} key={item.path}>
        <button className={`nav-button ${isActive ? 'active' : ''}`} type="button" aria-expanded={isOpen} aria-controls={menuId} onClick={() => setOpenDropdown(isOpen ? null : item.path)}>
          <span className="nav-icon"><NavIcon path={item.path} /></span>
          <span>{item.label}</span>
        </button>
        <ul className="nav-submenu" id={menuId} hidden={!isOpen}>
          {item.links.map((link) => (
            <li key={link.to}>
              <Link to={link.to} onClick={closeNavigation}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      {navOpen && <button className="nav-backdrop" type="button" aria-label="Close navigation" onClick={closeNavigation} />}
      <aside className="sidebar" id={drawerId} aria-label="Primary navigation">
        <button className="sidebar-close" ref={closeButtonRef} type="button" aria-label="Close navigation" onClick={closeNavigation}>×</button>
        <div className="brand-block">
          <p className="eyebrow">Data Centre</p>
          <h1>Visitor Access</h1>
          <span className="brand-subtitle">Onboarding operations</span>
        </div>
        <nav>
          {navItems.map((item) => dropdownNavItems[item.path] ? renderDropdown(dropdownNavItems[item.path]) : (
            <NavLink key={item.path} to={item.path} onClick={closeNavigation}>
              <span className="nav-icon"><NavIcon path={item.path} /></span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-account">
          <div className="account-summary">
            <div className="account-avatar">{initials}</div>
            <div className="account-meta">
              <strong>{auth.user.full_name}</strong>
              <span>{auth.user.roles.join(', ')}</span>
            </div>
          </div>
          <button className="logout-button" onClick={onLogout}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></svg>
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <button className="menu-button" ref={menuButtonRef} type="button" aria-label="Open navigation" aria-controls={drawerId} aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
            <span />
            <span />
            <span />
          </button>
          <div>
            <span className="workspace-kicker">Operations Portal</span>
            <strong>{currentNavItem?.label ?? 'Data Centre Onboarding'}</strong>
          </div>
          <div className="header-account">
            <div className="account-avatar">{initials}</div>
            <div>
              <strong>{auth.user.full_name}</strong>
              <span>{auth.user.roles.join(', ')}</span>
            </div>
            <button className="header-signout" type="button" onClick={onLogout} aria-label="Sign out">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></svg>
              <span>Sign out</span>
            </button>
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
