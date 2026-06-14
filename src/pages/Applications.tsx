import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppWindow, ExternalLink, Search } from 'lucide-react';
import { useState } from 'react';
import { listProjects } from '../api/projects';
import { listApps } from '../api/apps';
import type { Application } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { Badge, EmptyState, ErrorBox, Input, PageHeader, Spinner } from '../components/ui';

interface AppRow {
  projectId: string;
  projectName: string;
  app: Application;
}

export default function Applications() {
  const { activeOrgId, orgs } = useAuth();
  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const [search, setSearch] = useState('');

  // Single combined query: fetches projects (filtered by org) then each project's apps.
  // Using a dedicated key ['applications', activeOrgId] avoids colliding with the
  // Projects page's ['projects', activeOrgId, search] cache.
  const dataQ = useQuery<AppRow[]>({
    queryKey: ['applications', activeOrgId],
    queryFn: async () => {
      const projects = await listProjects(undefined, activeOrgId!);
      const nested = await Promise.all(
        projects.map(async (p) => {
          const apps = await listApps(p.id);
          return apps.map((app): AppRow => ({ projectId: p.id, projectName: p.name, app }));
        }),
      );
      return nested.flat();
    },
    enabled: !!activeOrgId,
  });

  const rows = useMemo(() => {
    const all = dataQ.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (r) =>
        r.app.name.toLowerCase().includes(term) ||
        r.projectName.toLowerCase().includes(term) ||
        (r.app.clientId ?? '').toLowerCase().includes(term),
    );
  }, [dataQ.data, search]);

  return (
    <>
      <PageHeader
        title="Applications"
        subtitle={activeOrg ? `Across all projects in "${activeOrg.name}"` : 'Select an organization.'}
        icon={<AppWindow className="size-5" />}
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-dim)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search applications…"
          className="pl-9"
        />
      </div>

      {!activeOrgId ? (
        <div className="glass">
          <EmptyState icon={<AppWindow className="size-6" />} title="No organization selected" />
        </div>
      ) : dataQ.isError ? (
        <ErrorBox error={dataQ.error} />
      ) : dataQ.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon={<AppWindow className="size-6" />}
            title="No applications"
            description="Open a project to register OIDC or API applications."
          />
        </div>
      ) : (
        <div className="glass overflow-hidden p-0">
          <div className="hidden grid-cols-[1.5fr_1fr_1.5fr_auto] gap-4 border-b border-white/10 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-dim)] sm:grid">
            <span>Application</span>
            <span>Project</span>
            <span>Client ID</span>
            <span></span>
          </div>
          <div className="divide-y divide-white/8">
            {rows.map(({ app, projectId, projectName }) => (
              <Link
                key={`${projectId}-${app.id}`}
                to={`/projects/${projectId}`}
                className="grid grid-cols-1 items-center gap-2 px-4 py-3 transition hover:bg-white/4 sm:grid-cols-[1.5fr_1fr_1.5fr_auto] sm:gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-pink-500/30 to-violet-500/20">
                    <AppWindow className="size-4 text-white" />
                  </div>
                  <span className="truncate font-medium text-white">{app.name}</span>
                  <Badge tone="accent">{app.type}</Badge>
                </div>
                <span className="truncate text-sm text-[var(--color-ink-dim)]">{projectName}</span>
                <span className="truncate font-mono text-[11px] text-[var(--color-ink-dim)]">
                  {app.clientId ?? '—'}
                </span>
                <ExternalLink className="hidden size-4 justify-self-end text-[var(--color-ink-dim)] sm:block" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
