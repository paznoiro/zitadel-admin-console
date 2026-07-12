import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Bot, Shield, Check } from 'lucide-react';
import { addMachineUser, updateMachineUser } from '../api/users';
import { listProjects, listRoles } from '../api/projects';
import {
  listUserGrants,
  createUserGrant,
  updateUserGrant,
  deleteUserGrant,
} from '../api/grants';
import type { User, Project, ProjectRole } from '../api/types';
import { Button, Field, Input, Spinner, ErrorBox } from './ui';
import { useToast } from './Toast';

type LocalGrant = {
  id?: string;        // set for grants already in ZITADEL; undefined for new ones
  projectId: string;
  projectName: string;
  roleKeys: string[];
};

export function MachineUserFormOverlay({
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

  const [name, setName] = useState(user?.machine?.name ?? '');
  const [description, setDescription] = useState(user?.machine?.description ?? '');
  const [username, setUsername] = useState(user?.username ?? '');

  // ── Grants State ────────────────────────────────────────────────────────────
  const [localGrants, setLocalGrants] = useState<LocalGrant[]>([]);
  const [grantsReady, setGrantsReady] = useState(!isEdit);

  // Fetch existing grants for the user
  const existingGrantsQ = useQuery({
    queryKey: ['userGrants', user?.userId],
    queryFn: () => listUserGrants(user!.userId),
    enabled: isEdit,
  });

  // Always load projects
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

  // ── Save Mutation ──────────────────────────────────────────────────────────
  const saveM = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        // Update user profile info
        await updateMachineUser(user.userId, { name: name.trim(), description: description.trim() });
        
        // Save grants differences
        const original = existingGrantsQ.data ?? [];
        const origMap = new Map(original.map((g) => [g.id, g]));
        const localMap = new Map(localGrants.filter((g) => g.id).map((g) => [g.id!, g]));

        const toCreate = localGrants.filter((g) => !g.id);
        const toUpdate = localGrants.filter((g) => {
          const orig = g.id ? origMap.get(g.id) : undefined;
          return !!orig && [...g.roleKeys].sort().join() !== [...orig.roleKeys].sort().join();
        });
        const toDelete = original.filter((g) => !localMap.has(g.id));

        await Promise.all([
          ...toCreate.map((g) => createUserGrant(user.userId, g.projectId, g.roleKeys, orgId)),
          ...toDelete.map((g) => deleteUserGrant(user.userId, g.id)),
          ...toUpdate.map((g) => updateUserGrant(user.userId, g.id!, g.roleKeys)),
        ]);
      } else {
        // Create new machine user
        const { userId } = await addMachineUser({
          orgId,
          username: username.trim() || name.trim(),
          name: name.trim(),
          description: description.trim(),
        });

        // Add grants for the newly created user
        if (localGrants.length > 0) {
          await Promise.all(
            localGrants.map((g) => createUserGrant(userId, g.projectId, g.roleKeys, orgId)),
          );
        }
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Service account updated' : 'Service account created');
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['userGrants'] });
      onSaved();
    },
    onError: (e: Error) => toast.error(isEdit ? 'Could not update' : 'Could not create', e.message),
  });

  const canSave = !!name.trim();
  const userName = isEdit ? user.machine?.name || user.username || user.userId : '';
  const totalAssigned = localGrants.reduce((n, g) => n + g.roleKeys.length, 0);

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

        {/* Header */}
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
            <Bot size={20} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'white', lineHeight: 1.3 }}>
              {isEdit ? `Edit — ${userName}` : 'New Service Account'}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(154,163,199,0.75)' }}>
              {isEdit ? 'Update profile and role assignments' : 'Fill in profile and assign project roles'}
            </p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left panel: Profile form */}
          <div style={{
            width: '42%', minWidth: 300, flexShrink: 0,
            overflowY: 'auto',
            padding: '22px 24px',
            borderRight: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <Label>Profile</Label>

            <Field label="Name" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-service-account"
                autoFocus
              />
            </Field>

            {!isEdit && (
              <Field label="Username" hint="Defaults to name if left empty">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="my-service-account"
                />
              </Field>
            )}

            <Field label="Description">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </Field>
          </div>

          {/* Right panel: Roles assignment */}
          <div style={{
            flex: 1, overflowY: 'auto',
            background: 'rgba(3,4,10,0.25)',
            padding: '22px 24px',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'between' }}>
              <Label>Project Roles</Label>
              {totalAssigned > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: 'rgba(167,139,250,1)',
                  background: 'rgba(124,92,255,0.12)', border: '1px solid rgba(124,92,255,0.22)',
                  borderRadius: 100, padding: '1px 8px', textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {totalAssigned} assigned
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

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
          padding: '14px 24px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={saveM.isPending}
            disabled={!canSave}
            onClick={() => saveM.mutate()}
            hint={isEdit
              ? 'PUT /v2/users/machine/{id}'
              : 'POST /v2/users/machine'}
          >
            {isEdit ? 'Save Changes' : 'Create Account'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── ProjectRolesCard ──────────────────────────────────────────────────────────
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
