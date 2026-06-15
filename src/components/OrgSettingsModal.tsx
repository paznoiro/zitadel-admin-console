import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RotateCcw, Save } from 'lucide-react';
import {
  getLoginPolicy,
  getPasswordComplexityPolicy,
  getLockoutPolicy,
  getPasswordAgePolicy,
  getPrivacyPolicy,
  getNotificationPolicy,
  getDomainPolicy,
  saveLoginPolicy,
  savePasswordComplexityPolicy,
  saveLockoutPolicy,
  savePasswordAgePolicy,
  savePrivacyPolicy,
  saveNotificationPolicy,
  resetNotificationPolicy,
  saveDomainPolicy,
  resetDomainPolicy,
  type LoginPolicy,
  type PasswordComplexityPolicy,
  type LockoutPolicy,
  type PasswordAgePolicy,
  type PrivacyPolicy,
  type NotificationPolicy,
  type DomainPolicy,
} from '../api/orgSettings';
import type { Organization } from '../api/types';
import { Modal } from './Modal';
import { useToast } from './Toast';
import {
  Button,
  ErrorBox,
  Field,
  Input,
  Spinner,
  cn,
} from './ui';

type Tab = 'login' | 'password' | 'lockout' | 'legal' | 'notifications' | 'domain';

const TABS: { id: Tab; label: string }[] = [
  { id: 'login', label: 'Login' },
  { id: 'password', label: 'Password' },
  { id: 'lockout', label: 'Lockout' },
  { id: 'legal', label: 'Legal & Support' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'domain', label: 'Domain' },
];

function DefaultBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
      inherited from instance
    </span>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--color-ink)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-accent)]"
      />
      {label}
    </label>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32"
      />
    </Field>
  );
}

// ---- Login Tab --------------------------------------------------------------

function LoginTab({ org }: { org: Organization }) {
  const toast = useToast();
  const [form, setForm] = useState<LoginPolicy | null>(null);

  const q = useQuery({
    queryKey: ['org-login-policy', org.id],
    queryFn: () => getLoginPolicy(org.id),
  });

  useEffect(() => {
    if (q.data && !form) setForm(q.data);
  }, [q.data]);

  const saveM = useMutation({
    mutationFn: () => saveLoginPolicy(org.id, form!),
    onSuccess: () => {
      toast.success('Login settings saved');
      setForm((f) => f ? { ...f, isDefault: false } : f);
    },
    onError: (e: Error) => toast.error('Could not save login settings', e.message),
  });

  const set = <K extends keyof LoginPolicy>(key: K, val: LoginPolicy[K]) =>
    setForm((f) => f ? { ...f, [key]: val } : f);

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} />;
  if (!form) return null;

  return (
    <div className="space-y-5">
      {form.isDefault && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-2.5 text-xs text-amber-200">
          This org is using the instance default login policy. Saving will create a custom override.
        </div>
      )}

      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          Login methods
        </p>
        <Toggle label="Allow username / password" checked={form.allowUsernamePassword ?? false} onChange={(v) => set('allowUsernamePassword', v)} />
        <Toggle label="Allow registration" checked={form.allowRegister ?? false} onChange={(v) => set('allowRegister', v)} />
        <Toggle label="Allow external identity providers" checked={form.allowExternalIdp ?? false} onChange={(v) => set('allowExternalIdp', v)} />
        <Toggle label="Allow domain discovery" checked={form.allowDomainDiscovery ?? false} onChange={(v) => set('allowDomainDiscovery', v)} />
        <Toggle label="Disable login with email" checked={form.disableLoginWithEmail ?? false} onChange={(v) => set('disableLoginWithEmail', v)} />
        <Toggle label="Disable login with phone" checked={form.disableLoginWithPhone ?? false} onChange={(v) => set('disableLoginWithPhone', v)} />
      </div>

      <div className="space-y-3 border-t border-white/10 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          Security
        </p>
        <Toggle label="Force MFA" checked={form.forceMfa ?? false} onChange={(v) => set('forceMfa', v)} />
        <Toggle label="Force MFA (local only)" checked={form.forceMfaLocalOnly ?? false} onChange={(v) => set('forceMfaLocalOnly', v)} />
        <Toggle label="Hide password reset" checked={form.hidePasswordReset ?? false} onChange={(v) => set('hidePasswordReset', v)} />
        <Toggle label="Ignore unknown usernames" checked={form.ignoreUnknownUsernames ?? false} onChange={(v) => set('ignoreUnknownUsernames', v)} />
      </div>

      <div className="space-y-3 border-t border-white/10 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          Session lifetimes (days)
        </p>
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Password check"
            hint="Days before re-entering password"
            value={Math.round((Number((form.passwordCheckLifetime ?? '0').replace('s', '')) || 0) / 86400)}
            onChange={(v) => set('passwordCheckLifetime', `${v * 86400}s`)}
          />
          <NumberField
            label="External login check"
            hint="Days before re-checking external IdP"
            value={Math.round((Number((form.externalLoginCheckLifetime ?? '0').replace('s', '')) || 0) / 86400)}
            onChange={(v) => set('externalLoginCheckLifetime', `${v * 86400}s`)}
          />
          <NumberField
            label="MFA init skip"
            hint="Days users can skip MFA setup"
            value={Math.round((Number((form.mfaInitSkipLifetime ?? '0').replace('s', '')) || 0) / 86400)}
            onChange={(v) => set('mfaInitSkipLifetime', `${v * 86400}s`)}
          />
          <NumberField
            label="2nd factor check (hours)"
            hint="Hours before re-checking 2FA"
            value={Math.round((Number((form.secondFactorCheckLifetime ?? '0').replace('s', '')) || 0) / 3600)}
            onChange={(v) => set('secondFactorCheckLifetime', `${v * 3600}s`)}
          />
          <NumberField
            label="Multi-factor check (hours)"
            hint="Hours before re-checking MFA"
            value={Math.round((Number((form.multiFactorCheckLifetime ?? '0').replace('s', '')) || 0) / 3600)}
            onChange={(v) => set('multiFactorCheckLifetime', `${v * 3600}s`)}
          />
        </div>
      </div>

      <div className="border-t border-white/10 pt-4">
        <Field label="Default redirect URI" hint="Override the post-login redirect for this org">
          <Input
            value={form.defaultRedirectUri ?? ''}
            placeholder="https://app.example.com"
            onChange={(e) => set('defaultRedirectUri', e.target.value)}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button loading={saveM.isPending} onClick={() => saveM.mutate()} icon={<Save className="size-3.5" />} hint="POST/PUT /management/v1/policies/login">
          Save login settings
        </Button>
      </div>
    </div>
  );
}

