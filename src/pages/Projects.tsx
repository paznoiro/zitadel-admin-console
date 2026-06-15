import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Search, Trash2, ChevronRight, ShieldCheck, Pencil } from 'lucide-react';
import { createProject, deleteProject, listProjects, updateProject } from '../api/projects';
import type { Project } from '../api/types';
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
  HintWrap,
  Input,
  PageHeader,
  Spinner,
} from '../components/ui';

function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Projects() {
  const { activeOrgId, orgs } = useAuth();
  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [creating, setCreating] = useState(false);
  const blankForm = {
    name: '',
    projectRoleAssertion: false,
    projectRoleCheck: false,
    hasProjectCheck: false,
  };
  const [form, setForm] = useState(blankForm);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState(blankForm);

  const projectsQ = useQuery({
    queryKey: ['projects', activeOrgId, debouncedSearch],
    queryFn: () => listProjects(debouncedSearch || undefined, activeOrgId ?? undefined),
    enabled: !!activeOrgId,
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['applications'] });
  }

  // ZITADEL's read projections are eventually consistent: a list refetched
  // immediately after a write can still show the pre-write state. We patch the
  // cache optimistically for an instant-correct UI, then reconcile with the
  // server once the projection has caught up.
  function patchProjectsCache(fn: (list: Project[]) => Project[]) {
    qc.setQueriesData<Project[]>({ queryKey: ['projects'] }, (old) =>
      old ? fn(old) : old,
    );
  }
  function reconcileSoon() {
    setTimeout(invalidateAll, 1200);
  }

  const createM = useMutation({
    mutationFn: () => createProject(form, activeOrgId ?? undefined),
    onSuccess: (created) => {
      toast.success('Project created', form.name);
      setCreating(false);
      setForm({ name: '', projectRoleAssertion: false, projectRoleCheck: false, hasProjectCheck: false });
      patchProjectsCache((list) =>
        list.some((p) => p.id === created.id) ? list : [created, ...list],
      );
      reconcileSoon();
    },
    onError: (e: Error) => toast.error('Could not create project', e.message),
  });

  const updateM = useMutation({
    mutationFn: () => updateProject(editTarget!.id, editForm),
    onSuccess: () => {
      const id = editTarget!.id;
      toast.success('Project updated', editForm.name);
      setEditTarget(null);
      patchProjectsCache((list) =>
        list.map((p) => (p.id === id ? { ...p, ...editForm } : p)),
      );
      reconcileSoon();
    },
    onError: (e: Error) => toast.error('Could not update project', e.message),
  });

  function openEdit(p: Project) {
    setEditTarget(p);
    setEditForm({
      name: p.name,
      projectRoleAssertion: !!p.projectRoleAssertion,
      projectRoleCheck: !!p.projectRoleCheck,
      hasProjectCheck: !!p.hasProjectCheck,
    });
  }

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: (_data, id) => {
      toast.success('Project deleted');
      patchProjectsCache((list) => list.filter((p) => p.id !== id));
      reconcileSoon();
    },
    onError: (e: Error) => toast.error('Could not delete project', e.message),
  });

  async function onDelete(id: string, label: string) {
    const ok = await confirm({
      title: 'Delete project',
      message: (
        <>
          Delete <strong className="text-white">{label}</strong> and its roles and applications?
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteM.mutate(id);
  }

  const projects = projectsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={activeOrg ? `In “${activeOrg.name}”` : 'Select an organization first.'}
        icon={<Boxes className="size-5" />}
        actions={
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => setCreating(true)}
            disabled={!activeOrgId}
          >
            New Project
          </Button>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-dim)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          className="pl-9"
        />
      </div>

      {!activeOrgId ? (
        <div className="glass">
          <EmptyState
            icon={<Boxes className="size-6" />}
            title="No organization selected"
            description="Pick an organization from the switcher to view its projects."
          />
        </div>
      ) : projectsQ.isLoading ? (
        <Spinner />
      ) : projectsQ.isError ? (
        <ErrorBox error={projectsQ.error} />
      ) : projects.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon={<Boxes className="size-6" />}
            title="No projects yet"
            description="Projects group your applications and the roles users can hold."
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                New Project
              </Button>
            }
          />
        </div>
      ) : (
        <div className="glass divide-y divide-white/8 overflow-hidden p-0">
          {projects.map((p) => (
            <div
              key={p.id}
              className="group flex cursor-pointer items-center gap-4 px-4 py-3.5 transition hover:bg-white/4"
              onClick={() => navigate(`/projects/${p.id}`, { state: { name: p.name, projectRoleCheck: p.projectRoleCheck } })}
            >
              <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-violet-500/20">
                <Boxes className="size-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-medium text-white">{p.name}</h3>
                  {p.projectRoleCheck && (
                    <Badge tone="accent">
                      <ShieldCheck className="size-3" /> Role check
                    </Badge>
                  )}
                </div>
                <p className="truncate font-mono text-[11px] text-[var(--color-ink-dim)]">{p.id}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(p);
                }}
                title="Edit project"
                className="rounded-lg p-2 text-[var(--color-ink-dim)] opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
              >
                <Pencil className="size-4" />
              </button>
              <HintWrap hint="POST project.v2/DeleteProject">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p.id, p.name);
                  }}
                  title="Delete project"
                  className="rounded-lg p-2 text-[var(--color-ink-dim)] opacity-0 transition hover:bg-rose-500/10 hover:text-rose-300 group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </HintWrap>
              <ChevronRight className="size-4 text-[var(--color-ink-dim)]" />
            </div>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create project"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button loading={createM.isPending} disabled={!form.name.trim()} onClick={() => createM.mutate()} hint="POST project.v2/CreateProject">
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Project name" required>
            <Input
              value={form.name}
              autoFocus
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="My Project"
            />
          </Field>
          <div className="space-y-2">
            <Checkbox
              label="Return user roles during authentication"
              checked={form.projectRoleAssertion}
              onChange={(v) => setForm((f) => ({ ...f, projectRoleAssertion: v }))}
            />
            <Checkbox
              label="Check for project roles on authentication"
              checked={form.projectRoleCheck}
              onChange={(v) => setForm((f) => ({ ...f, projectRoleCheck: v }))}
            />
            <Checkbox
              label="Check that the user has a grant to this project"
              checked={form.hasProjectCheck}
              onChange={(v) => setForm((f) => ({ ...f, hasProjectCheck: v }))}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit project"
        description={editTarget?.id}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={updateM.isPending}
              disabled={!editForm.name.trim()}
              onClick={() => updateM.mutate()}
              hint="PUT /management/v1/projects/{id}"
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Project name" required>
            <Input
              value={editForm.name}
              autoFocus
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <div className="space-y-2">
            <Checkbox
              label="Return user roles during authentication"
              checked={editForm.projectRoleAssertion}
              onChange={(v) => setEditForm((f) => ({ ...f, projectRoleAssertion: v }))}
            />
            <Checkbox
              label="Check for project roles on authentication"
              checked={editForm.projectRoleCheck}
              onChange={(v) => setEditForm((f) => ({ ...f, projectRoleCheck: v }))}
            />
            <Checkbox
              label="Check that the user has a grant to this project"
              checked={editForm.hasProjectCheck}
              onChange={(v) => setEditForm((f) => ({ ...f, hasProjectCheck: v }))}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 text-sm text-[var(--color-ink)]">
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
