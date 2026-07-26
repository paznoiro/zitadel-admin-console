import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  Plus,
  Trash2,
  Pencil,
  Power,
  PowerOff,
  KeyRound,
  Link2,
  FileKey,
} from 'lucide-react';
import {
  listIDPs,
  deleteIDP,
  activateIDP,
  deactivateIDP,
  createOIDCIDP,
  createOAuthIDP,
  createJWTIDP,
  updateOIDCIDP,
  updateOAuthIDP,
  updateJWTIDP,
} from '../api/idps';
import type { IdentityProvider, IDPRawType, IDPOptions } from '../api/idps';
import { useAuth } from '../context/AuthContext';
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

// ---- helpers ----------------------------------------------------------------

// Known v2beta social/preset providers
const V2_PROVIDER_LABELS: Record<string, string> = {
  IDENTITY_PROVIDER_TYPE_GOOGLE: 'Google',
  IDENTITY_PROVIDER_TYPE_GITHUB: 'GitHub',
  IDENTITY_PROVIDER_TYPE_GITLAB: 'GitLab',
  IDENTITY_PROVIDER_TYPE_AZURE_AD: 'Azure AD',
  IDENTITY_PROVIDER_TYPE_APPLE: 'Apple',
};

function idpTypeLabel(t: IDPRawType): string {
  if (V2_PROVIDER_LABELS[t]) return V2_PROVIDER_LABELS[t];
  if (t.includes('OIDC')) return 'OIDC';
  if (t.includes('OAUTH')) return 'OAuth';
  if (t.includes('JWT')) return 'JWT';
  if (t.includes('SAML')) return 'SAML';
  return t.replace('IDENTITY_PROVIDER_TYPE_', '').replace('IDP_TYPE_', '');
}

function idpTypeShort(t: IDPRawType): 'OIDC' | 'OAUTH' | 'JWT' | 'SAML' | 'UNKNOWN' {
  if (t.includes('OIDC')) return 'OIDC';
  if (t.includes('OAUTH')) return 'OAUTH';
  if (t.includes('JWT')) return 'JWT';
  if (t.includes('SAML')) return 'SAML';
  return 'UNKNOWN';
}

/** v2beta IDPs are managed outside the v1 management API — edit/delete not available */
function isV2IDP(t: IDPRawType): boolean {
  return t.startsWith('IDENTITY_PROVIDER_TYPE_');
}

function IDPIcon({ type }: { type: IDPRawType }) {
  const short = idpTypeShort(type);
  const cls = 'size-5 text-white';
  if (short === 'OIDC') return <ShieldCheck className={cls} />;
  if (short === 'OAUTH') return <Link2 className={cls} />;
  if (short === 'JWT') return <FileKey className={cls} />;
  return <KeyRound className={cls} />;
}

function IDPOptionsBadges({ options }: { options?: IDPOptions }) {
  if (!options) return null;
  const flags: { label: string; on: boolean }[] = [
    { label: 'Linking', on: !!options.isLinkingAllowed },
    { label: 'Creation', on: !!options.isCreationAllowed },
    { label: 'Auto-create', on: !!options.isAutoCreation },
    { label: 'Auto-update', on: !!options.isAutoUpdate },
  ];
  const autoLinking = options.autoLinking?.replace('AUTO_LINKING_OPTION_', '').toLowerCase().replace('_', ' ');
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {flags.map(({ label, on }) => (
        <span
          key={label}
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-medium',
            on
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-white/5 text-[var(--color-ink-dim)] line-through',
          )}
        >
          {label}
        </span>
      ))}
      {autoLinking && autoLinking !== 'unspecified' && (
        <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
          link: {autoLinking}
        </span>
      )}
    </div>
  );
}

