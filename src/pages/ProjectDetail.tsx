import { useState } from 'react';
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
} from 'lucide-react';
import { deleteRole, listRoles, createRole, updateRole } from '../api/projects';
import type { ProjectRole } from '../api/types';
import {
  createAPIApp,
  createOIDCApp,
  deleteApp,
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
            <div key={a.id} className="glass group flex flex-col p-4">
              <div className="flex items-start justify-between">
                <div className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-pink-500/30 to-violet-500/20">
                  <AppWindow className="size-4 text-white" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone="accent">{a.type}</Badge>
                  <button
                    onClick={() => setEditApp(a)}
                    title="Edit application"
                    className="rounded-lg p-1.5 text-[var(--color-ink-dim)] opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => onDelete(a.id, a.name)}
                    title="Delete application"
                    className="rounded-lg p-1.5 text-[var(--color-ink-dim)] opacity-0 transition hover:bg-rose-500/10 hover:text-rose-300 group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <h3 className="mt-3 truncate font-medium text-white">{a.name}</h3>
              {a.clientId && (
                <p className="mt-1 truncate font-mono text-[11px] text-[var(--color-ink-dim)]">
                  {a.clientId}
                </p>
              )}
              {a.redirectUris && a.redirectUris.length > 0 && (
                <p className="mt-2 line-clamp-2 text-[11px] text-[var(--color-ink-dim)]">
                  ↳ {a.redirectUris.join(', ')}
                </p>
              )}
            </div>
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

// ---- Edit app modal ---------------------------------------------------------

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
  const toast = useToast();
  const raw = app.raw as Record<string, unknown> | undefined;
  const oidcRaw = raw?.oidcConfig as Record<string, unknown> | undefined;
  const apiRaw = raw?.apiConfig as Record<string, unknown> | undefined;

  const [name, setName] = useState(app.name);

  // OIDC fields
  const [redirects, setRedirects] = useState(
    ((oidcRaw?.redirectUris as string[] | undefined) ?? []).join('\n'),
  );
  const [postLogoutRedirects, setPostLogoutRedirects] = useState(
    ((oidcRaw?.postLogoutRedirectUris as string[] | undefined) ?? []).join('\n'),
  );
  const [corsOrigins, setCorsOrigins] = useState(
    ((oidcRaw?.additionalOrigins as string[] | undefined) ?? []).join('\n'),
  );
  const [appType, setAppType] = useState(
    (oidcRaw?.appType as string | undefined) ?? 'OIDC_APP_TYPE_WEB',
  );
  const [authMethod, setAuthMethod] = useState(
    (oidcRaw?.authMethodType as string | undefined) ?? 'OIDC_AUTH_METHOD_TYPE_BASIC',
  );
  const [grantTypes, setGrantTypes] = useState<string[]>(
    (oidcRaw?.grantTypes as string[] | undefined) ?? ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'],
  );
  // Keep the server's existing responseTypes; derive from raw config.
  const responseTypes: string[] =
    (oidcRaw?.responseTypes as string[] | undefined) ?? ['OIDC_RESPONSE_TYPE_CODE'];
  const [devMode, setDevMode] = useState((oidcRaw?.devMode as boolean | undefined) ?? false);
  const [accessTokenType, setAccessTokenType] = useState(
    (oidcRaw?.accessTokenType as string | undefined) ?? 'OIDC_TOKEN_TYPE_BEARER',
  );
  const [accessTokenRoleAssertion, setAccessTokenRoleAssertion] = useState(
    (oidcRaw?.accessTokenRoleAssertion as boolean | undefined) ?? false,
  );
  const [idTokenRoleAssertion, setIdTokenRoleAssertion] = useState(
    (oidcRaw?.idTokenRoleAssertion as boolean | undefined) ?? false,
  );
  const [idTokenUserinfoAssertion, setIdTokenUserinfoAssertion] = useState(
    (oidcRaw?.idTokenUserinfoAssertion as boolean | undefined) ?? false,
  );

  // API fields
  const [apiAuthMethod, setApiAuthMethod] = useState(
    (apiRaw?.authMethodType as string | undefined) ?? 'API_AUTH_METHOD_TYPE_BASIC',
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

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit application"
      description={`${app.type} · ${app.clientId ?? app.id}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saveM.isPending} disabled={!name.trim()} onClick={() => saveM.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Application name" required>
          <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>

        {app.type === 'OIDC' && (
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

            <Field label="Post-logout redirect URIs" hint="One per line or comma-separated.">
              <textarea
                value={postLogoutRedirects}
                onChange={(e) => setPostLogoutRedirects(e.target.value)}
                placeholder="https://app.example.com/logout"
                rows={2}
                className="glass-input w-full px-3.5 py-2.5 text-sm"
              />
            </Field>

            <Field label="Allowed CORS origins (additionalOrigins)" hint="Origins that may call your OIDC endpoints. One per line.">
              <textarea
                value={corsOrigins}
                onChange={(e) => setCorsOrigins(e.target.value)}
                placeholder="https://app.example.com"
                rows={2}
                className="glass-input w-full px-3.5 py-2.5 text-sm"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Access token type">
                <Select value={accessTokenType} onChange={(e) => setAccessTokenType(e.target.value)}>
                  <option value="OIDC_TOKEN_TYPE_BEARER">Bearer (opaque)</option>
                  <option value="OIDC_TOKEN_TYPE_JWT">JWT</option>
                </Select>
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-[var(--color-ink-dim)]">Grant types</span>
                {[
                  ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE', 'Auth Code'],
                  ['OIDC_GRANT_TYPE_IMPLICIT', 'Implicit'],
                  ['OIDC_GRANT_TYPE_REFRESH_TOKEN', 'Refresh Token'],
                  ['OIDC_GRANT_TYPE_DEVICE_CODE', 'Device Code'],
                ].map(([val, label]) => (
                  <label key={val} className="flex cursor-pointer items-center gap-2 text-xs text-[var(--color-ink)]">
                    <input
                      type="checkbox"
                      checked={grantTypes.includes(val)}
                      onChange={(e) => setGrantTypes(toggleInArray(grantTypes, val, e.target.checked))}
                      className="accent-[var(--color-accent)]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-white/4 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">Assertions</p>
              {[
                [accessTokenRoleAssertion, setAccessTokenRoleAssertion, 'Roles in access token'] as const,
                [idTokenRoleAssertion, setIdTokenRoleAssertion, 'Roles in ID token'] as const,
                [idTokenUserinfoAssertion, setIdTokenUserinfoAssertion, 'User info in ID token'] as const,
              ].map(([val, setter, label]) => (
                <label key={label} className="flex cursor-pointer items-center gap-3 text-sm text-[var(--color-ink)]">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => setter(e.target.checked)}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  {label}
                </label>
              ))}
            </div>

            <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={devMode}
                onChange={(e) => setDevMode(e.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Development mode (skip redirect URI validation, allow http/localhost)
            </label>
          </>
        )}

        {app.type === 'API' && (
          <Field label="Auth method">
            <Select value={apiAuthMethod} onChange={(e) => setApiAuthMethod(e.target.value)}>
              <option value="API_AUTH_METHOD_TYPE_BASIC">Basic</option>
              <option value="API_AUTH_METHOD_TYPE_PRIVATE_KEY_JWT">Private Key JWT</option>
              <option value="API_AUTH_METHOD_TYPE_NONE">None</option>
            </Select>
          </Field>
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
      <div className="mb-3 flex justify-end">
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
