import { useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
// org-header threading removed: project/app/role calls run in the token's own org
import {
  ArrowLeft,
  Boxes,
  Plus,
  Trash2,
  Pencil,
  KeyRound,
  AppWindow,
  ShieldCheck,
  Copy,
  Tag,
  Upload,
  Download,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  CircleDashed,
} from 'lucide-react';
import { deleteRole, listRoles, createRole, updateRole } from '../api/projects';
import {
  generateRolesTemplate,
  parseRoleLines,
  parseRolesXlsx,
  type ParsedRoleRow,
} from '../lib/xlsxUtils';
import type { ProjectRole } from '../api/types';
import {
  createAPIApp,
  createOIDCApp,
  deleteApp,
  getApp,
  listApps,
  updateAppName,
  updateOIDCApp,
  updateAPIApp,
} from '../api/apps';
import type { CreateOIDCAppResult, CreateAPIAppResult } from '../api/apps';
import type { Application } from '../api/types';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';
import { Modal } from '../components/Modal';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  cn,
} from '../components/ui';

type Tab = 'apps' | 'roles';

// ---- Enum → human label maps (shared by cards + edit modal) ----------------

const OIDC_APP_TYPE_LABELS: Record<string, string> = {
  OIDC_APP_TYPE_WEB: 'Web',
  OIDC_APP_TYPE_USER_AGENT: 'Single-page (SPA)',
  OIDC_APP_TYPE_NATIVE: 'Native',
};
const OIDC_AUTH_METHOD_LABELS: Record<string, string> = {
  OIDC_AUTH_METHOD_TYPE_BASIC: 'Basic',
  OIDC_AUTH_METHOD_TYPE_POST: 'POST',
  OIDC_AUTH_METHOD_TYPE_NONE: 'None (PKCE)',
  OIDC_AUTH_METHOD_TYPE_PRIVATE_KEY_JWT: 'Private Key JWT',
};
const API_AUTH_METHOD_LABELS: Record<string, string> = {
  API_AUTH_METHOD_TYPE_BASIC: 'Basic',
  API_AUTH_METHOD_TYPE_PRIVATE_KEY_JWT: 'Private Key JWT',
  API_AUTH_METHOD_TYPE_NONE: 'None',
};
const GRANT_TYPE_LABELS: Record<string, string> = {
  OIDC_GRANT_TYPE_AUTHORIZATION_CODE: 'Auth Code',
  OIDC_GRANT_TYPE_IMPLICIT: 'Implicit',
  OIDC_GRANT_TYPE_REFRESH_TOKEN: 'Refresh',
  OIDC_GRANT_TYPE_DEVICE_CODE: 'Device Code',
};

export default function ProjectDetail() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { name?: string; projectRoleCheck?: boolean } | null;
  const [tab, setTab] = useState<Tab>('apps');

  return (
    <>
      <button
        onClick={() => navigate('/projects')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-dim)] transition hover:text-white"
      >
        <ArrowLeft className="size-4" /> Projects
      </button>

      <PageHeader
        title={navState?.name ?? 'Project'}
        subtitle={projectId}
        icon={<Boxes className="size-5" />}
        actions={
          navState?.projectRoleCheck ? (
            <Badge tone="accent">
              <ShieldCheck className="size-3" /> Role check on
            </Badge>
          ) : undefined
        }
      />

      <div className="mb-5 flex gap-1 rounded-xl border border-white/10 bg-white/4 p-1">
        {(['apps', 'roles'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition',
              tab === t
                ? 'bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                : 'text-[var(--color-ink-dim)] hover:text-white',
            )}
          >
            {t === 'apps' ? 'Applications' : 'Roles'}
          </button>
        ))}
      </div>

      {tab === 'apps' ? <AppsTab projectId={projectId} /> : <RolesTab projectId={projectId} />}
    </>
  );
}

// ---- Applications ----------------------------------------------------------