const PROVIDER_PRESETS = [
  { label: 'Google', issuer: 'https://accounts.google.com', scopes: 'openid profile email' },
  { label: 'Microsoft / Azure AD', issuer: 'https://login.microsoftonline.com/common/v2.0', scopes: 'openid profile email' },
  { label: 'Apple', issuer: 'https://appleid.apple.com', scopes: 'openid email' },
  { label: 'Keycloak', issuer: 'https://<host>/realms/<realm>', scopes: 'openid profile email' },
  { label: 'Okta', issuer: 'https://<domain>.okta.com', scopes: 'openid profile email' },
  { label: 'Auth0', issuer: 'https://<tenant>.auth0.com', scopes: 'openid profile email' },
  { label: 'Custom OIDC', issuer: '', scopes: 'openid profile email' },
];

// ---- page ------------------------------------------------------------------

export default function IdentityProviders() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { activeOrgId } = useAuth();
  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<IdentityProvider | null>(null);

  const idpsQ = useQuery({
    queryKey: ['idps', activeOrgId],
    queryFn: () => listIDPs(activeOrgId ?? undefined),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['idps', activeOrgId] });

  const deleteM = useMutation({
    mutationFn: deleteIDP,
    onSuccess: () => { toast.success('IDP deleted'); invalidate(); },
    onError: (e: Error) => toast.error('Could not delete IDP', e.message),
  });

  const toggleM = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? deactivateIDP(id) : activateIDP(id),
    onSuccess: () => { toast.success('IDP updated'); invalidate(); },
    onError: (e: Error) => toast.error('Could not update IDP', e.message),
  });

  async function onDelete(id: string, name: string) {
    const ok = await confirm({
      title: 'Delete identity provider',
      message: (
        <>
          Delete <strong className="text-white">{name}</strong>? Users who sign in via this provider
          will no longer be able to log in.
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteM.mutate(id);
  }

  const idps = idpsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Identity Providers"
        subtitle="Configure external login providers for this organization."
        icon={<ShieldCheck className="size-5" />}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Add IDP
          </Button>
        }
      />

      {idpsQ.isLoading ? (
        <Spinner />
      ) : idpsQ.isError ? (
        <ErrorBox error={idpsQ.error} />
      ) : idps.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title="No identity providers"
            description="Add an external IDP so users can sign in with Google, Microsoft, OIDC and more."
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                Add IDP
              </Button>
            }
          />
        </div>
      ) : (
        <div className="glass divide-y divide-white/8 p-0">
          {idps.map((idp) => {
            const active = idp.state === 'IDP_STATE_ACTIVE';
            const typeLabel = idpTypeLabel(idp.type);
            const v2 = isV2IDP(idp.type);
            const issuer = idp.oidcConfig?.issuer ?? idp.oauthConfig?.authorizationEndpoint ?? idp.jwtConfig?.issuer ?? '';
            return (
              <div key={idp.id} className="group flex items-center gap-4 px-4 py-3">
                {/* Icon */}
                <div className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-xl',
                  active || v2
                    ? 'bg-gradient-to-br from-violet-500/30 to-indigo-500/20'
                    : 'bg-white/5',
                )}>
                  <IDPIcon type={idp.type} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-white">{idp.name}</p>
                    <Badge tone="accent">{typeLabel}</Badge>
                    {idp.state && (
                      <Badge tone={active ? 'good' : 'warn'}>
                        {active ? 'Active' : 'Inactive'}
                      </Badge>
                    )}
                  </div>
                  {issuer && (
                    <p className="mt-0.5 truncate text-xs text-[var(--color-ink-dim)]" title={issuer}>
                      {issuer}
                    </p>
                  )}
                  {idp.oidcConfig?.clientId && (
                    <p className="truncate font-mono text-[11px] text-[var(--color-ink-dim)]">
                      {idp.oidcConfig.clientId}
                    </p>
                  )}
                  <IDPOptionsBadges options={idp.options} />
                </div>

                {/* Actions — v2beta IDPs are managed outside this console */}
                {!v2 && (
                  <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={() => toggleM.mutate({ id: idp.id, active })}
                      title={active ? 'Deactivate' : 'Activate'}
                      className="rounded-lg p-2 text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-white"
                    >
                      {active ? <PowerOff className="size-4" /> : <Power className="size-4 text-emerald-400" />}
                    </button>
                    <button
                      onClick={() => setEditTarget(idp)}
                      title="Edit"
                      className="rounded-lg p-2 text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-white"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => onDelete(idp.id, idp.name)}
                      title="Delete"
                      className="rounded-lg p-2 text-[var(--color-ink-dim)] transition hover:bg-rose-500/10 hover:text-rose-300"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <IDPFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); invalidate(); }}
        />
      )}

      {editTarget && (
        <IDPFormModal
          mode="edit"
          idp={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); invalidate(); }}
        />
      )}
    </>
  );
}

