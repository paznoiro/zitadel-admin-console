import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Shield, Check } from 'lucide-react';
import { addHumanUser, updateHumanUser, setUserPassword } from '../api/users';
import { listProjects, listRoles } from '../api/projects';
import {
  listUserGrants,
  createUserGrant,
  updateUserGrant,
  deleteUserGrant,
} from '../api/grants';
import type { User } from '../api/types';
import type { Project, ProjectRole } from '../api/types';
import { Button, Field, Input, Spinner, ErrorBox } from './ui';
import { useToast } from './Toast';

// ── Types ─────────────────────────────────────────────────────────────────────

type LocalGrant = {
  id?: string;        // set for grants already in ZITADEL; undefined for new ones
  projectId: string;
  projectName: string;
  roleKeys: string[];
};

type ProfileForm = {
  givenName: string;
  familyName: string;
  email: string;
  username: string;
  password: string;
  phone: string;
  emailVerified: boolean;
  changeRequired: boolean;
};

// ── Main overlay ──────────────────────────────────────────────────────────────

export function UserFormOverlay({
  orgId,
  user,
  onClose,
  onSaved,
}: {
  orgId: string;
  user?: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const toast = useToast();
  const qc = useQueryClient();
  const [mounted, setMounted] = useState(false);

  // ── Profile ────────────────────────────────────────────────────────────────
  const originalEmail = user?.human?.email?.email ?? '';
  const [form, setForm] = useState<ProfileForm>({
    givenName: user?.human?.profile?.givenName ?? '',
    familyName: user?.human?.profile?.familyName ?? '',
    email: originalEmail,
    username: user?.username ?? '',
    password: '',
    phone: user?.human?.phone?.phone ?? '',
    emailVerified: true,
    changeRequired: true,
  });

  // ── Grants ─────────────────────────────────────────────────────────────────
  const [localGrants, setLocalGrants] = useState<LocalGrant[]>([]);
  const [grantsReady, setGrantsReady] = useState(!isEdit);

  // ── Queries ────────────────────────────────────────────────────────────────

  const existingGrantsQ = useQuery({
    queryKey: ['userGrants', user?.userId],
    queryFn: () => listUserGrants(user!.userId),
    enabled: isEdit,
  });

  // Always load projects — they're shown in the right panel immediately
  const projectsQ = useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => listProjects(undefined, orgId),
  });

  // Seed localGrants from server (edit mode only, once)
  useEffect(() => {
    if (existingGrantsQ.data && !grantsReady) {
      setLocalGrants(
        existingGrantsQ.data.map((g) => ({
          id: g.id,
          projectId: g.projectId,
          projectName: g.projectName ?? g.projectId,
          roleKeys: [...g.roleKeys],
        })),
      );
      setGrantsReady(true);
    }
  }, [existingGrantsQ.data, grantsReady]);

  // Mount animation + ESC
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // ── Toggle a role chip ─────────────────────────────────────────────────────

  function toggleRole(projectId: string, projectName: string, roleKey: string) {
    setLocalGrants((prev) => {
      const idx = prev.findIndex((g) => g.projectId === projectId);
      if (idx >= 0) {
        const keys = new Set(prev[idx].roleKeys);
        if (keys.has(roleKey)) keys.delete(roleKey);
        else keys.add(roleKey);
        // If no roles remain, remove the entry (save diff will handle deletion)
        if (keys.size === 0) return prev.filter((_, i) => i !== idx);
        return prev.map((g, i) => (i === idx ? { ...g, roleKeys: [...keys] } : g));
      }
      return [...prev, { projectId, projectName, roleKeys: [roleKey] }];
    });
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const saveM = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        const emailChanged = form.email.trim() !== originalEmail && !!form.email.trim();
        await updateHumanUser(user.userId, {
          givenName: form.givenName.trim(),
          familyName: form.familyName.trim(),
          email: emailChanged ? form.email.trim() : undefined,
          emailVerified: form.emailVerified,
          phone: form.phone.trim() || undefined,
        });

        if (form.password.trim()) {
          await setUserPassword(user.userId, form.password.trim(), form.changeRequired);
        }

        const original = existingGrantsQ.data ?? [];
        const origById = new Map(original.map((g) => [g.id, g]));
        const localById = new Map(
          localGrants.filter((g) => g.id).map((g) => [g.id!, g]),
        );
        const toCreate = localGrants.filter((g) => !g.id);
        const toDelete = original.filter((g) => !localById.has(g.id));
        const toUpdate = localGrants.filter((g) => {
          if (!g.id) return false;
          const orig = origById.get(g.id);
          return !!orig && [...g.roleKeys].sort().join() !== [...orig.roleKeys].sort().join();
        });

        await Promise.allSettled([
          ...toCreate.map((g) => createUserGrant(user.userId, g.projectId, g.roleKeys, orgId)),
          ...toDelete.map((g) => deleteUserGrant(user.userId, g.id)),
          ...toUpdate.map((g) => updateUserGrant(user.userId, g.id!, g.roleKeys)),
        ]);
      } else {
        const { userId } = await addHumanUser({
          orgId,
          givenName: form.givenName.trim(),
          familyName: form.familyName.trim(),
          email: form.email.trim(),
          username: form.username.trim() || undefined,
          password: form.password.trim() || undefined,
          changeRequired: form.changeRequired,
          emailVerified: form.emailVerified,
          phone: form.phone.trim() || undefined,
        });
        if (localGrants.length > 0) {
          await Promise.allSettled(
            localGrants.map((g) => createUserGrant(userId, g.projectId, g.roleKeys, orgId)),
          );
        }
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? 'User saved' : 'User created');
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['userGrants'] });
      onSaved();
    },
    onError: (e: Error) =>
      toast.error(isEdit ? 'Could not save' : 'Could not create user', e.message),
  });

  const saveError = saveM.error ? (saveM.error as Error).message : null;

  const canSave =
    form.givenName.trim() && form.familyName.trim() && (isEdit || !!form.email.trim());

  const userName = isEdit
    ? [user.human?.profile?.givenName, user.human?.profile?.familyName]
        .filter(Boolean)
        .join(' ') ||
      user.username ||
      user.userId
    : '';

  const totalAssigned = localGrants.reduce((n, g) => n + g.roleKeys.length, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(3,5,14,0.88)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          opacity: mounted ? 1 : 0, transition: 'opacity 0.28s ease',
        }}
      />

      {/* Card */}
      <div
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 1060, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(155deg, rgba(14,10,36,0.98) 0%, rgba(7,10,24,0.99) 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 22,
          boxShadow: '0 48px 120px rgba(0,0,0,0.85), 0 0 0 1px rgba(124,92,255,0.12), inset 0 1px 0 rgba(255,255,255,0.07)',
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'none' : 'translateY(14px) scale(0.985)',
          transition: 'opacity 0.32s ease, transform 0.32s ease',
          overflow: 'hidden',
        }}
      >
        {/* Shimmer line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent 0%, rgba(124,92,255,0.7) 35%, rgba(34,211,238,0.5) 65%, transparent 100%)',
        }} />

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 13, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(124,92,255,0.45), rgba(34,211,238,0.25))',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 4px 14px rgba(124,92,255,0.3)',
            display: 'grid', placeItems: 'center',
            fontSize: 15, fontWeight: 700, color: 'white',
          }}>
            {isEdit ? (userName[0] || 'U').toUpperCase() : '+'}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'white', lineHeight: 1.3 }}>
              {isEdit ? `Edit — ${userName}` : 'New User'}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(154,163,199,0.75)' }}>
              {isEdit ? 'Update profile and role assignments' : 'Fill in profile and assign project roles'}
            </p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* Left — Profile form */}
          <div style={{
            width: '42%', minWidth: 300, flexShrink: 0,
            overflowY: 'auto',
            padding: '22px 24px',
            borderRight: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <Label>Profile</Label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="First name" required>
                <Input value={form.givenName} autoFocus placeholder="Jane"
                  onChange={(e) => setForm((f) => ({ ...f, givenName: e.target.value }))} />
              </Field>
              <Field label="Last name" required>
                <Input value={form.familyName} placeholder="Doe"
                  onChange={(e) => setForm((f) => ({ ...f, familyName: e.target.value }))} />
              </Field>
            </div>

            <Field
              label="Email"
              required={!isEdit}
              hint={isEdit && form.email !== originalEmail ? 'Changing email triggers re-verification.' : undefined}
            >
              <Input type="email" value={form.email} placeholder="jane@example.com"
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>

            {(!isEdit || form.email !== originalEmail) && (
              <VerifiedCheckbox
                checked={form.emailVerified}
                isEdit={isEdit}
                onChange={(v) => setForm((f) => ({ ...f, emailVerified: v }))}
              />
            )}

            {!isEdit && (
              <Field label="Username" hint="Defaults to email.">
                <Input value={form.username} placeholder="janedoe"
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
              </Field>
            )}

            <Field
              label={isEdit ? 'Set new password' : 'Initial password'}
              hint={isEdit ? 'Leave blank to keep current password.' : undefined}
            >
              <Input type="password" value={form.password} placeholder="optional"
                onChange={(e) => {
                  setForm((f) => ({ ...f, password: e.target.value }));
                  saveM.reset();
                }} />
            </Field>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--color-ink)', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={form.changeRequired}
                onChange={(e) => setForm((f) => ({ ...f, changeRequired: e.target.checked }))}
                style={{ width: 15, height: 15, accentColor: 'var(--color-accent)' }}
              />
              Require password change on next login
            </label>

            <Field label="Phone">
              <Input value={form.phone} placeholder="+15550100"
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
          </div>

          {/* Right — Role assignments (all projects shown immediately) */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '22px 24px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <div>
                <Label>Role Assignments</Label>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(154,163,199,0.6)' }}>
                  Click a role to assign or remove it
                </p>
              </div>
              {totalAssigned > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: 'rgba(167,139,250,0.85)',
                  background: 'rgba(124,92,255,0.14)',
                  border: '1px solid rgba(124,92,255,0.25)',
                  borderRadius: 100, padding: '3px 11px',
                }}>
                  {totalAssigned} role{totalAssigned !== 1 ? 's' : ''} assigned
                </span>
              )}
            </div>

            {/* Waiting for grants to load before showing project cards */}
            {isEdit && !grantsReady ? (
              <Spinner />
            ) : projectsQ.isLoading ? (
              <Spinner />
            ) : projectsQ.isError ? (
              <ErrorBox error={projectsQ.error} />
            ) : (projectsQ.data ?? []).length === 0 ? (
              <div style={{
                padding: '32px 20px', textAlign: 'center',
                borderRadius: 14, border: '1px dashed rgba(255,255,255,0.08)',
                color: 'var(--color-ink-dim)', fontSize: 13,
              }}>
                No projects found. Create a project first to assign roles.
              </div>
            ) : (
              (projectsQ.data ?? []).map((project) => {
                const grant = localGrants.find((g) => g.projectId === project.id);
                const assignedKeys = new Set(grant?.roleKeys ?? []);
                return (
                  <ProjectRolesCard
                    key={project.id}
                    project={project}
                    assignedKeys={assignedKeys}
                    isNew={!!grant && !grant.id}
                    onToggle={(roleKey) => toggleRole(project.id, project.name, roleKey)}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        {saveError && (
          <div style={{
            margin: '0 24px 0',
            padding: '10px 14px',
            background: 'rgba(220,38,38,0.12)',
            border: '1px solid rgba(220,38,38,0.3)',
            borderRadius: 10,
            fontSize: 13,
            color: '#fca5a5',
            lineHeight: 1.5,
          }}>
            {saveError}
          </div>
        )}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
          padding: '14px 24px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saveM.isPending} disabled={!canSave} onClick={() => saveM.mutate()}>
            {isEdit ? 'Save Changes' : 'Create User'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── ProjectRolesCard ──────────────────────────────────────────────────────────
// Shows one project with all its role chips. Selected chips glow violet.

function ProjectRolesCard({
  project,
  assignedKeys,
  isNew,
  onToggle,
}: {
  project: Project;
  assignedKeys: Set<string>;
  isNew: boolean;
  onToggle: (roleKey: string) => void;
}) {
  const rolesQ = useQuery({
    queryKey: ['roles', project.id],
    queryFn: () => listRoles(project.id),
  });

  const roles: ProjectRole[] = rolesQ.data ?? [];
  const hasAny = assignedKeys.size > 0;

  return (
    <div style={{
      borderRadius: 14,
      border: hasAny
        ? '1px solid rgba(124,92,255,0.3)'
        : '1px solid rgba(255,255,255,0.08)',
      background: hasAny
        ? 'rgba(124,92,255,0.06)'
        : 'rgba(255,255,255,0.025)',
      overflow: 'hidden',
      transition: 'border-color 0.2s, background 0.2s',
    }}>
      {/* Project header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <Shield
          size={13}
          style={{ color: hasAny ? 'rgba(124,92,255,0.8)' : 'rgba(255,255,255,0.25)', flexShrink: 0 }}
        />
        <span style={{
          flex: 1, fontSize: 13, fontWeight: 600,
          color: hasAny ? 'white' : 'var(--color-ink)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {project.name}
        </span>
        {isNew && (
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'rgba(34,211,238,0.8)',
            background: 'rgba(34,211,238,0.1)',
            border: '1px solid rgba(34,211,238,0.2)',
            borderRadius: 100, padding: '1px 8px',
          }}>
            new
          </span>
        )}
        {hasAny && (
          <span style={{
            fontSize: 11, color: 'rgba(167,139,250,0.8)',
            background: 'rgba(124,92,255,0.15)',
            border: '1px solid rgba(124,92,255,0.2)',
            borderRadius: 100, padding: '1px 9px',
          }}>
            {assignedKeys.size}
          </span>
        )}
      </div>

      {/* Role chips */}
      <div style={{ padding: '12px 16px' }}>
        {rolesQ.isLoading ? (
          <Spinner />
        ) : roles.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-ink-dim)', fontStyle: 'italic' }}>
            No roles defined for this project
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {roles.map((role) => (
              <RoleChip
                key={role.key}
                label={role.key}
                hint={role.displayName && role.displayName !== role.key ? role.displayName : undefined}
                active={assignedKeys.has(role.key)}
                onClick={() => onToggle(role.key)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Role chip ─────────────────────────────────────────────────────────────────

function RoleChip({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={hint}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 13px',
        borderRadius: 100,
        fontSize: 12, fontWeight: 500,
        cursor: 'pointer',
        border: active ? '1px solid rgba(124,92,255,0.6)' : '1px solid rgba(255,255,255,0.12)',
        background: active ? 'rgba(124,92,255,0.25)' : 'rgba(255,255,255,0.05)',
        color: active ? 'rgba(192,169,255,1)' : 'rgba(154,163,199,0.7)',
        boxShadow: active ? '0 0 10px rgba(124,92,255,0.4)' : 'none',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (active) {
          el.style.background = 'rgba(124,92,255,0.35)';
          el.style.boxShadow = '0 0 14px rgba(124,92,255,0.55)';
        } else {
          el.style.borderColor = 'rgba(255,255,255,0.25)';
          el.style.color = 'var(--color-ink)';
          el.style.background = 'rgba(255,255,255,0.09)';
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (active) {
          el.style.background = 'rgba(124,92,255,0.25)';
          el.style.boxShadow = '0 0 10px rgba(124,92,255,0.4)';
        } else {
          el.style.borderColor = 'rgba(255,255,255,0.12)';
          el.style.color = 'rgba(154,163,199,0.7)';
          el.style.background = 'rgba(255,255,255,0.05)';
        }
      }}
    >
      {active && <Check size={11} strokeWidth={2.5} />}
      {label}
    </button>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-ink-dim)' }}>
      {children}
    </p>
  );
}

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: 8, borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-ink-dim)', display: 'flex' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'white'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--color-ink-dim)'; }}
    >
      <X size={20} />
    </button>
  );
}

function VerifiedCheckbox({ checked, isEdit, onChange }: { checked: boolean; isEdit: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--color-ink)', cursor: 'pointer', userSelect: 'none' }}>
      <input
        type="checkbox" checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 15, height: 15, accentColor: 'var(--color-accent)' }}
      />
      {isEdit ? 'Mark new email as verified' : 'Mark email as verified'}
    </label>
  );
}
