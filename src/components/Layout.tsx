import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Building2,
  Boxes,
  AppWindow,
  Users,
  Upload,
  CopyPlus,
  LayoutDashboard,
  LogOut,
  Check,
  ChevronDown,
  Menu,
  X,
  Activity,
  ArrowLeftRight,
  ShieldCheck,
  Github,
  Terminal,
  FileJson2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDevHints } from '../context/DevHintsContext';
import { cn } from './ui';
import { TokenViewerModal } from './TokenViewerModal';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/organizations', label: 'Organizations', icon: Building2 },
  { to: '/projects', label: 'Projects', icon: Boxes },
  { to: '/applications', label: 'Applications', icon: AppWindow },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/bulk-users', label: 'Bulk Import', icon: Upload },
  { to: '/duplicate', label: 'Duplicate Org', icon: CopyPlus },
  { to: '/transfer', label: 'Export / Import', icon: ArrowLeftRight },
  { to: '/identity-providers', label: 'Identity Providers', icon: ShieldCheck },
  { to: '/events', label: 'Event Log', icon: Activity },
];

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen" data-testid="app-shell">
      {/* Sidebar */}
      <aside
        data-testid="app-sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-[260px] shrink-0 p-4 transition-transform md:static md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-[110%]',
        )}
      >
        <div className="glass flex h-full flex-col p-4">
          <Brand />
          <nav className="mt-6 flex flex-1 flex-col gap-1" data-testid="app-sidebar-nav">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-gradient-to-r from-[var(--color-accent)]/30 to-transparent text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                      : 'text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-white',
                  )
                }
              >
                <item.icon className="size-[18px]" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <ConnectionFooter />
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMobileOpen((v) => !v)} mobileOpen={mobileOpen} />
        <main className="flex-1 px-4 pb-10 pt-2 md:px-8" data-testid="app-main">
          <div className="mx-auto w-full max-w-6xl fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-1" data-testid="app-brand">
      <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] shadow-lg">
        <svg viewBox="0 0 32 32" className="size-6">
          <path d="M9 22 L16 8 L23 22 Z" fill="white" fillOpacity="0.95" />
        </svg>
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-wide text-white">ZITADEL</p>
        <p className="text-[11px] text-[var(--color-ink-dim)]">Admin Console</p>
      </div>
      <a
        data-testid="app-github-link"
        href="https://github.com/paznoiro/zitadel-admin-console"
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto text-[var(--color-ink-dim)] transition hover:text-white"
        title="View on GitHub"
      >
        <Github className="size-5" />
      </a>
    </div>
  );
}

function ConnectionFooter() {
  const { session, disconnect } = useAuth();
  const [tokenViewerOpen, setTokenViewerOpen] = useState(false);
  return (
    <div className="mt-4 border-t border-white/10 pt-3" data-testid="connection-footer">
      <div className="mb-2 px-1">
        <p className="truncate text-[11px] font-medium text-[var(--color-ink)]" data-testid="connection-label">
          {session?.label ?? 'Connected'}
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-[10px] text-[var(--color-ink-dim)]">
            {session?.kind === 'oidc' ? 'Single Sign-On (OIDC)' : 'Access token session'}
          </p>
          {session?.kind === 'oidc' && (
            <button
              type="button"
              data-testid="connection-view-token-response"
              onClick={() => setTokenViewerOpen(true)}
              className="grid size-7 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 transition hover:bg-cyan-300/20 hover:text-white"
              title="View OIDC token response"
            >
              <FileJson2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <button
        data-testid="connection-disconnect"
        onClick={disconnect}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[var(--color-ink-dim)] transition hover:bg-rose-500/10 hover:text-rose-300"
      >
        <LogOut className="size-4" />
        Disconnect
      </button>
      {session?.kind === 'oidc' && (
        <TokenViewerModal
          open={tokenViewerOpen}
          onClose={() => setTokenViewerOpen(false)}
          session={session}
        />
      )}
    </div>
  );
}

function TopBar({ onMenu, mobileOpen }: { onMenu: () => void; mobileOpen: boolean }) {
  const { showHints, toggle } = useDevHints();
  return (
    <header className="sticky top-0 z-20 px-4 py-3 md:px-8" data-testid="app-topbar">
      <div className="glass-soft glass flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
        <button
          data-testid="mobile-menu-toggle"
          onClick={onMenu}
          className="grid size-9 place-items-center rounded-lg text-[var(--color-ink-dim)] hover:bg-white/10 hover:text-white md:hidden"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <div className="hidden text-sm text-[var(--color-ink-dim)] md:block">
          Identity & Access Management
        </div>
        {showHints && (
          <button
            data-testid="api-hints-toggle"
            onClick={toggle}
            title="Ctrl+1 to toggle API hints off"
            className="flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[11px] font-medium text-sky-300 transition hover:bg-sky-400/20"
          >
            <span className="relative flex size-1.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-sky-400" />
            </span>
            <Terminal className="size-3" />
            API hints ON
          </button>
        )}
        <OrgSwitcher />
      </div>
    </header>
  );
}

function OrgSwitcher() {
  const { orgs, activeOrgId, setActiveOrg } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const active = orgs.find((o) => o.id === activeOrgId);

  return (
    <div className="relative" data-testid="org-switcher">
      <button
        data-testid="org-switcher-toggle"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10"
      >
        <Building2 className="size-4 text-[var(--color-accent-2)]" />
        <span className="max-w-[160px] truncate font-medium text-white">
          {active?.name ?? 'Select organization'}
        </span>
        <ChevronDown className="size-4 text-[var(--color-ink-dim)]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" data-testid="org-switcher-backdrop" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 max-h-[60vh] w-72 overflow-y-auto rounded-[var(--radius-glass)] border border-white/12 bg-[#0d1127] p-2 shadow-2xl" data-testid="org-switcher-menu">
            <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-[var(--color-ink-dim)]">
              Active organization
            </p>
            {orgs.length === 0 && (
              <p className="px-2 py-3 text-xs text-[var(--color-ink-dim)]">No organizations found.</p>
            )}
            {orgs.map((o) => (
              <button
                key={o.id}
                data-testid={`org-switcher-option-${o.id}`}
                onClick={() => {
                  setActiveOrg(o.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-white/8"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-white">{o.name}</span>
                  <span className="block truncate text-[11px] text-[var(--color-ink-dim)]">
                    {o.primaryDomain ?? o.id}
                  </span>
                </span>
                {o.id === activeOrgId && <Check className="size-4 text-[var(--color-good)]" />}
              </button>
            ))}
            <button
              data-testid="org-switcher-manage"
              onClick={() => {
                setOpen(false);
                navigate('/organizations');
              }}
              className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[var(--color-accent-2)] transition hover:bg-white/8"
            >
              Manage organizations →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
