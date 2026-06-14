import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CopyPlus,
  Building2,
  Boxes,
  AppWindow,
  KeyRound,
  CheckCircle2,
  XCircle,
  Loader2,
  CircleDashed,
  MinusCircle,
  Play,
  ArrowRight,
} from 'lucide-react';
import { duplicateOrganization, type CloneStep } from '../api/duplicate';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Button, Field, Input, PageHeader, Select, cn } from '../components/ui';

export default function DuplicateOrg() {
  const { orgs, refreshOrgs, setActiveOrg } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [sourceOrgId, setSourceOrgId] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [includeRoles, setIncludeRoles] = useState(true);
  const [includeApps, setIncludeApps] = useState(true);
  const [steps, setSteps] = useState<CloneStep[]>([]);
  const [running, setRunning] = useState(false);
  const [resultOrgId, setResultOrgId] = useState<string | null>(null);

  const source = orgs.find((o) => o.id === sourceOrgId);

  useEffect(() => {
    const fromQuery = params.get('source');
    if (fromQuery && orgs.some((o) => o.id === fromQuery)) {
      setSourceOrgId(fromQuery);
    } else if (!sourceOrgId && orgs[0]) {
      setSourceOrgId(orgs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgs]);

  useEffect(() => {
    if (source && !newOrgName) setNewOrgName(`${source.name} (Copy)`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceOrgId]);

  const progress = useMemo(() => {
    const total = steps.length || 1;
    const finished = steps.filter((s) =>
      ['done', 'error', 'skipped'].includes(s.status),
    ).length;
    return Math.round((finished / total) * 100);
  }, [steps]);

  async function start() {
    if (!sourceOrgId || !newOrgName.trim()) return;
    setRunning(true);
    setSteps([]);
    setResultOrgId(null);
    try {
      const res = await duplicateOrganization(
        { sourceOrgId, newOrgName: newOrgName.trim(), includeRoles, includeApps },
        setSteps,
      );
      setResultOrgId(res.newOrgId);
      await refreshOrgs();
      const failures = res.steps.filter((s) => s.status === 'error').length;
      if (failures === 0) toast.success('Organization duplicated', newOrgName.trim());
      else toast.info('Duplication finished with issues', `${failures} step(s) failed — see the log.`);
    } catch (err) {
      toast.error('Duplication failed', (err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Duplicate organization"
        subtitle="Clone an org with all of its projects, roles and applications into a brand-new org."
        icon={<CopyPlus className="size-5" />}
      />

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* Config */}
        <div className="glass space-y-4 self-start p-5">
          <Field label="Source organization" required>
            <Select
              value={sourceOrgId}
              onChange={(e) => setSourceOrgId(e.target.value)}
              disabled={running}
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

          <Field label="New organization name" required>
            <Input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Acme Inc. (Copy)"
              disabled={running}
            />
          </Field>

          <div className="space-y-2 rounded-xl border border-white/10 bg-white/4 p-3">
            <p className="text-xs font-medium text-[var(--color-ink-dim)]">What to replicate</p>
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
          </div>

          <p className="text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
            Users, grants and SAML apps are not copied. Application secrets cannot be read from the
            source, so each cloned app gets fresh credentials.
          </p>

          <Button
            className="w-full"
            icon={running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            disabled={!sourceOrgId || !newOrgName.trim() || running}
            onClick={start}
          >
            {running ? 'Duplicating…' : 'Start duplication'}
          </Button>
        </div>

        {/* Progress log */}
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
              <p>Configure the clone on the left and press start.</p>
              <p className="text-xs">Each created resource appears here in real time.</p>
            </div>
          ) : (
            <div className="flex-1 space-y-1 overflow-y-auto pr-1">
              {steps.map((s) => (
                <StepRow key={s.id} step={s} />
              ))}
            </div>
          )}

          {resultOrgId && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">New organization ready</p>
                <p className="truncate font-mono text-[11px] text-[var(--color-ink-dim)]">
                  {resultOrgId}
                </p>
              </div>
              <Button
                size="sm"
                icon={<ArrowRight className="size-4" />}
                onClick={() => {
                  setActiveOrg(resultOrgId);
                  navigate('/projects');
                }}
              >
                Open
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StepRow({ step }: { step: CloneStep }) {
  const icon =
    step.status === 'done' ? (
      <CheckCircle2 className="size-4 text-[var(--color-good)]" />
    ) : step.status === 'error' ? (
      <XCircle className="size-4 text-[var(--color-bad)]" />
    ) : step.status === 'running' ? (
      <Loader2 className="size-4 animate-spin text-[var(--color-accent-2)]" />
    ) : step.status === 'skipped' ? (
      <MinusCircle className="size-4 text-amber-400" />
    ) : (
      <CircleDashed className="size-4 text-[var(--color-ink-dim)]" />
    );

  const indent = step.kind === 'org' || step.kind === 'project' ? '' : 'ml-6';

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm',
        step.kind === 'project' && 'mt-1 font-medium',
        indent,
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <span className="text-[var(--color-ink)]">{step.label}</span>
        {step.detail && (
          <span
            className={cn(
              'ml-2 text-[11px]',
              step.status === 'error' ? 'text-rose-300' : 'text-[var(--color-ink-dim)]',
            )}
          >
            {step.detail}
          </span>
        )}
      </div>
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
        {description && <span className="block text-[11px] text-[var(--color-ink-dim)]">{description}</span>}
      </span>
    </label>
  );
}
