import { useState } from 'react';
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
} from 'lucide-react';
import { deactivateUser, deleteUser, listUsers, reactivateUser } from '../api/users';
import { exportUsers } from '../lib/xlsxUtils';
import type { User } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';
import { UserFormOverlay } from '../components/UserFormOverlay';
import { MachineUserFormOverlay } from '../components/MachineUserFormOverlay';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBox,
  HintWrap,
  Input,
  PageHeader,
  Spinner,
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

  const usersQ = useQuery({
    queryKey: ['users', activeOrgId, search, tab],
    queryFn: () =>
      listUsers({ orgId: activeOrgId ?? undefined, query: search, limit: 200, type: tab }),
    enabled: !!activeOrgId,
  });

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
            return (
              <div key={u.userId} className="group flex items-center gap-3 px-4 py-3">
                <div
                  className={
                    isMachine
                      ? 'grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 text-sm font-semibold text-white'
                      : 'grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/20 text-sm font-semibold text-white'
                  }
                >
                  {isMachine ? <Bot className="size-4" /> : name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
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
    </>
  );
}
