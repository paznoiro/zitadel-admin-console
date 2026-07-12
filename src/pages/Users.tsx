import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users as UsersIcon,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  Mail,
  Pencil,
  Bot,
  FileDown,
  ShieldCheck,
} from 'lucide-react';
import { deactivateUser, deleteUser, listUsers, reactivateUser } from '../api/users';
import { listProjects, listRoles } from '../api/projects';
import {
  listUserGrants,
  createUserGrant,
  updateUserGrant,
  deleteUserGrant,
} from '../api/grants';
import { exportUsers } from '../lib/xlsxUtils';
import type { User } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';
import { UserFormOverlay } from '../components/UserFormOverlay';
import { MachineUserFormOverlay } from '../components/MachineUserFormOverlay';
import { Modal } from '../components/Modal';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBox,
  HintWrap,
  Input,
  PageHeader,
  Spinner,
  Select,
  Field,
} from '../components/ui';

export default function Users() {
  const { activeOrgId, orgs } = useAuth();
  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'human' | 'machine'>('human');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [machineEditTarget, setMachineEditTarget] = useState<User | null>(null);

  const [page, setPage] = useState(1);
  const limit = 50;
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkRolesModalOpen, setBulkRolesModalOpen] = useState(false);

  // Reset page and selection when tab, search, or activeOrgId changes
  useEffect(() => {
    setPage(1);
    setSelectedUserIds(new Set());
  }, [tab, search, activeOrgId]);

  const usersQ = useQuery({
    queryKey: ['users', activeOrgId, search, tab, page],
    queryFn: () =>
      listUsers({
        orgId: activeOrgId ?? undefined,
        query: search,
        limit,
        offset: (page - 1) * limit,
        type: tab,
      }),
    enabled: !!activeOrgId,
  });

  const totalPages = Math.max(1, Math.ceil((usersQ.data?.total ?? 0) / limit));

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      toast.success('User deleted');
      invalidate();
    },
    onError: (e: Error) => toast.error('Could not delete user', e.message),
  });

  const toggleM = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? deactivateUser(id) : reactivateUser(id),
    onSuccess: () => {
      toast.success('User updated');
      invalidate();
    },
    onError: (e: Error) => toast.error('Could not update user', e.message),
  });

  async function onDelete(id: string, label: string) {
    const ok = await confirm({
      title: 'Delete user',
      message: (
        <>
          Permanently delete <strong className="text-white">{label}</strong>?
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteM.mutate(id);
  }

  const users = usersQ.data?.users ?? [];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={
          activeOrg
            ? `${usersQ.data?.total ?? 0} in "${activeOrg.name}"`
            : 'Select an organization first.'
        }
        icon={<UsersIcon className="size-5" />}
        actions={
          <>
            <Link to="/bulk-users">
              <Button variant="ghost" icon={<Upload className="size-4" />}>
                Bulk Import
              </Button>
            </Link>
            <Button
              variant="ghost"
              icon={<FileDown className="size-4" />}
              onClick={() =>
                exportUsers(
                  users,
                  `users-${activeOrg?.name ?? 'export'}-${new Date().toISOString().slice(0, 10)}.xlsx`,
                )
              }
              disabled={users.length === 0}
            >
              Export
            </Button>
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => setCreating(true)}
              disabled={!activeOrgId}
            >
              {tab === 'machine' ? 'New Account' : 'New User'}
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 w-fit">
        {([
          { key: 'human', label: 'Human', icon: <UsersIcon className="size-3.5" /> },
          { key: 'machine', label: 'Service Accounts', icon: <Bot className="size-3.5" /> },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setSearch(''); }}
            className={
              tab === key
                ? 'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white bg-white/10 border border-white/15 shadow-sm transition'
                : 'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-ink-dim)] hover:text-white hover:bg-white/5 transition'
            }
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-dim)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, username or email…"
          className="pl-9"
        />
      </div>

      {/* Bulk Action Bar */}
      {selectedUserIds.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 fade-up">
          <div className="flex items-center gap-2 text-sm text-sky-200">
            <span className="font-semibold">{selectedUserIds.size}</span> users selected
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedUserIds(new Set())}
            >
              Clear Selection
            </Button>
            <Button
              size="sm"
              icon={<ShieldCheck className="size-4" />}
              onClick={() => setBulkRolesModalOpen(true)}
            >
              Set Roles
            </Button>
          </div>
        </div>
      )}

      {!activeOrgId ? (
        <div className="glass">
          <EmptyState icon={<UsersIcon className="size-6" />} title="No organization selected" />
        </div>
      ) : usersQ.isLoading ? (
        <Spinner />
      ) : usersQ.isError ? (
        <ErrorBox error={usersQ.error} />
      ) : users.length === 0 ? (
        <div className="glass">
          {tab === 'human' ? (
            <EmptyState
              icon={<UsersIcon className="size-6" />}
              title="No human users"
              description="Add users individually or import many at once from a CSV."
              action={
                <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                  New User
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Bot className="size-6" />}
              title="No service accounts"
              description="Service accounts are machine users created via the ZITADEL console or API."
            />
          )}
        </div>
      ) : (
        <div className="glass divide-y divide-white/8 p-0">
          <div className="flex items-center px-4 py-2.5 bg-white/[0.02] text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-dim)]">
            <div className="mr-3 flex items-center">
              <input
                type="checkbox"
                checked={users.length > 0 && users.every((u) => selectedUserIds.has(u.userId))}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedUserIds(new Set(users.map((u) => u.userId)));
                  } else {
                    setSelectedUserIds(new Set());
                  }
                }}
                className="size-4 rounded border-white/10 bg-white/5 text-[var(--color-accent)] accent-[var(--color-accent)] focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
            </div>
            <span className="flex-1">User Details</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-white/8">
            {users.map((u) => {
              const active = u.state === 'USER_STATE_ACTIVE';
              const isMachine = tab === 'machine';
              const name = isMachine
                ? u.machine?.name || u.username || u.userId
                : [u.human?.profile?.givenName, u.human?.profile?.familyName]
                    .filter(Boolean)
                    .join(' ') || u.username || u.userId;
              const subtitle = isMachine
                ? u.machine?.description || u.preferredLoginName || u.username
                : u.human?.email?.email ?? u.preferredLoginName ?? u.username;
              const hasEmail = !isMachine && !!u.human?.email?.email;
              const isSelected = selectedUserIds.has(u.userId);
              return (
                <div key={u.userId} className="group flex items-center px-4 py-3 hover:bg-white/4">
                  <div className="mr-3 flex items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        setSelectedUserIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) {
                            next.add(u.userId);
                          } else {
                            next.delete(u.userId);
                          }
                          return next;
                        });
                      }}
                      className="size-4 rounded border-white/10 bg-white/5 text-[var(--color-accent)] accent-[var(--color-accent)] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                  </div>
                  <div
                    className={
                      isMachine
                        ? 'grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 text-sm font-semibold text-white'
                        : 'grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/20 text-sm font-semibold text-white'
                    }
                  >
                    {isMachine ? <Bot className="size-4" /> : name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 ml-3">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-white">{name}</p>
                      <Badge tone={active ? 'good' : 'warn'}>
                        {(u.state ?? 'UNKNOWN').replace('USER_STATE_', '')}
                      </Badge>
                    </div>
                    {subtitle && (
                      <p className="flex items-center gap-1.5 truncate text-xs text-[var(--color-ink-dim)]">
                        {hasEmail && <Mail className="size-3" />}
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => isMachine ? setMachineEditTarget(u) : setEditTarget(u)}
                    title="Edit"
                    className="rounded-lg p-2 text-[var(--color-ink-dim)] opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <HintWrap hint={active ? 'POST /v2/users/{id}/deactivate' : 'POST /v2/users/{id}/reactivate'}>
                    <button
                      onClick={() => toggleM.mutate({ id: u.userId, active })}
                      title={active ? 'Deactivate' : 'Activate'}
                      className="rounded-lg p-2 text-[var(--color-ink-dim)] opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                    >
                      {active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                    </button>
                  </HintWrap>
                  <HintWrap hint="DELETE /v2/users/{id}">
                    <button
                      onClick={() => onDelete(u.userId, name)}
                      className="rounded-lg p-2 text-[var(--color-ink-dim)] opacity-0 transition hover:bg-rose-500/10 hover:text-rose-300 group-hover:opacity-100"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </HintWrap>
                </div>
              );
            })}
          </div>
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-white/[0.01]">
              <div className="flex flex-1 justify-between sm:hidden">
                <Button
                  variant="ghost"
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-[var(--color-ink-dim)]">
                    Showing <span className="font-medium text-white">{Math.min((page - 1) * limit + 1, usersQ.data?.total ?? 0)}</span> to <span className="font-medium text-white">{Math.min(page * limit, usersQ.data?.total ?? 0)}</span> of{' '}
                    <span className="font-medium text-white">{usersQ.data?.total ?? 0}</span> results
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-3 text-xs font-medium text-[var(--color-ink-dim)]">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page === totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {creating && activeOrgId && tab === 'human' && (
        <UserFormOverlay
          orgId={activeOrgId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            invalidate();
          }}
        />
      )}
      {creating && activeOrgId && tab === 'machine' && (
        <MachineUserFormOverlay
          orgId={activeOrgId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            invalidate();
          }}
        />
      )}

      {editTarget && activeOrgId && (
        <UserFormOverlay
          orgId={activeOrgId}
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            invalidate();
          }}
        />
      )}
      {machineEditTarget && activeOrgId && (
        <MachineUserFormOverlay
          orgId={activeOrgId}
          user={machineEditTarget}
          onClose={() => setMachineEditTarget(null)}
          onSaved={() => {
            setMachineEditTarget(null);
            invalidate();
          }}
        />
      )}

      <BulkSetRolesModal
        open={bulkRolesModalOpen}
        onClose={() => setBulkRolesModalOpen(false)}
        selectedUserIds={selectedUserIds}
        activeOrgId={activeOrgId}
        onSaved={() => {
          setBulkRolesModalOpen(false);
          setSelectedUserIds(new Set());
          invalidate();
        }}
      />
    </>
  );
}

