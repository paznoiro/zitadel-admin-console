import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  Download,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  CircleDashed,
  Trash2,
  FileDown,
} from 'lucide-react';
import { addHumanUser } from '../api/users';
import { listProjects, listRoles } from '../api/projects';
import { createUserGrant } from '../api/grants';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Badge, Button, EmptyState, PageHeader } from '../components/ui';
import {
  generateTemplate,
  parseXlsx,
  exportBulkResults,
  type ProjectForTemplate,
  type ParsedBulkRow,
} from '../lib/xlsxUtils';

type RowStatus = 'pending' | 'running' | 'done' | 'error';

interface RowState extends ParsedBulkRow {
  status: RowStatus;
  message?: string;
  userId?: string;
}

async function fetchProjectsWithRoles(orgId: string): Promise<ProjectForTemplate[]> {
  const projects = await listProjects(undefined, orgId);
  const results = await Promise.all(
    projects.map(async (p) => {
      try {
        const roles = await listRoles(p.id);
        return { id: p.id, name: p.name, roles: roles.map((r) => r.key) };
      } catch {
        return { id: p.id, name: p.name, roles: [] };
      }
    }),
  );
  return results;
}

export default function BulkUsers() {
  const { activeOrgId, orgs } = useAuth();
  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [projects, setProjects] = useState<ProjectForTemplate[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<RowState[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [emailVerified, setEmailVerified] = useState(true);
  const [running, setRunning] = useState(false);

  // Fetch projects + roles whenever the active org changes
  useEffect(() => {
    if (!activeOrgId) return;
    setLoadingProjects(true);
    fetchProjectsWithRoles(activeOrgId)
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [activeOrgId]);

  const summary = useMemo(() => ({
    total: rows.length,
    done: rows.filter((r) => r.status === 'done').length,
    error: rows.filter((r) => r.status === 'error').length,
  }), [rows]);

  function downloadTemplate() {
    const blob = generateTemplate(projects);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zitadel-users-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseXlsx(reader.result as ArrayBuffer, projects);
        const errors: string[] = [];
        if (!parsed.length) errors.push('File is empty or could not be read.');
        const missingRequired = parsed.some((r) => !r.email || !r.givenName || !r.familyName);
        if (missingRequired) errors.push('Some rows are missing required fields (firstName, lastName, email).');
        setParseErrors(errors);
        setFileName(file.name);
        setRows(
          parsed.map((p) => ({
            ...p,
            status: 'pending' as RowStatus,
            message:
              !p.email || !p.givenName || !p.familyName ? 'Missing required field' : undefined,
          })),
        );
      } catch (err) {
        setParseErrors([`Failed to parse file: ${(err as Error).message}`]);
        setRows([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function run() {
    if (!activeOrgId) return;
    setRunning(true);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.status === 'done') continue;
      if (!r.email || !r.givenName || !r.familyName) {
        setRows((prev) =>
          prev.map((x, j) => (j === i ? { ...x, status: 'error', message: 'Missing required field' } : x)),
        );
        continue;
      }
      setRows((prev) => prev.map((x, j) => (j === i ? { ...x, status: 'running' } : x)));
      try {
        const result = await addHumanUser({
          orgId: activeOrgId,
          givenName: r.givenName,
          familyName: r.familyName,
          email: r.email,
          username: r.username,
          password: r.password,
          changeRequired: r.changeRequired,
          phone: r.phone,
          preferredLanguage: r.preferredLanguage,
          emailVerified,
        });

        // Assign project role grants after user creation
        for (const grant of r.projectGrants) {
          await createUserGrant(result.userId, grant.projectId, grant.roleKeys, activeOrgId);
        }

        setRows((prev) =>
          prev.map((x, j) =>
            j === i ? { ...x, status: 'done', message: undefined, userId: result.userId } : x,
          ),
        );
      } catch (err) {
        setRows((prev) =>
          prev.map((x, j) =>
            j === i ? { ...x, status: 'error', message: (err as Error).message } : x,
          ),
        );
      }
    }
    setRunning(false);
    toast.success('Import finished', 'Check the per-row status below.');
  }

  function reset() {
    setRows([]);
    setParseErrors([]);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function doExport() {
    exportBulkResults(
      rows.map((r) => ({
        userId: r.userId ?? '',
        status: r.status,
        error: r.status === 'error' ? (r.message ?? '') : '',
        givenName: r.givenName,
        familyName: r.familyName,
        email: r.email,
        username: r.username ?? '',
        changeRequired: r.changeRequired,
        phone: r.phone ?? '',
        preferredLanguage: r.preferredLanguage ?? '',
        roles: r.projectGrants
          .map((g) => `${g.projectName}: ${g.roleKeys.join(', ')}`)
          .join(' | '),
      })),
      `import-results-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }

  const canRun = !!activeOrgId && rows.length > 0 && parseErrors.length === 0 && !running;

  const hasRoles = rows.some((r) => r.projectGrants.length > 0);

  return (
    <>
      <PageHeader
        title="Bulk import users"
        subtitle={
          activeOrg
            ? `Users will be created in "${activeOrg.name}"`
            : 'Select an organization first.'
        }
        icon={<Upload className="size-5" />}
        actions={
          <Button
            variant="ghost"
            icon={
              loadingProjects ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )
            }
            onClick={downloadTemplate}
            disabled={loadingProjects}
          >
            {loadingProjects ? 'Loading…' : 'Template XLSX'}
          </Button>
        }
      />

      {rows.length === 0 ? (
        <div
          className="glass cursor-pointer transition hover:border-white/20"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
        >
          <EmptyState
            icon={<FileText className="size-6" />}
            title="Drop an XLSX here, or click to browse"
            description="Required columns: firstName, lastName, email. Optional: username, password, changeRequired, phone, language, plus a column per project for roles."
            action={
              <Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
                Choose file
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="glass flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <FileText className="size-5 text-[var(--color-accent-2)]" />
              <div>
                <p className="text-sm font-medium text-white">{fileName}</p>
                <p className="text-xs text-[var(--color-ink-dim)]">
                  {summary.total} rows · {summary.done} created · {summary.error} failed
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="mr-2 flex cursor-pointer items-center gap-2 text-xs text-[var(--color-ink-dim)]">
                <input
                  type="checkbox"
                  checked={emailVerified}
                  onChange={(e) => setEmailVerified(e.target.checked)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                Mark emails verified
              </label>
              <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={reset} disabled={running}>
                Clear
              </Button>
              <Button
                variant="ghost"
                icon={<FileDown className="size-4" />}
                onClick={doExport}
                disabled={running || rows.length === 0}
              >
                Export
              </Button>
              <Button
                icon={running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                onClick={run}
                disabled={!canRun}
              >
                {running ? 'Importing…' : `Import ${summary.total} users`}
              </Button>
            </div>
          </div>

          {parseErrors.length > 0 && (
            <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              <ul className="list-inside list-disc space-y-1">
                {parseErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="glass overflow-hidden p-0">
            <div
              className={`hidden gap-3 border-b border-white/10 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-dim)] sm:grid ${hasRoles ? 'grid-cols-[auto_1.2fr_1.4fr_1fr_1.8fr_1.4fr]' : 'grid-cols-[auto_1.4fr_1.6fr_1fr_1.4fr]'}`}
            >
              <span>#</span>
              <span>Name</span>
              <span>Email</span>
              <span>Username</span>
              {hasRoles && <span>Roles</span>}
              <span>Status</span>
            </div>
            <div className="max-h-[55vh] divide-y divide-white/8 overflow-y-auto">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-1 items-start gap-1.5 px-4 py-2.5 text-sm sm:gap-3 ${hasRoles ? 'sm:grid-cols-[auto_1.2fr_1.4fr_1fr_1.8fr_1.4fr]' : 'sm:grid-cols-[auto_1.4fr_1.6fr_1fr_1.4fr]'}`}
                >
                  <span className="text-xs text-[var(--color-ink-dim)]">{r._line}</span>
                  <span className="truncate text-white">
                    {[r.givenName, r.familyName].filter(Boolean).join(' ') || '—'}
                  </span>
                  <span className="truncate text-[var(--color-ink-dim)]">{r.email || '—'}</span>
                  <span className="truncate text-[var(--color-ink-dim)]">{r.username ?? '—'}</span>
                  {hasRoles && (
                    <RoleCell grants={r.projectGrants} />
                  )}
                  <RowStatusCell status={r.status} message={r.message} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </>
  );
}

function RoleCell({
  grants,
}: {
  grants: Array<{ projectId: string; projectName: string; roleKeys: string[] }>;
}) {
  if (grants.length === 0) {
    return <span className="text-xs text-[var(--color-ink-dim)]">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {grants.map((g) => (
        <span
          key={g.projectId}
          className="inline-block max-w-[200px] truncate rounded bg-white/8 px-1.5 py-0.5 text-[11px] text-[var(--color-ink-dim)]"
          title={`${g.projectName}: ${g.roleKeys.join(', ')}`}
        >
          {g.projectName}: {g.roleKeys.join(', ')}
        </span>
      ))}
    </div>
  );
}

function RowStatusCell({ status, message }: { status: RowStatus; message?: string }) {
  if (status === 'done')
    return (
      <Badge tone="good">
        <CheckCircle2 className="size-3" /> Created
      </Badge>
    );
  if (status === 'running')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent-2)]">
        <Loader2 className="size-3.5 animate-spin" /> Creating…
      </span>
    );
  if (status === 'error')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-rose-300" title={message}>
        <XCircle className="size-3.5 shrink-0" />
        <span className="truncate">{message ?? 'Failed'}</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-dim)]">
      <CircleDashed className="size-3.5" /> {message ?? 'Pending'}
    </span>
  );
}