function AppsTab({ projectId }: { projectId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editApp, setEditApp] = useState<Application | null>(null);
  const [credentials, setCredentials] = useState<
    (CreateOIDCAppResult | CreateAPIAppResult) & { name: string }
  >();

  const appsQ = useQuery({
    queryKey: ['apps', projectId],
    queryFn: () => listApps(projectId),
  });

  const deleteM = useMutation({
    mutationFn: (appId: string) => deleteApp(projectId, appId),
    onSuccess: () => {
      toast.success('Application deleted');
      qc.invalidateQueries({ queryKey: ['apps', projectId] });
    },
    onError: (e: Error) => toast.error('Could not delete application', e.message),
  });

  async function onDelete(appId: string, name: string) {
    const ok = await confirm({
      title: 'Delete application',
      message: (
        <>
          Delete <strong className="text-white">{name}</strong>? Clients using its credentials will
          stop working.
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteM.mutate(appId);
  }

  const apps = appsQ.data ?? [];

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          New Application
        </Button>
      </div>

      {appsQ.isLoading ? (
        <Spinner />
      ) : appsQ.isError ? (
        <ErrorBox error={appsQ.error} />
      ) : apps.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon={<AppWindow className="size-6" />}
            title="No applications"
            description="Register an OIDC or API application to let clients authenticate."
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                New Application
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {apps.map((a) => (
            <AppCard
              key={a.id}
              app={a}
              onEdit={() => setEditApp(a)}
              onDelete={() => onDelete(a.id, a.name)}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateAppModal
          projectId={projectId}
          onClose={() => setCreating(false)}
          onCreated={(res, name) => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['apps', projectId] });
            if (res.clientSecret) setCredentials({ ...res, name });
            else toast.success('Application created', name);
          }}
        />
      )}

      {editApp && (
        <EditAppModal
          projectId={projectId}
          app={editApp}
          onClose={() => setEditApp(null)}
          onSaved={() => {
            setEditApp(null);
            qc.invalidateQueries({ queryKey: ['apps', projectId] });
          }}
        />
      )}

      <Modal
        open={!!credentials}
        onClose={() => setCredentials(undefined)}
        title="Client credentials"
        description="Copy these now — the secret is shown only once."
        footer={<Button onClick={() => setCredentials(undefined)}>Done</Button>}
      >
        {credentials && (
          <div className="space-y-3">
            <CopyRow label="Client ID" value={credentials.clientId ?? ''} />
            <CopyRow label="Client Secret" value={credentials.clientSecret ?? ''} secret />
          </div>
        )}
      </Modal>
    </>
  );
}

// ---- Application card -------------------------------------------------------

function AppCard({
  app,
  onEdit,
  onDelete,
}: {
  app: Application;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  const o = app.oidc;
  const redirects = o?.redirectUris ?? app.redirectUris ?? [];
  const authMethod =
    app.type === 'OIDC'
      ? OIDC_AUTH_METHOD_LABELS[o?.authMethodType ?? '']
      : app.type === 'API'
        ? API_AUTH_METHOD_LABELS[app.api?.authMethodType ?? '']
        : undefined;

  return (
    <div className="glass group flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-pink-500/30 to-violet-500/20">
          <AppWindow className="size-4 text-white" />
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone="accent">{app.type}</Badge>
          {o && <Badge>{OIDC_APP_TYPE_LABELS[o.appType] ?? o.appType}</Badge>}
          <button
            onClick={onEdit}
            title="Edit application"
            className="rounded-lg p-1.5 text-[var(--color-ink-dim)] opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={onDelete}
            title="Delete application"
            className="rounded-lg p-1.5 text-[var(--color-ink-dim)] opacity-0 transition hover:bg-rose-500/10 hover:text-rose-300 group-hover:opacity-100"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <h3 className="mt-3 truncate font-medium text-white">{app.name}</h3>

      {app.clientId && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(app.clientId!);
            toast.success('Client ID copied');
          }}
          title="Copy client ID"
          className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-[var(--color-ink-dim)] transition hover:text-white"
        >
          <span className="truncate">{app.clientId}</span>
          <Copy className="size-3 shrink-0 opacity-0 transition group-hover:opacity-100" />
        </button>
      )}

      {(authMethod || (o && o.grantTypes.length > 0)) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {authMethod && <Badge>{authMethod}</Badge>}
          {o?.grantTypes.map((g) => (
            <Badge key={g}>{GRANT_TYPE_LABELS[g] ?? g}</Badge>
          ))}
          {o?.devMode && <Badge tone="warn">Dev mode</Badge>}
        </div>
      )}

      {redirects.length > 0 && (
        <div className="mt-3 border-t border-white/8 pt-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]/70">
            Redirect URIs
          </p>
          <ul className="space-y-0.5">
            {redirects.slice(0, 3).map((u) => (
              <li key={u} className="truncate font-mono text-[11px] text-[var(--color-ink-dim)]">
                {u}
              </li>
            ))}
            {redirects.length > 3 && (
              <li className="text-[11px] text-[var(--color-ink-dim)]/70">
                +{redirects.length - 3} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- Edit app modal ---------------------------------------------------------

/**
 * Loads the *authoritative* full config from management v1 before editing.
 * The v2 list (`oidcConfiguration`) omits proto3 defaults (appType, devMode,
 * assertions) and uses `allowedOrigins` — so we refetch to populate the form
 * correctly, falling back to the list row if the detail call fails.
 */
function EditAppModal({
  projectId,
  app,
  onClose,
  onSaved,
}: {
  projectId: string;
  app: Application;
  onClose: () => void;
  onSaved: () => void;
}) {
  const detailQ = useQuery({
    queryKey: ['app', projectId, app.id],
    queryFn: () => getApp(projectId, app.id),
  });

  if (detailQ.isLoading) {
    return (
      <Modal open onClose={onClose} title="Edit application" description={app.name} size="lg">
        <Spinner label="Loading configuration…" />
      </Modal>
    );
  }

  return (
    <EditAppForm
      projectId={projectId}
      app={detailQ.data ?? app}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--color-ink)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
      />
      <span>
        {label}
        {hint && <span className="mt-0.5 block text-[11px] text-[var(--color-ink-dim)]">{hint}</span>}
      </span>
    </label>
  );
}

function EditAppForm({
  projectId,
  app,
  onClose,
  onSaved,
}: {
  projectId: string;
  app: Application;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const o = app.oidc;

  const [name, setName] = useState(app.name);

  // OIDC fields — seeded from the normalized config (handles v1/v2 field names).
  const [redirects, setRedirects] = useState((o?.redirectUris ?? []).join('\n'));
  const [postLogoutRedirects, setPostLogoutRedirects] = useState(
    (o?.postLogoutRedirectUris ?? []).join('\n'),
  );
  const [corsOrigins, setCorsOrigins] = useState((o?.additionalOrigins ?? []).join('\n'));
  const [appType, setAppType] = useState(o?.appType ?? 'OIDC_APP_TYPE_WEB');
  const [authMethod, setAuthMethod] = useState(o?.authMethodType ?? 'OIDC_AUTH_METHOD_TYPE_BASIC');
  const [grantTypes, setGrantTypes] = useState<string[]>(
    o?.grantTypes ?? ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'],
  );
  // responseTypes aren't edited here; preserve whatever the server has.
  const responseTypes: string[] = o?.responseTypes ?? ['OIDC_RESPONSE_TYPE_CODE'];
  const [devMode, setDevMode] = useState(o?.devMode ?? false);
  const [accessTokenType, setAccessTokenType] = useState(
    o?.accessTokenType ?? 'OIDC_TOKEN_TYPE_BEARER',
  );
  const [accessTokenRoleAssertion, setAccessTokenRoleAssertion] = useState(
    o?.accessTokenRoleAssertion ?? false,
  );
  const [idTokenRoleAssertion, setIdTokenRoleAssertion] = useState(o?.idTokenRoleAssertion ?? false);
  const [idTokenUserinfoAssertion, setIdTokenUserinfoAssertion] = useState(
    o?.idTokenUserinfoAssertion ?? false,
  );

  // API fields
  const [apiAuthMethod, setApiAuthMethod] = useState(
    app.api?.authMethodType ?? 'API_AUTH_METHOD_TYPE_BASIC',
  );

  function splitLines(s: string): string[] {
    return s.split(/[\n,]/).map((l) => l.trim()).filter(Boolean);
  }

  function toggleInArray(arr: string[], val: string, checked: boolean): string[] {
    return checked ? [...arr.filter((x) => x !== val), val] : arr.filter((x) => x !== val);
  }

  const saveM = useMutation({
    mutationFn: async () => {
      const nameChanged = name.trim() !== app.name;
      const tasks: Promise<unknown>[] = [];

      if (nameChanged) tasks.push(updateAppName(projectId, app.id, name.trim()));

      if (app.type === 'OIDC') {
        tasks.push(
          updateOIDCApp(projectId, app.id, {
            redirectUris: splitLines(redirects),
            postLogoutRedirectUris: splitLines(postLogoutRedirects),
            additionalOrigins: splitLines(corsOrigins),
            appType,
            authMethodType: authMethod,
            grantTypes,
            responseTypes,
            devMode,
            accessTokenType,
            accessTokenRoleAssertion,
            idTokenRoleAssertion,
            idTokenUserinfoAssertion,
            clockSkew: o?.clockSkew,
          }),
        );
      } else if (app.type === 'API') {
        tasks.push(updateAPIApp(projectId, app.id, apiAuthMethod));
      }

      await Promise.all(tasks);
    },
    onSuccess: () => {
      toast.success('Application updated');
      onSaved();
    },
    onError: (e: Error) => toast.error('Could not update application', e.message),
  });

  const clientId = app.clientId;

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit application"
      description={`${app.type} application`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saveM.isPending} disabled={!name.trim()} onClick={() => saveM.mutate()}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Identity summary */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <Badge tone="accent">{app.type}</Badge>
          {o && <Badge>{OIDC_APP_TYPE_LABELS[appType] ?? appType}</Badge>}
          {clientId && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(clientId);
                toast.success('Client ID copied');
              }}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 font-mono text-[11px] text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-white"
              title="Copy client ID"
            >
              {clientId}
              <Copy className="size-3" />
            </button>
          )}
        </div>

        <Field label="Application name" required>
          <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>

        {app.type === 'OIDC' && (
          <>
            <Section title="Type & authentication">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Application type">
                  <Select value={appType} onChange={(e) => setAppType(e.target.value)}>
                    <option value="OIDC_APP_TYPE_WEB">Web</option>
                    <option value="OIDC_APP_TYPE_USER_AGENT">Single-page (SPA)</option>
                    <option value="OIDC_APP_TYPE_NATIVE">Native</option>
                  </Select>
                </Field>
                <Field label="Auth method">
                  <Select value={authMethod} onChange={(e) => setAuthMethod(e.target.value)}>
                    <option value="OIDC_AUTH_METHOD_TYPE_BASIC">Basic</option>
                    <option value="OIDC_AUTH_METHOD_TYPE_POST">POST</option>
                    <option value="OIDC_AUTH_METHOD_TYPE_NONE">None (PKCE)</option>
                    <option value="OIDC_AUTH_METHOD_TYPE_PRIVATE_KEY_JWT">Private Key JWT</option>
                  </Select>
                </Field>
              </div>
            </Section>

            <Section title="URLs">
              <Field label="Redirect URIs" hint="One per line or comma-separated.">
                <textarea
                  value={redirects}
                  onChange={(e) => setRedirects(e.target.value)}
                  placeholder="https://app.example.com/callback"
                  rows={3}
                  className="glass-input w-full px-3.5 py-2.5 text-sm font-mono"
                />
              </Field>
              <Field label="Post-logout redirect URIs" hint="One per line or comma-separated.">
                <textarea
                  value={postLogoutRedirects}
                  onChange={(e) => setPostLogoutRedirects(e.target.value)}
                  placeholder="https://app.example.com/logout"
                  rows={2}
                  className="glass-input w-full px-3.5 py-2.5 text-sm font-mono"
                />
              </Field>
              <Field
                label="Allowed CORS origins"
                hint="Origins permitted to call your OIDC endpoints. One per line."
              >
                <textarea
                  value={corsOrigins}
                  onChange={(e) => setCorsOrigins(e.target.value)}
                  placeholder="https://app.example.com"
                  rows={2}
                  className="glass-input w-full px-3.5 py-2.5 text-sm font-mono"
                />
              </Field>
            </Section>

            <Section title="Tokens & grants">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Access token type">
                  <Select
                    value={accessTokenType}
                    onChange={(e) => setAccessTokenType(e.target.value)}
                  >
                    <option value="OIDC_TOKEN_TYPE_BEARER">Bearer (opaque)</option>
                    <option value="OIDC_TOKEN_TYPE_JWT">JWT</option>
                  </Select>
                </Field>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--color-ink-dim)]">Grant types</span>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    {Object.entries(GRANT_TYPE_LABELS).map(([val, label]) => (
                      <label
                        key={val}
                        className="flex cursor-pointer items-center gap-2 text-xs text-[var(--color-ink)]"
                      >
                        <input
                          type="checkbox"
                          checked={grantTypes.includes(val)}
                          onChange={(e) =>
                            setGrantTypes(toggleInArray(grantTypes, val, e.target.checked))
                          }
                          className="accent-[var(--color-accent)]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Claims & assertions">
              <Toggle
                checked={accessTokenRoleAssertion}
                onChange={setAccessTokenRoleAssertion}
                label="Add user roles to the access token"
              />
              <Toggle
                checked={idTokenRoleAssertion}
                onChange={setIdTokenRoleAssertion}
                label="Add user roles to the ID token"
              />
              <Toggle
                checked={idTokenUserinfoAssertion}
                onChange={setIdTokenUserinfoAssertion}
                label="Return user info inside the ID token"
              />
              <Toggle
                checked={devMode}
                onChange={setDevMode}
                label="Development mode"
                hint="Skips redirect URI validation; allows http/localhost."
              />
            </Section>
          </>
        )}

        {app.type === 'API' && (
          <Section title="Authentication">
            <Field label="Auth method">
              <Select value={apiAuthMethod} onChange={(e) => setApiAuthMethod(e.target.value)}>
                <option value="API_AUTH_METHOD_TYPE_BASIC">Basic</option>
                <option value="API_AUTH_METHOD_TYPE_PRIVATE_KEY_JWT">Private Key JWT</option>
                <option value="API_AUTH_METHOD_TYPE_NONE">None</option>
              </Select>
            </Field>
          </Section>
        )}
      </div>
    </Modal>
  );
}

function CreateAppModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: (res: CreateOIDCAppResult | CreateAPIAppResult, name: string) => void;
}) {
  const toast = useToast();
  const [type, setType] = useState<'OIDC' | 'API'>('OIDC');
  const [name, setName] = useState('');
  const [appType, setAppType] = useState('OIDC_APP_TYPE_WEB');
  const [authMethod, setAuthMethod] = useState('OIDC_AUTH_METHOD_TYPE_BASIC');
  const [redirects, setRedirects] = useState('');
  const [devMode, setDevMode] = useState(false);

  const createM = useMutation({
    mutationFn: async () => {
      if (type === 'OIDC') {
        return createOIDCApp(
          projectId,
          {
            name: name.trim(),
            redirectUris: redirects
              .split(/[\n,]/)
              .map((s) => s.trim())
              .filter(Boolean),
            appType,
            authMethodType: authMethod,
            devMode,
          },
        );
      }
      return createAPIApp(projectId, { name: name.trim() });
    },
    onSuccess: (res) => onCreated(res, name.trim()),
    onError: (e: Error) => toast.error('Could not create application', e.message),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Register application"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={createM.isPending} disabled={!name.trim()} onClick={() => createM.mutate()}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setType('OIDC')}
            className={cn(
              'rounded-xl border p-3 text-left transition',
              type === 'OIDC'
                ? 'border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10'
                : 'border-white/10 bg-white/4 hover:bg-white/8',
            )}
          >
            <p className="text-sm font-medium text-white">OIDC / OAuth</p>
            <p className="text-[11px] text-[var(--color-ink-dim)]">Web, SPA or native login</p>
          </button>
          <button
            onClick={() => setType('API')}
            className={cn(
              'rounded-xl border p-3 text-left transition',
              type === 'API'
                ? 'border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10'
                : 'border-white/10 bg-white/4 hover:bg-white/8',
            )}
          >
            <p className="text-sm font-medium text-white">API</p>
            <p className="text-[11px] text-[var(--color-ink-dim)]">Machine-to-machine</p>
          </button>
        </div>

        <Field label="Application name" required>
          <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Web App" />
        </Field>

        {type === 'OIDC' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Application type">
                <Select value={appType} onChange={(e) => setAppType(e.target.value)}>
                  <option value="OIDC_APP_TYPE_WEB">Web</option>
                  <option value="OIDC_APP_TYPE_USER_AGENT">Single-page (SPA)</option>
                  <option value="OIDC_APP_TYPE_NATIVE">Native</option>
                </Select>
              </Field>
              <Field label="Auth method">
                <Select value={authMethod} onChange={(e) => setAuthMethod(e.target.value)}>
                  <option value="OIDC_AUTH_METHOD_TYPE_BASIC">Basic</option>
                  <option value="OIDC_AUTH_METHOD_TYPE_POST">POST</option>
                  <option value="OIDC_AUTH_METHOD_TYPE_NONE">None (PKCE)</option>
                  <option value="OIDC_AUTH_METHOD_TYPE_PRIVATE_KEY_JWT">Private Key JWT</option>
                </Select>
              </Field>
            </div>
            <Field label="Redirect URIs" hint="One per line or comma-separated.">
              <textarea
                value={redirects}
                onChange={(e) => setRedirects(e.target.value)}
                placeholder="https://app.example.com/callback"
                rows={3}
                className="glass-input w-full px-3.5 py-2.5 text-sm"
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={devMode}
                onChange={(e) => setDevMode(e.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Development mode (skip redirect URI validation)
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const toast = useToast();
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <code className="glass-input flex-1 overflow-x-auto whitespace-nowrap px-3 py-2.5 font-mono text-xs">
          {value}
        </code>
        <Button
          size="sm"
          variant="ghost"
          icon={<Copy className="size-3.5" />}
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
          }}
        >
          Copy
        </Button>
      </div>
      {secret && (
        <p className="mt-1 text-[11px] text-amber-300/80">⚠ Store this securely; it won't be shown again.</p>
      )}
    </Field>
  );
}

// ---- Roles -----------------------------------------------------------------

function RolesTab({ projectId }: { projectId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [form, setForm] = useState({ roleKey: '', displayName: '', group: '' });
  const [editTarget, setEditTarget] = useState<ProjectRole | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', group: '' });

  const rolesQ = useQuery({
    queryKey: ['roles', projectId],
    queryFn: () => listRoles(projectId),
  });

  const createM = useMutation({
    mutationFn: () => createRole(projectId, form),
    onSuccess: () => {
      toast.success('Role added', form.roleKey);
      setCreating(false);
      setForm({ roleKey: '', displayName: '', group: '' });
      qc.invalidateQueries({ queryKey: ['roles', projectId] });
    },
    onError: (e: Error) => toast.error('Could not add role', e.message),
  });

  const updateM = useMutation({
    mutationFn: () => updateRole(projectId, editTarget!.key, editForm),
    onSuccess: () => {
      toast.success('Role updated', editTarget!.key);
      setEditTarget(null);
      qc.invalidateQueries({ queryKey: ['roles', projectId] });
    },
    onError: (e: Error) => toast.error('Could not update role', e.message),
  });

  const deleteM = useMutation({
    mutationFn: (key: string) => deleteRole(projectId, key),
    onSuccess: () => {
      toast.success('Role removed');
      qc.invalidateQueries({ queryKey: ['roles', projectId] });
    },
    onError: (e: Error) => toast.error('Could not remove role', e.message),
  });

  async function onDelete(key: string) {
    const ok = await confirm({
      title: 'Remove role',
      message: (
        <>
          Remove role <strong className="text-white">{key}</strong> from this project?
        </>
      ),
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) deleteM.mutate(key);
  }

  const roles = rolesQ.data ?? [];

  return (
    <>
      <div className="mb-3 flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<Upload className="size-4" />}
          onClick={() => setBulkOpen(true)}
        >
          Bulk add
        </Button>
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          Add Role
        </Button>
      </div>

      {rolesQ.isLoading ? (
        <Spinner />
      ) : rolesQ.isError ? (
        <ErrorBox error={rolesQ.error} />
      ) : roles.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon={<KeyRound className="size-6" />}
            title="No roles"
            description="Roles describe what users can do within this project."
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                Add Role
              </Button>
            }
          />
        </div>
      ) : (
        <div className="glass divide-y divide-white/8 p-0">
          {roles.map((r) => (
            <div key={r.key} className="group flex items-center gap-3 px-4 py-3">
              <Tag className="size-4 text-[var(--color-accent-2)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{r.displayName || r.key}</p>
                <p className="truncate font-mono text-[11px] text-[var(--color-ink-dim)]">{r.key}</p>
              </div>
              {r.group && <Badge>{r.group}</Badge>}
              <button
                onClick={() => {
                  setEditTarget(r);
                  setEditForm({ displayName: r.displayName || '', group: r.group || '' });
                }}
                title="Edit role"
                className="rounded-lg p-2 text-[var(--color-ink-dim)] opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
              >
                <Pencil className="size-4" />
              </button>
              <button
                onClick={() => onDelete(r.key)}
                title="Remove role"
                className="rounded-lg p-2 text-[var(--color-ink-dim)] opacity-0 transition hover:bg-rose-500/10 hover:text-rose-300 group-hover:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Add project role"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              loading={createM.isPending}
              disabled={!form.roleKey.trim()}
              onClick={() => createM.mutate()}
            >
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Role key" required hint="Unique machine name, e.g. admin">
            <Input
              value={form.roleKey}
              autoFocus
              onChange={(e) => setForm((f) => ({ ...f, roleKey: e.target.value }))}
              placeholder="admin"
            />
          </Field>
          <Field label="Display name">
            <Input
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="Administrator"
            />
          </Field>
          <Field label="Group">
            <Input
              value={form.group}
              onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
              placeholder="optional"
            />
          </Field>
        </div>
      </Modal>

      {bulkOpen && (
        <BulkRolesModal
          projectId={projectId}
          existingKeys={roles.map((r) => r.key)}
          onClose={() => setBulkOpen(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ['roles', projectId] })}
        />
      )}

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit role"
        description={`Key “${editTarget?.key}” cannot be changed`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button loading={updateM.isPending} onClick={() => updateM.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Role key">
            <Input value={editTarget?.key ?? ''} disabled />
          </Field>
          <Field label="Display name">
            <Input
              value={editForm.displayName}
              autoFocus
              onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="Administrator"
            />
          </Field>
          <Field label="Group">
            <Input
              value={editForm.group}
              onChange={(e) => setEditForm((f) => ({ ...f, group: e.target.value }))}
              placeholder="optional"
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

// ---- Bulk add roles --------------------------------------------------------

type BulkRowStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

interface BulkRoleRow extends ParsedRoleRow {
  status: BulkRowStatus;
  message?: string;
}

function BulkRolesModal({
  projectId,
  existingKeys,
  onClose,
  onDone,
}: {
  projectId: string;
  existingKeys: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<BulkRoleRow[]>([]);
  const [running, setRunning] = useState(false);

  const existing = new Set(existingKeys.map((k) => k.toLowerCase()));

  /** Turn parsed rows into preview state, flagging duplicates within the batch or project. */
  function buildRows(parsed: ParsedRoleRow[]): BulkRoleRow[] {
    const seen = new Set<string>();
    return parsed.map((p) => {
      const lc = p.roleKey.toLowerCase();
      let status: BulkRowStatus = 'pending';
      let message: string | undefined;
      if (existing.has(lc)) {
        status = 'skipped';
        message = 'Already exists';
      } else if (seen.has(lc)) {
        status = 'skipped';
        message = 'Duplicate in file';
      }
      seen.add(lc);
      return { ...p, status, message };
    });
  }

  function loadFromText(value: string) {
    setText(value);
    setFileName('');
    setRows(value.trim() ? buildRows(parseRoleLines(value)) : []);
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseRolesXlsx(reader.result as ArrayBuffer);
        setFileName(file.name);
        setText('');
        setRows(buildRows(parsed));
        if (parsed.length === 0) toast.error('No roles found', 'Check the file has a roleKey column.');
      } catch (err) {
        toast.error('Could not read file', (err as Error).message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function downloadTemplate() {
    const blob = generateRolesTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project-roles-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function run() {
    setRunning(true);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.status === 'done' || r.status === 'skipped') continue;
      setRows((prev) => prev.map((x, j) => (j === i ? { ...x, status: 'running' } : x)));
      try {
        await createRole(projectId, {
          roleKey: r.roleKey,
          displayName: r.displayName,
          group: r.group,
        });
        setRows((prev) =>
          prev.map((x, j) => (j === i ? { ...x, status: 'done', message: undefined } : x)),
        );
      } catch (err) {
        setRows((prev) =>
          prev.map((x, j) => (j === i ? { ...x, status: 'error', message: (err as Error).message } : x)),
        );
      }
    }
    setRunning(false);
    onDone();
    toast.success('Bulk add finished', 'See per-row status below.');
  }

  const toAdd = rows.filter((r) => r.status !== 'skipped').length;
  const done = rows.filter((r) => r.status === 'done').length;
  const failed = rows.filter((r) => r.status === 'error').length;
  const canRun = toAdd > 0 && !running;

  return (
    <Modal
      open
      onClose={onClose}
      title="Bulk add roles"
      description="Paste roles or upload an XLSX/CSV. Existing keys are skipped."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Close
          </Button>
          <Button
            loading={running}
            disabled={!canRun}
            icon={running ? undefined : <Plus className="size-4" />}
            onClick={run}
          >
            {running ? 'Adding…' : `Add ${toAdd} role${toAdd === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={<FileText className="size-4" />}
            onClick={() => fileRef.current?.click()}
            disabled={running}
          >
            Upload file
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Download className="size-4" />}
            onClick={downloadTemplate}
          >
            Template
          </Button>
          {fileName && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-dim)]">
              <FileText className="size-3.5" /> {fileName}
            </span>
          )}
        </div>

        <Field
          label="Paste roles"
          hint="One per line: roleKey, displayName, group (comma or tab separated). Only roleKey is required."
        >
          <textarea
            value={text}
            onChange={(e) => loadFromText(e.target.value)}
            placeholder={'admin, Administrator, management\neditor, Editor\nviewer'}
            rows={5}
            disabled={running}
            className="glass-input w-full px-3.5 py-2.5 text-sm font-mono"
          />
        </Field>

        {rows.length > 0 && (
          <div className="glass overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[11px] uppercase tracking-wide text-[var(--color-ink-dim)]">
              <span>
                {rows.length} parsed · {toAdd} to add · {done} added · {failed} failed
              </span>
            </div>
            <div className="max-h-[40vh] divide-y divide-white/8 overflow-y-auto">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1.2fr_1.4fr_1fr_1.4fr] items-center gap-3 px-4 py-2 text-sm"
                >
                  <span className="truncate font-mono text-white">{r.roleKey}</span>
                  <span className="truncate text-[var(--color-ink-dim)]">{r.displayName || '—'}</span>
                  <span className="truncate text-[var(--color-ink-dim)]">{r.group || '—'}</span>
                  <BulkRoleStatus status={r.status} message={r.message} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </Modal>
  );
}

function BulkRoleStatus({ status, message }: { status: BulkRowStatus; message?: string }) {
  if (status === 'done')
    return (
      <Badge tone="good">
        <CheckCircle2 className="size-3" /> Added
      </Badge>
    );
  if (status === 'running')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent-2)]">
        <Loader2 className="size-3.5 animate-spin" /> Adding…
      </span>
    );
  if (status === 'error')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-rose-300" title={message}>
        <XCircle className="size-3.5 shrink-0" />
        <span className="truncate">{message ?? 'Failed'}</span>
      </span>
    );
  if (status === 'skipped')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-300/80" title={message}>
        <CircleDashed className="size-3.5 shrink-0" /> {message ?? 'Skipped'}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-dim)]">
      <CircleDashed className="size-3.5" /> Pending
    </span>
  );
}
