import { getSession } from './session';
import { createProject, createRole, listRoles } from './projects';
import { stepTracker, type Emit, type ExportedRole, type TransferStep } from './transfer';
import type { Project } from './types';

/**
 * Single-project export / import. Unlike the org transfer (which creates a new
 * organization), this recreates one project and its roles inside an EXISTING
 * organization — the one the console is currently working in. Use it to copy a
 * project's role catalogue between orgs or instances without moving anything
 * else.
 */

export const PROJECT_EXPORT_FORMAT = 'zitadel-project-export' as const;
export const PROJECT_EXPORT_VERSION = 1;

export interface ProjectExportFile {
  format: typeof PROJECT_EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  sourceInstance?: string;
  sourceOrg?: { id: string; name?: string };
  project: {
    id: string;
    name: string;
    projectRoleAssertion?: boolean;
    projectRoleCheck?: boolean;
    hasProjectCheck?: boolean;
    privateLabelingSetting?: string;
  };
  roles: ExportedRole[];
}

// ---- Export -----------------------------------------------------------------

export async function exportProject(
  project: Project,
  org: { id: string; name?: string } | undefined,
  onProgress?: Emit,
): Promise<ProjectExportFile> {
  const { add, set } = stepTracker(onProgress);
  const rStep = add({
    id: `roles:${project.id}`,
    label: `Reading roles of “${project.name}”`,
    kind: 'role',
  });
  set(rStep, 'running');
  let roles: Awaited<ReturnType<typeof listRoles>>;
  try {
    roles = await listRoles(project.id, org?.id);
    set(rStep, 'done', `${roles.length} roles`);
  } catch (err) {
    set(rStep, 'error', (err as Error).message);
    throw err;
  }

  return {
    format: PROJECT_EXPORT_FORMAT,
    version: PROJECT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sourceInstance: getSession()?.baseUrl,
    sourceOrg: org,
    project: {
      id: project.id,
      name: project.name,
      projectRoleAssertion: project.projectRoleAssertion,
      projectRoleCheck: project.projectRoleCheck,
      hasProjectCheck: project.hasProjectCheck,
      privateLabelingSetting: project.privateLabelingSetting,
    },
    roles: roles.map((r) => ({ key: r.key, displayName: r.displayName, group: r.group })),
  };
}

/** Triggers a browser download of the export as pretty-printed JSON. Returns the filename. */
export function downloadProjectExport(data: ProjectExportFile): string {
  const slug =
    data.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') ||
    'project';
  const filename = `${slug}-project-export-${data.exportedAt.slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

export function parseProjectExport(text: string): ProjectExportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  const d = raw as Partial<ProjectExportFile>;
  if (!d || d.format !== PROJECT_EXPORT_FORMAT) {
    throw new Error('Not a ZITADEL project export file (missing format marker).');
  }
  if (typeof d.version !== 'number' || d.version < 1 || d.version > PROJECT_EXPORT_VERSION) {
    throw new Error(
      `Unsupported export version ${d.version} — this build reads v1–v${PROJECT_EXPORT_VERSION}.`,
    );
  }
  if (!d.project?.name || !Array.isArray(d.roles)) {
    throw new Error('Export file is incomplete (project or roles section missing).');
  }
  return d as ProjectExportFile;
}

// ---- Import -----------------------------------------------------------------

export interface ProjectImportOptions {
  /** Existing organization the project is created in. */
  orgId: string;
  /** Name for the recreated project (defaults to the exported name in the UI). */
  projectName: string;
  includeRoles: boolean;
}

export interface ProjectImportResult {
  projectId: string;
  projectName: string;
  steps: TransferStep[];
}

/**
 * Recreates the exported project inside an existing org on the currently
 * connected instance. Role failures are recorded on their step and the import
 * continues (same best-effort contract as the org import); only the project
 * creation itself is fatal.
 */
export async function importProject(
  data: ProjectExportFile,
  opts: ProjectImportOptions,
  onProgress: Emit,
): Promise<ProjectImportResult> {
  const { steps, add, set } = stepTracker(onProgress);

  const pStep = add({
    id: `p:${data.project.id}`,
    label: `Project “${opts.projectName}”`,
    kind: 'project',
  });
  set(pStep, 'running');
  let newProjectId: string;
  try {
    const created = await createProject(
      {
        name: opts.projectName,
        projectRoleAssertion: data.project.projectRoleAssertion,
        projectRoleCheck: data.project.projectRoleCheck,
        hasProjectCheck: data.project.hasProjectCheck,
        privateLabelingSetting: data.project.privateLabelingSetting,
      },
      opts.orgId,
    );
    newProjectId = created.id;
    set(pStep, 'done', `id ${newProjectId}`);
  } catch (err) {
    set(pStep, 'error', (err as Error).message);
    throw err;
  }

  if (opts.includeRoles) {
    for (const role of data.roles) {
      const rStep = add({ id: `r:${role.key}`, label: `Role “${role.key}”`, kind: 'role' });
      set(rStep, 'running');
      try {
        await createRole(
          newProjectId,
          { roleKey: role.key, displayName: role.displayName, group: role.group },
          opts.orgId,
        );
        set(rStep, 'done');
      } catch (err) {
        set(rStep, 'error', (err as Error).message);
      }
    }
  }

  return { projectId: newProjectId, projectName: opts.projectName, steps };
}