function BulkSetRolesModal({
  open,
  onClose,
  selectedUserIds,
  activeOrgId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  selectedUserIds: Set<string>;
  activeOrgId: string | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedRoleKeys, setSelectedRoleKeys] = useState<string[]>([]);

  const projectsQ = useQuery({
    queryKey: ['bulk-projects', activeOrgId],
    queryFn: () => listProjects(undefined, activeOrgId ?? undefined),
    enabled: open && !!activeOrgId,
  });

  const rolesQ = useQuery({
    queryKey: ['bulk-project-roles', selectedProjectId],
    queryFn: () => listRoles(selectedProjectId),
    enabled: open && !!selectedProjectId,
  });

  const saveM = useMutation({
    mutationFn: async () => {
      const userIds = Array.from(selectedUserIds);
      await Promise.all(
        userIds.map(async (userId) => {
          const grants = await listUserGrants(userId);
          const existingGrant = grants.find((g) => g.projectId === selectedProjectId);
          if (existingGrant) {
            if (selectedRoleKeys.length === 0) {
              await deleteUserGrant(userId, existingGrant.id);
            } else {
              await updateUserGrant(userId, existingGrant.id, selectedRoleKeys);
            }
          } else {
            if (selectedRoleKeys.length > 0) {
              await createUserGrant(userId, selectedProjectId, selectedRoleKeys, activeOrgId ?? undefined);
            }
          }
        })
      );
    },
    onSuccess: () => {
      toast.success(`Roles updated for ${selectedUserIds.size} users.`);
      onSaved();
    },
    onError: (e: Error) => {
      toast.error('Failed to assign roles', e.message);
    },
  });

  const handleToggleRole = (roleKey: string) => {
    setSelectedRoleKeys((prev) =>
      prev.includes(roleKey) ? prev.filter((k) => k !== roleKey) : [...prev, roleKey]
    );
  };

  const projects = projectsQ.data ?? [];
  const roles = rolesQ.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign Roles"
      description={`Setting roles for ${selectedUserIds.size} selected users`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saveM.isPending}
            disabled={!selectedProjectId}
            onClick={() => saveM.mutate()}
          >
            Apply Roles
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-[var(--color-ink-dim)]">
          Choose a project to assign roles. For each user, we will create a project grant (if they don't have one) or update their existing grant for that project.
        </p>

        <Field label="Project" required>
          {projectsQ.isLoading ? (
            <Spinner />
          ) : projectsQ.isError ? (
            <ErrorBox error={projectsQ.error} />
          ) : (
            <Select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setSelectedRoleKeys([]);
              }}
            >
              <option value="">Choose a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {selectedProjectId && (
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
              Roles
            </label>
            {rolesQ.isLoading ? (
              <Spinner />
            ) : roles.length === 0 ? (
              <p className="text-xs italic text-[var(--color-ink-dim)]">
                No roles defined in this project.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {roles.map((role) => {
                  const active = selectedRoleKeys.includes(role.key);
                  return (
                    <button
                      key={role.key}
                      onClick={() => handleToggleRole(role.key)}
                      title={role.displayName}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition ${
                        active
                          ? 'border-[rgba(124,92,255,0.6)] bg-[rgba(124,92,255,0.25)] text-white'
                          : 'border-white/12 bg-white/5 text-[var(--color-ink)] hover:bg-white/10'
                      }`}
                    >
                      {role.key}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