// ---- IDP form modal --------------------------------------------------------

type FormMode = 'create' | 'edit';
type IDPFormType = 'OIDC' | 'OAUTH' | 'JWT';

function IDPFormModal({
  mode,
  idp,
  onClose,
  onSaved,
}: {
  mode: FormMode;
  idp?: IdentityProvider;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();

  // Determine initial form type from existing IDP
  function initialType(): IDPFormType {
    if (!idp) return 'OIDC';
    if (idpTypeShort(idp.type) === 'OAUTH') return 'OAUTH';
    if (idpTypeShort(idp.type) === 'JWT') return 'JWT';
    return 'OIDC';
  }

  const [formType, setFormType] = useState<IDPFormType>(initialType());

  // Shared
  const [name, setName] = useState(idp?.name ?? '');

  // OIDC fields
  const [issuer, setIssuer] = useState(idp?.oidcConfig?.issuer ?? '');
  const [clientId, setClientId] = useState(idp?.oidcConfig?.clientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [scopes, setScopes] = useState((idp?.oidcConfig?.scopes ?? ['openid', 'profile', 'email']).join(' '));
  const [displayNameMapping, setDisplayNameMapping] = useState(
    idp?.oidcConfig?.displayNameMapping ?? 'IDP_CONFIG_MAPPING_FIELD_PREFERRED_USERNAME',
  );
  const [usernameMapping, setUsernameMapping] = useState(
    idp?.oidcConfig?.usernameMapping ?? 'IDP_CONFIG_MAPPING_FIELD_EMAIL',
  );
  const [isAutoRegister, setIsAutoRegister] = useState(idp?.oidcConfig?.isAutoRegister ?? false);

  // OAuth fields
  const [oAuthClientId, setOAuthClientId] = useState(idp?.oauthConfig?.clientId ?? '');
  const [oAuthClientSecret, setOAuthClientSecret] = useState('');
  const [authEndpoint, setAuthEndpoint] = useState(idp?.oauthConfig?.authorizationEndpoint ?? '');
  const [tokenEndpoint, setTokenEndpoint] = useState(idp?.oauthConfig?.tokenEndpoint ?? '');
  const [userEndpoint, setUserEndpoint] = useState(idp?.oauthConfig?.userEndpoint ?? '');
  const [oAuthScopes, setOAuthScopes] = useState((idp?.oauthConfig?.scopes ?? ['profile', 'email']).join(' '));
  const [idAttribute, setIdAttribute] = useState(idp?.oauthConfig?.idAttribute ?? 'sub');

  // JWT fields
  const [jwtEndpoint, setJwtEndpoint] = useState(idp?.jwtConfig?.jwtEndpoint ?? '');
  const [jwtIssuer, setJwtIssuer] = useState(idp?.jwtConfig?.issuer ?? '');
  const [keysEndpoint, setKeysEndpoint] = useState(idp?.jwtConfig?.keysEndpoint ?? '');
  const [headerName, setHeaderName] = useState(idp?.jwtConfig?.headerName ?? 'authorization');

  function applyPreset(preset: typeof PROVIDER_PRESETS[0]) {
    setIssuer(preset.issuer);
    setScopes(preset.scopes);
    if (!name) setName(preset.label);
  }

  const saveM = useMutation({
    mutationFn: async () => {
      const scopeArr = scopes.trim().split(/\s+/).filter(Boolean);
      const oAuthScopeArr = oAuthScopes.trim().split(/\s+/).filter(Boolean);

      if (formType === 'OIDC') {
        const input = {
          name: name.trim(),
          issuer: issuer.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          scopes: scopeArr,
          displayNameMapping,
          usernameMapping,
          isAutoRegister,
        };
        if (mode === 'create') {
          await createOIDCIDP(input);
        } else {
          await updateOIDCIDP(idp!.id, input);
        }
      } else if (formType === 'OAUTH') {
        const input = {
          name: name.trim(),
          clientId: oAuthClientId.trim(),
          clientSecret: oAuthClientSecret.trim(),
          authorizationEndpoint: authEndpoint.trim(),
          tokenEndpoint: tokenEndpoint.trim(),
          userEndpoint: userEndpoint.trim(),
          scopes: oAuthScopeArr,
          idAttribute: idAttribute.trim(),
        };
        if (mode === 'create') {
          await createOAuthIDP(input);
        } else {
          await updateOAuthIDP(idp!.id, input);
        }
      } else {
        const input = {
          name: name.trim(),
          jwtEndpoint: jwtEndpoint.trim(),
          issuer: jwtIssuer.trim(),
          keysEndpoint: keysEndpoint.trim(),
          headerName: headerName.trim(),
        };
        if (mode === 'create') {
          await createJWTIDP(input);
        } else {
          await updateJWTIDP(idp!.id, input);
        }
      }
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'IDP created' : 'IDP updated', name);
      onSaved();
    },
    onError: (e: Error) => toast.error(mode === 'create' ? 'Could not create IDP' : 'Could not update IDP', e.message),
  });

  const isEdit = mode === 'edit';
  const oidcValid = name.trim() && issuer.trim() && clientId.trim() && (isEdit || clientSecret.trim());
  const oauthValid = name.trim() && oAuthClientId.trim() && authEndpoint.trim() && tokenEndpoint.trim() && userEndpoint.trim() && (isEdit || oAuthClientSecret.trim());
  const jwtValid = name.trim() && jwtEndpoint.trim() && jwtIssuer.trim() && keysEndpoint.trim();
  const valid = formType === 'OIDC' ? oidcValid : formType === 'OAUTH' ? oauthValid : jwtValid;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit identity provider' : 'Add identity provider'}
      description={isEdit ? idp?.id : undefined}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saveM.isPending} disabled={!valid} onClick={() => saveM.mutate()}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Provider type selector (only on create) */}
        {!isEdit && (
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-dim)]">
              Provider type
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['OIDC', 'OAUTH', 'JWT'] as IDPFormType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setFormType(t)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition',
                    formType === t
                      ? 'border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10'
                      : 'border-white/10 bg-white/4 hover:bg-white/8',
                  )}
                >
                  <p className="text-sm font-medium text-white">
                    {t === 'OIDC' ? 'OIDC / OAuth2' : t === 'OAUTH' ? 'OAuth 2.0' : 'JWT'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-ink-dim)]">
                    {t === 'OIDC' && 'OpenID Connect with discovery'}
                    {t === 'OAUTH' && 'Generic OAuth, manual endpoints'}
                    {t === 'JWT' && 'Custom JWT token validation'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- OIDC form ---- */}
        {formType === 'OIDC' && (
          <>
            {/* Quick presets */}
            {!isEdit && (
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-dim)]">Quick start</p>
                <div className="flex flex-wrap gap-2">
                  {PROVIDER_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p)}
                      className="rounded-lg border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] transition hover:bg-white/10 hover:text-white"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Field label="Display name" required>
              <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="My OIDC Provider" />
            </Field>

            <Field label="Issuer URL" required hint="OIDC discovery endpoint base, e.g. https://accounts.google.com">
              <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="https://accounts.google.com" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Client ID" required>
                <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="client_id" />
              </Field>
              <Field
                label="Client secret"
                required={!isEdit}
                hint={isEdit ? 'Leave empty to keep current secret.' : undefined}
              >
                <Input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={isEdit ? '••••••••' : 'client_secret'}
                />
              </Field>
            </div>

            <Field label="Scopes" hint="Space-separated list.">
              <Input value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder="openid profile email" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Display name claim">
                <Select value={displayNameMapping} onChange={(e) => setDisplayNameMapping(e.target.value)}>
                  <option value="IDP_CONFIG_MAPPING_FIELD_UNSPECIFIED">Unspecified</option>
                  <option value="IDP_CONFIG_MAPPING_FIELD_PREFERRED_USERNAME">Preferred username</option>
                  <option value="IDP_CONFIG_MAPPING_FIELD_EMAIL">Email</option>
                </Select>
              </Field>
              <Field label="Username claim">
                <Select value={usernameMapping} onChange={(e) => setUsernameMapping(e.target.value)}>
                  <option value="IDP_CONFIG_MAPPING_FIELD_UNSPECIFIED">Unspecified</option>
                  <option value="IDP_CONFIG_MAPPING_FIELD_PREFERRED_USERNAME">Preferred username</option>
                  <option value="IDP_CONFIG_MAPPING_FIELD_EMAIL">Email</option>
                </Select>
              </Field>
            </div>

            <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={isAutoRegister}
                onChange={(e) => setIsAutoRegister(e.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Auto-register new users on first login
            </label>
          </>
        )}

        {/* ---- OAuth form ---- */}
        {formType === 'OAUTH' && (
          <>
            <Field label="Display name" required>
              <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="My OAuth Provider" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Client ID" required>
                <Input value={oAuthClientId} onChange={(e) => setOAuthClientId(e.target.value)} placeholder="client_id" />
              </Field>
              <Field
                label="Client secret"
                required={!isEdit}
                hint={isEdit ? 'Leave empty to keep current.' : undefined}
              >
                <Input
                  type="password"
                  value={oAuthClientSecret}
                  onChange={(e) => setOAuthClientSecret(e.target.value)}
                  placeholder={isEdit ? '••••••••' : 'client_secret'}
                />
              </Field>
            </div>

            <Field label="Authorization endpoint" required hint="e.g. https://provider.com/oauth/authorize">
              <Input value={authEndpoint} onChange={(e) => setAuthEndpoint(e.target.value)} placeholder="https://provider.com/oauth/authorize" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Token endpoint" required>
                <Input value={tokenEndpoint} onChange={(e) => setTokenEndpoint(e.target.value)} placeholder="https://provider.com/oauth/token" />
              </Field>
              <Field label="User info endpoint" required>
                <Input value={userEndpoint} onChange={(e) => setUserEndpoint(e.target.value)} placeholder="https://provider.com/api/user" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Scopes" hint="Space-separated.">
                <Input value={oAuthScopes} onChange={(e) => setOAuthScopes(e.target.value)} placeholder="profile email" />
              </Field>
              <Field label="ID attribute" hint="Claim used as user identifier.">
                <Input value={idAttribute} onChange={(e) => setIdAttribute(e.target.value)} placeholder="sub" />
              </Field>
            </div>
          </>
        )}

        {/* ---- JWT form ---- */}
        {formType === 'JWT' && (
          <>
            <Field label="Display name" required>
              <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="My JWT Provider" />
            </Field>

            <Field label="JWT endpoint" required hint="Endpoint that returns the JWT for the user.">
              <Input value={jwtEndpoint} onChange={(e) => setJwtEndpoint(e.target.value)} placeholder="https://provider.com/jwt" />
            </Field>

            <Field label="Issuer" required hint="Expected 'iss' claim in the JWT.">
              <Input value={jwtIssuer} onChange={(e) => setJwtIssuer(e.target.value)} placeholder="https://provider.com" />
            </Field>

            <Field label="Keys endpoint" required hint="JWKS endpoint to verify JWT signatures.">
              <Input value={keysEndpoint} onChange={(e) => setKeysEndpoint(e.target.value)} placeholder="https://provider.com/.well-known/jwks.json" />
            </Field>

            <Field label="Header name" hint="HTTP header carrying the JWT (default: authorization).">
              <Input value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="authorization" />
            </Field>
          </>
        )}

        {isEdit && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-200">
            <strong>Note:</strong> IDP type cannot be changed after creation. Delete and recreate to switch types.
          </div>
        )}
      </div>
    </Modal>
  );
}