// ---- Password Tab -----------------------------------------------------------

function PasswordTab({ org }: { org: Organization }) {
  const toast = useToast();
  const [complexity, setComplexity] = useState<PasswordComplexityPolicy | null>(null);
  const [age, setAge] = useState<PasswordAgePolicy | null>(null);

  const complexQ = useQuery({
    queryKey: ['org-password-complexity', org.id],
    queryFn: () => getPasswordComplexityPolicy(org.id),
  });
  const ageQ = useQuery({
    queryKey: ['org-password-age', org.id],
    queryFn: () => getPasswordAgePolicy(org.id),
  });

  useEffect(() => { if (complexQ.data && !complexity) setComplexity(complexQ.data); }, [complexQ.data]);
  useEffect(() => { if (ageQ.data && !age) setAge(ageQ.data); }, [ageQ.data]);

  const complexM = useMutation({
    mutationFn: () => savePasswordComplexityPolicy(org.id, complexity!),
    onSuccess: () => {
      toast.success('Password complexity saved');
      setComplexity((f) => f ? { ...f, isDefault: false } : f);
    },
    onError: (e: Error) => toast.error('Could not save password complexity', e.message),
  });

  const ageM = useMutation({
    mutationFn: () => savePasswordAgePolicy(org.id, age!),
    onSuccess: () => {
      toast.success('Password expiry saved');
      setAge((f) => f ? { ...f, isDefault: false } : f);
    },
    onError: (e: Error) => toast.error('Could not save password expiry', e.message),
  });

  const setC = <K extends keyof PasswordComplexityPolicy>(k: K, v: PasswordComplexityPolicy[K]) =>
    setComplexity((f) => f ? { ...f, [k]: v } : f);
  const setA = <K extends keyof PasswordAgePolicy>(k: K, v: PasswordAgePolicy[K]) =>
    setAge((f) => f ? { ...f, [k]: v } : f);

  return (
    <div className="space-y-6">
      {/* Complexity */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
            Password complexity
          </p>
          {complexity?.isDefault && <DefaultBadge />}
        </div>
        {complexQ.isLoading ? <Spinner /> : complexQ.isError ? <ErrorBox error={complexQ.error} /> : complexity && (
          <>
            {complexity.isDefault && (
              <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-2.5 text-xs text-amber-200">
                Using instance defaults. Saving creates an org-level override.
              </div>
            )}
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <Field label="Minimum length">
                  <Input
                    type="number"
                    min={1}
                    value={complexity.minLength ?? 8}
                    onChange={(e) => setC('minLength', Number(e.target.value))}
                    className="w-20"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Toggle label="Require uppercase" checked={complexity.hasUppercase ?? false} onChange={(v) => setC('hasUppercase', v)} />
                <Toggle label="Require lowercase" checked={complexity.hasLowercase ?? false} onChange={(v) => setC('hasLowercase', v)} />
                <Toggle label="Require number" checked={complexity.hasNumber ?? false} onChange={(v) => setC('hasNumber', v)} />
                <Toggle label="Require symbol" checked={complexity.hasSymbol ?? false} onChange={(v) => setC('hasSymbol', v)} />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button size="sm" loading={complexM.isPending} onClick={() => complexM.mutate()} icon={<Save className="size-3.5" />} hint="POST/PUT /management/v1/policies/password/complexity">
                Save complexity
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Age / Expiry */}
      <div className="border-t border-white/10 pt-5">
        <div className="mb-3 flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
            Password expiry
          </p>
          {age?.isDefault && <DefaultBadge />}
        </div>
        {ageQ.isLoading ? <Spinner /> : ageQ.isError ? <ErrorBox error={ageQ.error} /> : age && (
          <>
            {age.isDefault && (
              <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-2.5 text-xs text-amber-200">
                Using instance defaults. Saving creates an org-level override.
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="Max age (days)"
                hint="0 = never expires"
                value={age.maxAgeDays ?? 0}
                onChange={(v) => setA('maxAgeDays', v)}
              />
              <NumberField
                label="Warn before expiry (days)"
                hint="Days before expiry to notify users"
                value={age.expireWarnDays ?? 0}
                onChange={(v) => setA('expireWarnDays', v)}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <Button size="sm" loading={ageM.isPending} onClick={() => ageM.mutate()} icon={<Save className="size-3.5" />} hint="POST/PUT /management/v1/policies/password/age">
                Save expiry
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Lockout Tab ------------------------------------------------------------

function LockoutTab({ org }: { org: Organization }) {
  const toast = useToast();
  const [form, setForm] = useState<LockoutPolicy | null>(null);

  const q = useQuery({
    queryKey: ['org-lockout-policy', org.id],
    queryFn: () => getLockoutPolicy(org.id),
  });

  useEffect(() => { if (q.data && !form) setForm(q.data); }, [q.data]);

  const saveM = useMutation({
    mutationFn: () => saveLockoutPolicy(org.id, form!),
    onSuccess: () => {
      toast.success('Lockout settings saved');
      setForm((f) => f ? { ...f, isDefault: false } : f);
    },
    onError: (e: Error) => toast.error('Could not save lockout settings', e.message),
  });

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} />;
  if (!form) return null;

  return (
    <div className="space-y-5">
      {form.isDefault && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-2.5 text-xs text-amber-200">
          Using instance defaults. Saving creates an org-level override.
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          label="Max password attempts"
          hint="0 = unlimited"
          value={form.maxPasswordAttempts ?? 0}
          onChange={(v) => setForm((f) => f ? { ...f, maxPasswordAttempts: v } : f)}
        />
        <NumberField
          label="Max OTP attempts"
          hint="0 = unlimited"
          value={form.maxOtpAttempts ?? 0}
          onChange={(v) => setForm((f) => f ? { ...f, maxOtpAttempts: v } : f)}
        />
      </div>
      <div className="flex justify-end">
        <Button loading={saveM.isPending} onClick={() => saveM.mutate()} icon={<Save className="size-3.5" />} hint="POST/PUT /management/v1/policies/lockout">
          Save lockout settings
        </Button>
      </div>
    </div>
  );
}

// ---- Legal Tab --------------------------------------------------------------

function LegalTab({ org }: { org: Organization }) {
  const toast = useToast();
  const [form, setForm] = useState<PrivacyPolicy | null>(null);

  const q = useQuery({
    queryKey: ['org-privacy-policy', org.id],
    queryFn: () => getPrivacyPolicy(org.id),
  });

  useEffect(() => { if (q.data && !form) setForm(q.data); }, [q.data]);

  const saveM = useMutation({
    mutationFn: () => savePrivacyPolicy(org.id, form!),
    onSuccess: () => {
      toast.success('Legal & support settings saved');
      setForm((f) => f ? { ...f, isDefault: false } : f);
    },
    onError: (e: Error) => toast.error('Could not save legal settings', e.message),
  });

  const set = <K extends keyof PrivacyPolicy>(k: K, v: PrivacyPolicy[K]) =>
    setForm((f) => f ? { ...f, [k]: v } : f);

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} />;
  if (!form) return null;

  return (
    <div className="space-y-4">
      {form.isDefault && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-2.5 text-xs text-amber-200">
          Using instance defaults. Saving creates an org-level override.
        </div>
      )}
      <Field label="Terms of Service URL">
        <Input value={form.tosLink ?? ''} placeholder="https://example.com/tos" onChange={(e) => set('tosLink', e.target.value)} />
      </Field>
      <Field label="Privacy Policy URL">
        <Input value={form.privacyLink ?? ''} placeholder="https://example.com/privacy" onChange={(e) => set('privacyLink', e.target.value)} />
      </Field>
      <Field label="Help / Documentation URL">
        <Input value={form.helpLink ?? ''} placeholder="https://docs.example.com" onChange={(e) => set('helpLink', e.target.value)} />
      </Field>
      <Field label="Support email">
        <Input type="email" value={form.supportEmail ?? ''} placeholder="support@example.com" onChange={(e) => set('supportEmail', e.target.value)} />
      </Field>
      <Field label="Docs link">
        <Input value={form.docsLink ?? ''} placeholder="https://docs.example.com" onChange={(e) => set('docsLink', e.target.value)} />
      </Field>
      <Field label="Custom link URL" hint="Optional extra link shown in the login UI">
        <Input value={form.customLink ?? ''} placeholder="https://example.com/custom" onChange={(e) => set('customLink', e.target.value)} />
      </Field>
      <Field label="Custom link label">
        <Input value={form.customLinkText ?? ''} placeholder="Custom portal" onChange={(e) => set('customLinkText', e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button loading={saveM.isPending} onClick={() => saveM.mutate()} icon={<Save className="size-3.5" />} hint="POST/PUT /management/v1/policies/privacy">
          Save legal settings
        </Button>
      </div>
    </div>
  );
}

// ---- Notifications Tab ------------------------------------------------------
// The management v1 notification policy only exposes a single boolean:
// passwordChange — whether to send a notification when a password is changed.

function NotificationsTab({ org }: { org: Organization }) {
  const toast = useToast();
  const [form, setForm] = useState<NotificationPolicy | null>(null);

  const q = useQuery({
    queryKey: ['org-notification-policy', org.id],
    queryFn: () => getNotificationPolicy(org.id),
  });

  useEffect(() => { if (q.data && !form) setForm(q.data); }, [q.data]);

  const saveM = useMutation({
    mutationFn: () => saveNotificationPolicy(org.id, form!),
    onSuccess: () => {
      toast.success('Notification settings saved');
      setForm((f) => f ? { ...f, isDefault: false } : f);
    },
    onError: (e: Error) => toast.error('Could not save notification settings', e.message),
  });

  const resetM = useMutation({
    mutationFn: () => resetNotificationPolicy(org.id),
    onSuccess: () => {
      toast.success('Notification settings reset to instance default');
      q.refetch();
      setForm(null);
    },
    onError: (e: Error) => toast.error('Could not reset notification settings', e.message),
  });

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} />;
  if (!form) return null;

  return (
    <div className="space-y-5">
      {form.isDefault ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-2.5 text-xs text-amber-200">
          Using instance default notification policy. Saving creates an org-level override.
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/8 px-4 py-2.5 text-xs text-emerald-200">
          Custom notification settings are active for this org.
        </div>
      )}
      <Toggle
        label="Send notification when a user's password is changed"
        checked={form.passwordChange ?? false}
        onChange={(v) => setForm((f) => f ? { ...f, passwordChange: v } : f)}
      />
      <div className="flex items-center justify-end gap-2">
        {!form.isDefault && (
          <Button
            variant="ghost"
            size="sm"
            loading={resetM.isPending}
            onClick={() => resetM.mutate()}
            icon={<RotateCcw className="size-3.5" />}
            hint="DELETE /management/v1/policies/notification"
          >
            Reset to default
          </Button>
        )}
        <Button loading={saveM.isPending} onClick={() => saveM.mutate()} icon={<Save className="size-3.5" />} hint="POST/PUT /management/v1/policies/notification">
          Save notification settings
        </Button>
      </div>
    </div>
  );
}

// ---- Domain Tab -------------------------------------------------------------
// Domain policy controls login name format and domain verification requirements.
// GET via management v1; writes via admin v1 (requires iam.policy.write).

function DomainTab({ org }: { org: Organization }) {
  const toast = useToast();
  const [form, setForm] = useState<DomainPolicy | null>(null);

  const q = useQuery({
    queryKey: ['org-domain-policy', org.id],
    queryFn: () => getDomainPolicy(org.id),
  });

  useEffect(() => { if (q.data && !form) setForm(q.data); }, [q.data]);

  const saveM = useMutation({
    mutationFn: () => saveDomainPolicy(org.id, form!),
    onSuccess: () => {
      toast.success('Domain settings saved');
      setForm((f) => f ? { ...f, isDefault: false } : f);
    },
    onError: (e: Error) => toast.error('Could not save domain settings', e.message),
  });

  const resetM = useMutation({
    mutationFn: () => resetDomainPolicy(org.id),
    onSuccess: () => {
      toast.success('Domain settings reset to instance default');
      q.refetch();
      setForm(null);
    },
    onError: (e: Error) => toast.error('Could not reset domain settings', e.message),
  });

  const set = <K extends keyof DomainPolicy>(k: K, v: DomainPolicy[K]) =>
    setForm((f) => f ? { ...f, [k]: v } : f);

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} />;
  if (!form) return null;

  return (
    <div className="space-y-5">
      {form.isDefault ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-2.5 text-xs text-amber-200">
          Using instance default domain policy. Saving creates an org-level override. Requires <code>iam.policy.write</code> permission.
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/8 px-4 py-2.5 text-xs text-emerald-200">
          Custom domain settings are active for this org.
        </div>
      )}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          Login name format
        </p>
        <Toggle
          label="Login names must include org domain suffix"
          checked={form.userLoginMustBeDomain ?? false}
          onChange={(v) => set('userLoginMustBeDomain', v)}
        />
      </div>
      <div className="space-y-3 border-t border-white/10 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          Domain verification
        </p>
        <Toggle
          label="Require org domains to be verified before use"
          checked={form.validateOrgDomains ?? false}
          onChange={(v) => set('validateOrgDomains', v)}
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        {!form.isDefault && (
          <Button
            variant="ghost"
            size="sm"
            loading={resetM.isPending}
            onClick={() => resetM.mutate()}
            icon={<RotateCcw className="size-3.5" />}
            hint="DELETE /admin/v1/orgs/{id}/policies/domain"
          >
            Reset to default
          </Button>
        )}
        <Button loading={saveM.isPending} onClick={() => saveM.mutate()} icon={<Save className="size-3.5" />} hint="POST/PUT /admin/v1/orgs/{id}/policies/domain">
          Save domain settings
        </Button>
      </div>
    </div>
  );
}

// ---- Main Modal -------------------------------------------------------------

export function OrgSettingsModal({ org, onClose }: { org: Organization; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('login');

  return (
    <Modal
      open
      onClose={onClose}
      title="Organization settings"
      description={org.name}
      size="xl"
    >
      {/* Tab bar */}
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/4 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-xs font-medium transition whitespace-nowrap',
              tab === t.id
                ? 'bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                : 'text-[var(--color-ink-dim)] hover:text-white',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'login' && <LoginTab org={org} />}
      {tab === 'password' && <PasswordTab org={org} />}
      {tab === 'lockout' && <LockoutTab org={org} />}
      {tab === 'legal' && <LegalTab org={org} />}
      {tab === 'notifications' && <NotificationsTab org={org} />}
      {tab === 'domain' && <DomainTab org={org} />}
    </Modal>
  );
}
