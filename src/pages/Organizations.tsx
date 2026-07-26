import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Search, Trash2, CopyPlus, Check, Star, Pencil, Palette, Settings, Upload, X, Copy, Globe, Hash, Download, Loader2 } from 'lucide-react';
import {
  createOrganization,
  deleteOrganization,
  getLabelPolicy,
  listOrganizations,
  saveLabelPolicy,
  activateLabelPolicy,
  uploadOrgLogo,
  deleteOrgLogo,
  uploadOrgIcon,
  deleteOrgIcon,
  updateOrganization,
} from '../api/orgs';
import type { LabelPolicy } from '../api/orgs';
import { downloadOrgExport, exportCounts, exportOrganization, type TransferStep } from '../api/transfer';
import { StepRow } from '../components/StepLog';
import type { Organization } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { getSession } from '../api/session';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';
import { Modal } from '../components/Modal';
import { OrgSettingsModal } from '../components/OrgSettingsModal';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBox,
  Field,
  HintWrap,
  Input,
  PageHeader,
  Spinner,
  cn,
} from '../components/ui';

function useAuthImg(url: string | undefined): string | undefined {
  const [blobUrl, setBlobUrl] = useState<string | undefined>();
  const load = useCallback(async (src: string) => {
    const session = getSession();
    if (!session) return;
    try {
      const res = await fetch(src, { headers: { Authorization: `Bearer ${session.token}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      setBlobUrl(URL.createObjectURL(blob));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!url) { setBlobUrl(undefined); return; }
    setBlobUrl(undefined);
    load(url);
    return () => { setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return undefined; }); };
  }, [url, load]);
  return blobUrl;
}

export default function Organizations() {
  const { activeOrgId, setActiveOrg, refreshOrgs } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [editTarget, setEditTarget] = useState<Organization | null>(null);
  const [editName, setEditName] = useState('');
  const [brandingOrg, setBrandingOrg] = useState<Organization | null>(null);
  const [settingsOrg, setSettingsOrg] = useState<Organization | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  // Modal stays visible while the export gathers data; it auto-closes on
  // success (the file download takes over) and stays open on failure so the
  // failed step is visible.
  const [exportModalOrg, setExportModalOrg] = useState<Organization | null>(null);
  const [exportSteps, setExportSteps] = useState<TransferStep[]>([]);

  const orgsQ = useQuery({
    queryKey: ['organizations', search],
    queryFn: () => listOrganizations({ query: search, limit: 300 }),
  });

  const createM = useMutation({
    mutationFn: () => createOrganization({ name: name.trim() }),
    onSuccess: async (res) => {
      toast.success('Organization created', name);
      setCreating(false);
      setName('');
      await refreshOrgs();
      qc.invalidateQueries({ queryKey: ['organizations'] });
      if (res.organizationId) setActiveOrg(res.organizationId);
    },
    onError: (e: Error) => toast.error('Could not create organization', e.message),
  });

  const updateM = useMutation({
    mutationFn: () => updateOrganization(editTarget!.id, editName.trim()),
    onSuccess: async () => {
      toast.success('Organization renamed', editName.trim());
      setEditTarget(null);
      await refreshOrgs();
      qc.invalidateQueries({ queryKey: ['organizations'] });
    },
    onError: (e: Error) => toast.error('Could not rename organization', e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteOrganization(id),
    onSuccess: async () => {
      toast.success('Organization deleted');
      await refreshOrgs();
      qc.invalidateQueries({ queryKey: ['organizations'] });
    },
    onError: (e: Error) => toast.error('Could not delete organization', e.message),
  });

  async function onDelete(id: string, label: string) {
    const ok = await confirm({
      title: 'Delete organization',
      message: (
        <>
          Permanently delete <strong className="text-white">{label}</strong> and everything it owns
          (projects, apps, users)? This cannot be undone.
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteM.mutate(id);
  }

  async function onExport(o: Organization) {
    setExportingId(o.id);
    setExportModalOrg(o);
    setExportSteps([]);
    try {
      const data = await exportOrganization({ id: o.id, name: o.name }, setExportSteps);
      const file = downloadOrgExport(data);
      const c = exportCounts(data);
      setExportModalOrg(null);
      toast.success(
        'Organization exported',
        `${file} — ${c.projects} projects, ${c.apps} apps, ${c.roles} roles, ${c.users} users, ` +
          `${c.grants} grants, ${c.settings} custom settings`,
      );
    } catch (e) {
      toast.error('Export failed', (e as Error).message);
    } finally {
      setExportingId(null);
    }
  }

  const orgs = orgsQ.data?.organizations ?? [];

  return (
    <>
      <PageHeader
        title="Organizations"
        subtitle="Tenants of your ZITADEL instance."
        icon={<Building2 className="size-5" />}
        actions={
          <div className="flex gap-2">
            <Button
              variant="subtle"
              icon={<Upload className="size-4" />}
              onClick={() => navigate('/transfer')}
              title="Import an org export file into this instance"
            >
              Import
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New Organization
            </Button>
          </div>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-dim)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search organizations…"
          className="pl-9"
        />
      </div>

      {orgsQ.isLoading ? (
        <Spinner />
      ) : orgsQ.isError ? (
        <ErrorBox error={orgsQ.error} />
      ) : orgs.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="No organizations"
            description="Create your first organization to start managing projects and users."
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                New Organization
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((o) => {
            const isActive = o.id === activeOrgId;
            return (
              <div key={o.id} className="glass group flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => {
                      setActiveOrg(o.id);
                      navigate('/projects');
                    }}
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-accent)]/40 to-[var(--color-accent-2)]/30 transition hover:opacity-80"
                    title="Open projects"
                  >
                    <Building2 className="size-5 text-white" />
                  </button>
                  {isActive ? (
                    <Badge tone="good">
                      <Check className="size-3" /> Active
                    </Badge>
                  ) : (
                    o.state && <Badge>{o.state.replace('ORG_STATE_', '')}</Badge>
                  )}
                </div>
                <button
                  onClick={() => {
                    setActiveOrg(o.id);
                    navigate('/projects');
                  }}
                  className="mt-3 text-left transition hover:opacity-80"
                  title="Set active and open projects"
                >
                  <h3 className="truncate font-semibold text-white" title={o.name}>
                    {o.name}
                  </h3>
                </button>

                {/* Domain */}
                {o.primaryDomain && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[var(--color-ink-dim)]" title={o.primaryDomain}>
                    <Globe className="size-3 shrink-0" />
                    {o.primaryDomain}
                  </p>
                )}

                {/* Org ID with copy */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(o.id);
                    toast.success('Org ID copied');
                  }}
                  className="mt-1 flex items-center gap-1 font-mono text-[11px] text-[var(--color-ink-dim)] transition hover:text-white"
                  title="Copy org ID"
                >
                  <Hash className="size-3 shrink-0" />
                  <span className="truncate">{o.id}</span>
                  <Copy className="size-3 shrink-0 opacity-0 transition group-hover:opacity-100" />
                </button>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  {!isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Star className="size-3.5" />}
                      onClick={() => {
                        setActiveOrg(o.id);
                        toast.info('Active organization switched', o.name);
                      }}
                    >
                      Set active
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="subtle"
                    icon={<CopyPlus className="size-3.5" />}
                    onClick={() => navigate(`/duplicate?source=${o.id}`)}
                  >
                    Duplicate
                  </Button>
                  <button
                    onClick={() => onExport(o)}
                    disabled={exportingId === o.id}
                    className="rounded-lg p-2 text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-emerald-300 disabled:opacity-60"
                    title="Export data (projects, apps, roles, users) to a JSON file"
                  >
                    {exportingId === o.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                  </button>
                  <button
                    onClick={() => setBrandingOrg(o)}
                    className="rounded-lg p-2 text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-violet-300"
                    title="Branding"
                  >
                    <Palette className="size-4" />
                  </button>
                  <button
                    onClick={() => setSettingsOrg(o)}
                    className="rounded-lg p-2 text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-sky-300"
                    title="Settings"
                  >
                    <Settings className="size-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditTarget(o);
                      setEditName(o.name);
                    }}
                    className="rounded-lg p-2 text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-white"
                    title="Rename organization"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <HintWrap hint="DELETE /v2beta/organizations/{id}">
                    <button
                      onClick={() => onDelete(o.id, o.name)}
                      className="rounded-lg p-2 text-[var(--color-ink-dim)] transition hover:bg-rose-500/10 hover:text-rose-300"
                      title="Delete organization"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </HintWrap>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create organization"
        description="A new tenant with its own projects, apps and users."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              loading={createM.isPending}
              disabled={!name.trim()}
              onClick={() => createM.mutate()}
              hint="POST /v2beta/organizations"
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Organization name" required>
          <Input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && createM.mutate()}
            placeholder="Acme Inc."
          />
        </Field>
      </Modal>

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Rename organization"
        description={editTarget?.id}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={updateM.isPending}
              disabled={!editName.trim() || editName.trim() === editTarget?.name}
              onClick={() => updateM.mutate()}
              hint="POST /v2beta/organizations/{id}"
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="Organization name" required>
          <Input
            value={editName}
            autoFocus
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && editName.trim() && editName.trim() !== editTarget?.name && updateM.mutate()
            }
          />
        </Field>
      </Modal>

      <Modal
        open={!!exportModalOrg}
        onClose={() => {
          if (!exportingId) setExportModalOrg(null);
        }}
        title="Exporting organization"
        description={exportModalOrg?.name}
        footer={
          <Button variant="ghost" disabled={!!exportingId} onClick={() => setExportModalOrg(null)}>
            Close
          </Button>
        }
      >
        <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
          {exportSteps.length === 0 ? (
            <p className="flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--color-ink-dim)]">
              <Loader2 className="size-4 animate-spin" /> Starting export…
            </p>
          ) : (
            exportSteps.map((s) => <StepRow key={s.id} step={s} />)
          )}
        </div>
        <p className="mt-3 text-[11px] text-[var(--color-ink-dim)]">
          The download starts automatically when everything has been gathered.
        </p>
      </Modal>

      {brandingOrg && (
        <BrandingModal
          org={brandingOrg}
          onClose={() => setBrandingOrg(null)}
        />
      )}

      {settingsOrg && (
        <OrgSettingsModal
          org={settingsOrg}
          onClose={() => setSettingsOrg(null)}
        />
      )}
    </>
  );
}

// ---- Branding modal ---------------------------------------------------------

type BrandingTab = 'colors' | 'logo';

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-[var(--color-ink-dim)]">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="size-8 cursor-pointer rounded-lg border border-white/20 bg-transparent p-0.5"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="font-mono text-xs"
        />
      </div>
    </label>
  );
}

function BrandingModal({ org, onClose }: { org: Organization; onClose: () => void }) {
  const toast = useToast();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoDarkInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const iconDarkInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<BrandingTab>('colors');
  const [policy, setPolicy] = useState<LabelPolicy | null>(null);
  const [logoUploading, setLogoUploading] = useState<'logo-light' | 'logo-dark' | 'icon-light' | 'icon-dark' | null>(null);

  const policyQ = useQuery({
    queryKey: ['label-policy', org.id],
    queryFn: () => getLabelPolicy(org.id),
  });

  useEffect(() => {
    if (policyQ.data && !policy) setPolicy(policyQ.data);
  }, [policyQ.data]);

  const p = policy ?? policyQ.data ?? {} as LabelPolicy;
  const logoLightSrc = useAuthImg(p.logoUrl);
  const logoDarkSrc = useAuthImg(p.logoDarkUrl);
  const iconLightSrc = useAuthImg(p.iconUrl);
  const iconDarkSrc = useAuthImg(p.iconDarkUrl);

  const saveM = useMutation({
    mutationFn: async () => {
      if (!policy) return;
      await saveLabelPolicy(org.id, policy.isDefault ?? true, {
        primaryColor: policy.primaryColor,
        backgroundColor: policy.backgroundColor,
        warnColor: policy.warnColor,
        fontColor: policy.fontColor,
        primaryColorDark: policy.primaryColorDark,
        backgroundColorDark: policy.backgroundColorDark,
        warnColorDark: policy.warnColorDark,
        fontColorDark: policy.fontColorDark,
        hideLoginNameSuffix: policy.hideLoginNameSuffix,
        disableWatermark: policy.disableWatermark,
      });
      await activateLabelPolicy(org.id);
    },
    onSuccess: () => {
      toast.success('Branding saved & activated');
      setPolicy((p) => p ? { ...p, isDefault: false } : p);
    },
    onError: (e: Error) => toast.error('Could not save branding', e.message),
  });

  async function handleLogoUpload(file: File, dark: boolean) {
    setLogoUploading(dark ? 'logo-dark' : 'logo-light');
    try {
      await uploadOrgLogo(org.id, file, dark);
      await activateLabelPolicy(org.id);
      toast.success(`Logo ${dark ? '(dark)' : '(light)'} uploaded`);
      const fresh = await policyQ.refetch();
      if (fresh.data) setPolicy(fresh.data);
    } catch (e) {
      toast.error('Upload failed', (e as Error).message);
    } finally {
      setLogoUploading(null);
    }
  }

  async function handleLogoDelete(dark: boolean) {
    try {
      await deleteOrgLogo(org.id, dark);
      await activateLabelPolicy(org.id);
      setPolicy((prev) => prev ? { ...prev, [dark ? 'logoDarkUrl' : 'logoUrl']: undefined } : prev);
      toast.success(`Logo ${dark ? '(dark)' : '(light)'} removed`);
    } catch (e) {
      toast.error('Delete failed', (e as Error).message);
    }
  }

  async function handleIconUpload(file: File, dark: boolean) {
    setLogoUploading(dark ? 'icon-dark' : 'icon-light');
    try {
      await uploadOrgIcon(org.id, file, dark);
      await activateLabelPolicy(org.id);
      toast.success(`Icon ${dark ? '(dark)' : '(light)'} uploaded`);
      const fresh = await policyQ.refetch();
      if (fresh.data) setPolicy(fresh.data);
    } catch (e) {
      toast.error('Upload failed', (e as Error).message);
    } finally {
      setLogoUploading(null);
    }
  }

  async function handleIconDelete(dark: boolean) {
    try {
      await deleteOrgIcon(org.id, dark);
      await activateLabelPolicy(org.id);
      setPolicy((prev) => prev ? { ...prev, [dark ? 'iconDarkUrl' : 'iconUrl']: undefined } : prev);
      toast.success(`Icon ${dark ? '(dark)' : '(light)'} removed`);
    } catch (e) {
      toast.error('Delete failed', (e as Error).message);
    }
  }

  const set = (key: keyof LabelPolicy, val: unknown) =>
    setPolicy((prev) => ({ ...(prev ?? policyQ.data ?? {}), [key]: val }));

  return (
    <Modal
      open
      onClose={onClose}
      title="Organization branding"
      description={org.name}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {tab === 'colors' && (
            <Button loading={saveM.isPending} onClick={() => saveM.mutate()} disabled={!policy}>
              Save & activate
            </Button>
          )}
        </>
      }
    >
      {/* Tab bar */}
      <div className="mb-5 flex gap-1 rounded-xl border border-white/10 bg-white/4 p-1">
        {(['colors', 'logo'] as BrandingTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 rounded-lg px-4 py-2 text-sm font-medium capitalize transition',
              tab === t
                ? 'bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                : 'text-[var(--color-ink-dim)] hover:text-white',
            )}
          >
            {t === 'logo' ? 'Logo & Icon' : 'Colors'}
          </button>
        ))}
      </div>

      {policyQ.isLoading ? (
        <Spinner />
      ) : policyQ.isError ? (
        <>
          <ErrorBox error={policyQ.error} />
          <p className="mt-2 text-xs text-[var(--color-ink-dim)]">
            Branding management requires a token with IAM_OWNER or ORG_OWNER rights for this org.
          </p>
        </>
      ) : tab === 'colors' ? (
        <div className="space-y-6">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">Light theme</p>
            <div className="grid grid-cols-2 gap-4">
              <ColorSwatch label="Primary" value={p.primaryColor ?? ''} onChange={(v) => set('primaryColor', v)} />
              <ColorSwatch label="Background" value={p.backgroundColor ?? ''} onChange={(v) => set('backgroundColor', v)} />
              <ColorSwatch label="Warning" value={p.warnColor ?? ''} onChange={(v) => set('warnColor', v)} />
              <ColorSwatch label="Font" value={p.fontColor ?? ''} onChange={(v) => set('fontColor', v)} />
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">Dark theme</p>
            <div className="grid grid-cols-2 gap-4">
              <ColorSwatch label="Primary (dark)" value={p.primaryColorDark ?? ''} onChange={(v) => set('primaryColorDark', v)} />
              <ColorSwatch label="Background (dark)" value={p.backgroundColorDark ?? ''} onChange={(v) => set('backgroundColorDark', v)} />
              <ColorSwatch label="Warning (dark)" value={p.warnColorDark ?? ''} onChange={(v) => set('warnColorDark', v)} />
              <ColorSwatch label="Font (dark)" value={p.fontColorDark ?? ''} onChange={(v) => set('fontColorDark', v)} />
            </div>
          </div>
          <div className="space-y-3 border-t border-white/10 pt-4">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={p.hideLoginNameSuffix ?? false}
                onChange={(e) => set('hideLoginNameSuffix', e.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Hide login name suffix (org domain)
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={p.disableWatermark ?? false}
                onChange={(e) => set('disableWatermark', e.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Disable ZITADEL watermark on login page
            </label>
          </div>
        </div>
      ) : (
        /* Logo & Icon tab */
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {([
              { label: 'Logo (light)', uploadKey: 'logo-light' as const, rawUrl: p.logoUrl,     blobUrl: logoLightSrc, ref: logoInputRef,     onUpload: (f: File) => handleLogoUpload(f, false), onDelete: () => handleLogoDelete(false) },
              { label: 'Logo (dark)',  uploadKey: 'logo-dark'  as const, rawUrl: p.logoDarkUrl,  blobUrl: logoDarkSrc,  ref: logoDarkInputRef,  onUpload: (f: File) => handleLogoUpload(f, true),  onDelete: () => handleLogoDelete(true)  },
              { label: 'Icon (light)', uploadKey: 'icon-light' as const, rawUrl: p.iconUrl,      blobUrl: iconLightSrc, ref: iconInputRef,      onUpload: (f: File) => handleIconUpload(f, false), onDelete: () => handleIconDelete(false) },
              { label: 'Icon (dark)',  uploadKey: 'icon-dark'  as const, rawUrl: p.iconDarkUrl,  blobUrl: iconDarkSrc,  ref: iconDarkInputRef,  onUpload: (f: File) => handleIconUpload(f, true),  onDelete: () => handleIconDelete(true)  },
            ] as const).map(({ label, uploadKey, rawUrl, blobUrl, ref, onUpload, onDelete }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/4 p-4">
                <p className="mb-3 text-sm font-medium text-[var(--color-ink)]">{label}</p>
                {rawUrl ? (
                  <div className="mb-3 flex items-start gap-3">
                    {blobUrl ? (
                      <img
                        src={blobUrl}
                        alt={label}
                        className="h-10 max-w-[120px] rounded-lg border border-white/10 bg-white/10 object-contain p-1"
                      />
                    ) : (
                      <div className="h-10 w-16 animate-pulse rounded-lg border border-white/10 bg-white/10" />
                    )}
                    <button
                      onClick={onDelete}
                      className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"
                      title={`Remove ${label.toLowerCase()}`}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <p className="mb-3 text-xs text-[var(--color-ink-dim)]">Not set</p>
                )}
                <input
                  ref={ref}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(f);
                    e.target.value = '';
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  loading={logoUploading === uploadKey}
                  icon={<Upload className="size-3.5" />}
                  onClick={() => ref.current?.click()}
                >
                  {rawUrl ? 'Replace' : 'Upload'}
                </Button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-ink-dim)]">
            Recommended: SVG or PNG with transparent background. Logo is the full wordmark; icon is the square/compact mark.
          </p>
        </div>
      )}
    </Modal>
  );
}
