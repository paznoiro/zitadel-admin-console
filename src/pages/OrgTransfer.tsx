import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  AppWindow,
  Boxes,
  Building2,
  Copy,
  Download,
  FileJson2,
  KeyRound,
  Loader2,
  Play,
  Settings,
  ShieldCheck,
  ShieldPlus,
  Upload,
  Users as UsersIcon,
} from 'lucide-react';
import {
  downloadOrgExport,
  exportCounts,
  exportOrganization,
  importOrganization,
  parseOrgExport,
  type ImportResult,
  type OrgExportFile,
  type TransferStep,
} from '../api/transfer';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { StepRow } from '../components/StepLog';
import { Button, Field, Input, PageHeader, Select, cn } from '../components/ui';

export default function OrgTransfer() {
  const { orgs, refreshOrgs, setActiveOrg } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // ---- Export ----------------------------------------------------------------
  const [sourceOrgId, setSourceOrgId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportSteps, setExportSteps] = useState<TransferStep[]>([]);
  const [lastExport, setLastExport] = useState<{
    file: string;
    counts: ReturnType<typeof exportCounts>;
  } | null>(null);

  useEffect(() => {
    const fromQuery = params.get('source');
    if (fromQuery && orgs.some((o) => o.id === fromQuery)) {
      setSourceOrgId(fromQuery);
    } else if (!sourceOrgId && orgs[0]) {
      setSourceOrgId(orgs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgs]);

  async function doExport() {
    const org = orgs.find((o) => o.id === sourceOrgId);
    if (!org) return;
    setExporting(true);
    setExportSteps([]);
    setLastExport(null);
    try {
      const data = await exportOrganization({ id: org.id, name: org.name }, setExportSteps);
      const file = downloadOrgExport(data);
      const counts = exportCounts(data);
      setLastExport({ file, counts });
      toast.success('Organization exported', file);
    } catch (err) {
      toast.error('Export failed', (err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  // ---- Import ----------------------------------------------------------------
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<OrgExportFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [includeRoles, setIncludeRoles] = useState(true);
  const [includeApps, setIncludeApps] = useState(true);
  const [includeUsers, setIncludeUsers] = useState(true);
  const [includeGrants, setIncludeGrants] = useState(true);
  const [includeIdps, setIncludeIdps] = useState(true);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [steps, setSteps] = useState<TransferStep[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const fileCounts = useMemo(() => (data ? exportCounts(data) : null), [data]);

  const progress = useMemo(() => {
    const total = steps.length || 1;
    const finished = steps.filter((s) => ['done', 'error', 'skipped'].includes(s.status)).length;
    return Math.round((finished / total) * 100);
  }, [steps]);

  async function onFile(f: File) {
    try {
      const parsed = parseOrgExport(await f.text());
      setData(parsed);
      setFileName(f.name);
      setNewOrgName(parsed.org.name);
      setSteps([]);
      setResult(null);
    } catch (err) {
      toast.error('Could not read export file', (err as Error).message);
    }
  }

  async function startImport() {
    if (!data || !newOrgName.trim()) return;
    setRunning(true);
    setSteps([]);
    setResult(null);
    try {
      const res = await importOrganization(
        data,
        {
          newOrgName: newOrgName.trim(),
          includeRoles,
          includeApps,
          includeUsers,
          // grants reference users + project roles, so they need both imported
          includeGrants: includeGrants && includeUsers && includeRoles,
          includeIdps,
          includeSettings,
        },
        setSteps,
      );
      setResult(res);
      await refreshOrgs();
      const failures = res.steps.filter((s) => s.status === 'error').length;
      if (failures === 0) toast.success('Organization imported', newOrgName.trim());
      else toast.info('Import finished with issues', `${failures} step(s) failed — see the log.`);
    } catch (err) {
      toast.error('Import failed', (err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function copyId(id: string) {
    navigator.clipboard.writeText(id);
    toast.success('ID copied');
  }

  return (
    <>
      <PageHeader
        title="Export / Import organization"
        subtitle="Move an organization between ZITADEL instances: export it to a JSON file here, connect the console to the target instance, then import the file. New IDs and client credentials are issued on import."
        icon={<ArrowLeftRight className="size-5" />}
      />

      {/* ---- Export ---- */}
      <div className="glass mb-6 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Download className="size-4 text-[var(--color-accent-2)]" />
          <h3 className="text-sm font-semibold text-white">Export from this instance</h3>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <Field label="Organization">
              <Select
                value={sourceOrgId}
                onChange={(e) => setSourceOrgId(e.target.value)}
                disabled={exporting}
              >
                <option value="" disabled>
                  Select…
                </option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button
            icon={exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            disabled={!sourceOrgId || exporting}
            onClick={doExport}
          >
            {exporting ? 'Exporting…' : 'Export & download JSON'}
          </Button>
        </div>
        {exportSteps.length > 0 && (
          <div className="mt-4 max-h-[220px] space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/4 p-2 pr-1">
            {exportSteps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
          </div>
        )}
        {lastExport && (
          <p className="mt-3 flex items-center gap-2 text-xs text-[var(--color-ink-dim)]">
            <FileJson2 className="size-3.5 text-[var(--color-good)]" />
            <span className="font-mono">{lastExport.file}</span>
            <span>
              — {lastExport.counts.projects} projects, {lastExport.counts.apps} apps,{' '}
              {lastExport.counts.roles} roles, {lastExport.counts.users} users,{' '}
              {lastExport.counts.grants} grants, {lastExport.counts.idps} IDPs,{' '}
              {lastExport.counts.settings} custom settings
            </span>
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
          The file contains projects, project roles, applications (OIDC &amp; API config), users,
          user grants, identity providers (OIDC/OAuth/JWT config) and org settings (policies,
          branding colors and logo/icon images, embedded as base64). Application secrets, IDP client
          secrets and user passwords cannot be read, so they are not included.
        </p>
      </div>

      {/* ---- Import ---- */}
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="glass space-y-4 self-start p-5">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-[var(--color-accent-2)]" />
            <h3 className="text-sm font-semibold text-white">Import into this instance</h3>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={running}
            className="w-full rounded-xl border border-dashed border-white/20 bg-white/4 p-4 text-left transition hover:border-white/40 hover:bg-white/8 disabled:opacity-60"
          >
            {data ? (
              <span className="block">
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  <FileJson2 className="size-4 text-[var(--color-good)]" />
                  <span className="truncate">{fileName}</span>
                </span>
                <span className="mt-1 block text-[11px] text-[var(--color-ink-dim)]">
                  Org “{data.org.name}” — {fileCounts?.projects} projects, {fileCounts?.apps} apps,{' '}
                  {fileCounts?.roles} roles, {fileCounts?.users} users, {fileCounts?.grants} grants,{' '}
                  {fileCounts?.idps} IDPs, {fileCounts?.settings} custom settings
                  {data.sourceInstance ? ` · from ${data.sourceInstance}` : ''}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-sm text-[var(--color-ink-dim)]">
                <FileJson2 className="size-4" />
                Choose an export file (.json)…
              </span>
            )}
          </button>

          <Field label="New organization name" required>
            <Input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Acme Inc."
              disabled={running || !data}
            />
          </Field>

          <div className="space-y-2 rounded-xl border border-white/10 bg-white/4 p-3">
            <p className="text-xs font-medium text-[var(--color-ink-dim)]">What to import</p>
            <Toggle
              icon={<Boxes className="size-4" />}
              label="Projects"
              description="Always included"
              checked
              disabled
              onChange={() => {}}
            />
            <Toggle
              icon={<KeyRound className="size-4" />}
              label="Project roles"
              checked={includeRoles}
              disabled={running}
              onChange={setIncludeRoles}
            />
            <Toggle
              icon={<AppWindow className="size-4" />}
              label="Applications (OIDC & API)"
              description="New client credentials are issued"
              checked={includeApps}
              disabled={running}
              onChange={setIncludeApps}
            />
            <Toggle
              icon={<UsersIcon className="size-4" />}
              label="Users (human & service)"
              description="Emails marked verified; passwords must be reset"
              checked={includeUsers}
              disabled={running}
              onChange={setIncludeUsers}
            />
            <Toggle
              icon={<ShieldCheck className="size-4" />}
              label="User grants (project roles)"
              description={
                includeUsers && includeRoles
                  ? 'Re-links imported users to imported project roles'
                  : 'Needs users and project roles enabled'
              }
              checked={includeGrants && includeUsers && includeRoles}
              disabled={running || !includeUsers || !includeRoles}
              onChange={setIncludeGrants}
            />
            <Toggle
              icon={<ShieldPlus className="size-4" />}
              label="Identity providers"
              description="OIDC/OAuth/JWT config; client secrets must be re-entered"
              checked={includeIdps}
              disabled={running}
              onChange={setIncludeIdps}
            />
            <Toggle
              icon={<Settings className="size-4" />}
              label="Organization settings"
              description="Custom policies, branding colors & logo/icon images"
              checked={includeSettings}
              disabled={running}
              onChange={setIncludeSettings}
            />
          </div>

          <p className="text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
            The import runs against the instance this console is connected to. All resources get new
            IDs on the target — the mapping is shown in the report when the import finishes.
          </p>

          <Button
            className="w-full"
            icon={running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            disabled={!data || !newOrgName.trim() || running}
            onClick={startImport}
          >
            {running ? 'Importing…' : 'Start import'}
          </Button>
        </div>

        {/* Progress + report */}
        <div className="glass flex min-h-[320px] flex-col p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Progress</h3>
            {steps.length > 0 && (
              <span className="text-xs text-[var(--color-ink-dim)]">{progress}%</span>
            )}
          </div>

          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)] transition-all"
              style={{ width: `${steps.length ? progress : 0}%` }}
            />
          </div>

          {steps.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-[var(--color-ink-dim)]">
              <Building2 className="size-8 opacity-40" />
              <p>Pick an export file on the left and press start.</p>
              <p className="text-xs">Each created resource appears here in real time.</p>
            </div>
          ) : (
            <div className="max-h-[320px] flex-1 space-y-1 overflow-y-auto pr-1">
              {steps.map((s) => (
                <StepRow key={s.id} step={s} />
              ))}
            </div>
          )}

          {result && (
            <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    Organization “{result.orgName}” imported
                  </p>
                  <button
                    onClick={() => copyId(result.orgId)}
                    className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-[var(--color-ink-dim)] transition hover:text-white"
                    title="Copy org ID"
                  >
                    {result.orgId}
                    <Copy className="size-3" />
                  </button>
                </div>
                <Button
                  size="sm"
                  icon={<ArrowRight className="size-4" />}
                  onClick={() => {
                    setActiveOrg(result.orgId);
                    navigate('/projects');
                  }}
                >
                  Open
                </Button>
              </div>

              <ReportTable
                title={`Applications (${result.apps.length})`}
                headers={['Application', 'New ID', 'Project']}
                empty="No applications were imported."
                rows={result.apps.map((a) => ({
                  key: a.appId,
                  cells: [a.name, <IdCell key="id" id={a.appId} onCopy={copyId} />, a.projectName],
                }))}
              />

              <ReportTable
                title={`Users (${result.users.length})`}
                headers={['Email / Username', 'New user ID', 'Type']}
                empty="No users were imported."
                rows={result.users.map((u) => ({
                  key: u.userId,
                  cells: [
                    u.email ?? u.username ?? '—',
                    <IdCell key="id" id={u.userId} onCopy={copyId} />,
                    u.type === 'machine' ? 'Service' : 'Human',
                  ],
                }))}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function IdCell({ id, onCopy }: { id: string; onCopy: (id: string) => void }) {
  return (
    <button
      onClick={() => onCopy(id)}
      className="flex items-center gap-1 font-mono text-[11px] text-[var(--color-ink-dim)] transition hover:text-white"
      title="Copy ID"
    >
      {id}
      <Copy className="size-3" />
    </button>
  );
}

function ReportTable({
  title,
  headers,
  rows,
  empty,
}: {
  title: string;
  headers: string[];
  rows: Array<{ key: string; cells: React.ReactNode[] }>;
  empty: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <p className="border-b border-white/10 bg-white/4 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-[var(--color-ink-dim)]">{empty}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[11px] text-[var(--color-ink-dim)]">
              {headers.map((h) => (
                <th key={h} className="px-4 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.key}>
                {r.cells.map((c, i) => (
                  <td key={i} className={cn('px-4 py-2', i === 0 && 'text-white')}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Toggle({
  icon,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2 py-1.5',
        disabled ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-white/5',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-accent)]"
      />
      <span className="text-[var(--color-ink-dim)]">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm text-white">{label}</span>
        {description && (
          <span className="block text-[11px] text-[var(--color-ink-dim)]">{description}</span>
        )}
      </span>
    </label>
  );
}
