import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2,
  Boxes,
  Users,
  AppWindow,
  CopyPlus,
  Upload,
  Plus,
  ArrowUpRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listProjects } from '../api/projects';
import { listUsers } from '../api/users';
import { listApps } from '../api/apps';
import { GlassCard, PageHeader, Spinner } from '../components/ui';

export default function Dashboard() {
  const { orgs, activeOrgId } = useAuth();
  const activeOrg = orgs.find((o) => o.id === activeOrgId);

  const projectsQ = useQuery({
    queryKey: ['projects', activeOrgId],
    queryFn: () => listProjects(),
    enabled: !!activeOrgId,
  });

  const usersQ = useQuery({
    queryKey: ['users', activeOrgId, 'count'],
    queryFn: () => listUsers({ orgId: activeOrgId ?? undefined, limit: 1 }),
    enabled: !!activeOrgId,
  });

  const appsQ = useQuery({
    queryKey: ['apps-count', activeOrgId, projectsQ.data?.map((p) => p.id)],
    enabled: !!projectsQ.data,
    queryFn: async () => {
      const lists = await Promise.all(
        (projectsQ.data ?? []).map((p) => listApps(p.id).catch(() => [])),
      );
      return lists.reduce((sum, l) => sum + l.length, 0);
    },
  });

  const stats = [
    {
      label: 'Organizations',
      value: orgs.length,
      icon: Building2,
      to: '/organizations',
      tone: 'from-violet-500/30',
    },
    {
      label: 'Projects',
      value: projectsQ.isLoading ? '…' : (projectsQ.data?.length ?? 0),
      icon: Boxes,
      to: '/projects',
      tone: 'from-cyan-500/30',
    },
    {
      label: 'Users',
      value: usersQ.isLoading ? '…' : (usersQ.data?.total ?? 0),
      icon: Users,
      to: '/users',
      tone: 'from-emerald-500/30',
    },
    {
      label: 'Applications',
      value: appsQ.isLoading ? '…' : (appsQ.data ?? 0),
      icon: AppWindow,
      to: '/applications',
      tone: 'from-pink-500/30',
    },
  ];

  const actions = [
    { label: 'New Organization', to: '/organizations', icon: Plus },
    { label: 'New Project', to: '/projects', icon: Boxes },
    { label: 'Duplicate Organization', to: '/duplicate', icon: CopyPlus },
    { label: 'Bulk Import Users', to: '/bulk-users', icon: Upload },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome back`}
        subtitle={
          activeOrg
            ? `Managing “${activeOrg.name}” • ${activeOrg.primaryDomain ?? activeOrg.id}`
            : 'Select an organization to get started.'
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to}>
            <div className="glass group relative overflow-hidden p-5 transition hover:-translate-y-0.5">
              <div
                className={`absolute -right-6 -top-6 size-24 rounded-full bg-gradient-to-br ${s.tone} to-transparent blur-2xl`}
              />
              <div className="relative flex items-center justify-between">
                <s.icon className="size-5 text-[var(--color-ink-dim)]" />
                <ArrowUpRight className="size-4 text-[var(--color-ink-dim)] opacity-0 transition group-hover:opacity-100" />
              </div>
              <p className="relative mt-4 text-3xl font-semibold tracking-tight text-white">
                {s.value}
              </p>
              <p className="relative mt-1 text-xs text-[var(--color-ink-dim)]">{s.label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-white">Quick actions</h3>
          <p className="mb-4 text-xs text-[var(--color-ink-dim)]">Jump straight into a common task.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {actions.map((a) => (
              <Link
                key={a.label}
                to={a.to}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/4 px-4 py-3 transition hover:border-white/20 hover:bg-white/8"
              >
                <div className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-accent)]/40 to-[var(--color-accent-2)]/30">
                  <a.icon className="size-4 text-white" />
                </div>
                <span className="text-sm font-medium text-white">{a.label}</span>
              </Link>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="text-sm font-semibold text-white">Connection</h3>
          <p className="mb-4 text-xs text-[var(--color-ink-dim)]">Live ZITADEL v2 API session.</p>
          {!activeOrgId ? (
            <Spinner />
          ) : (
            <dl className="space-y-3 text-sm">
              <Row label="Active org" value={activeOrg?.name ?? '—'} />
              <Row label="Org ID" value={activeOrgId} mono />
              <Row label="Primary domain" value={activeOrg?.primaryDomain ?? '—'} />
              <Row label="Total orgs" value={String(orgs.length)} />
            </dl>
          )}
        </GlassCard>
      </div>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0">
      <dt className="text-xs text-[var(--color-ink-dim)]">{label}</dt>
      <dd className={`max-w-[60%] truncate text-right text-white ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
