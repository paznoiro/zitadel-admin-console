import { getSession } from './session';
import { createAPIApp, createOIDCApp, listApps } from './apps';
import { createProject, createRole, listRoles } from './projects';
import {
  EXPORT_FORMAT as ORG_EXPORT_FORMAT,
  EXPORT_VERSION as ORG_EXPORT_VERSION,
  stepTracker,
  toExportedApp,
  type Emit,
  type ExportedApp,
  type ExportedRole,
  type OrgExportFile,
  type TransferStep,
} from './transfer';
import type { Project } from './types';

/**
 * Single-project export / import. Unlike the org transfer (which creates a new
 * organization), this recreates one project — its roles and applications —
 * inside an EXISTING organization: the one the console is currently working in.
 * Use it to copy a project between orgs or instances without moving anything
 * else.
 */

export const PROJECT_EXPORT_FORMAT = 'zitadel-project-export' as const;
// v1: project + roles. v2 adds the project's applications (OIDC + API config).
export const PROJECT_EXPORT_VERSION = 2;

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
  apps: ExportedApp[];
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

  const aStep = add({
    id: `apps:${project.id}`,
    label: `Reading applications of “${project.name}”`,
    kind: 'app',
  });
  set(aStep, 'running');
  let apps: Awaited<ReturnType<typeof listApps>>;
  try {
    apps = await listApps(project.id, org?.id);
    set(aStep, 'done', `${apps.length} apps`);
  } catch (err) {
    set(aStep, 'error', (err as Error).message);
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
    apps: apps.map(toExportedApp),
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

/**
 * Reads an export file into one or more importable projects. Accepts both this
 * console's file formats: a project export yields exactly one candidate, an
 * ORG export yields one candidate per project it contains (the UI lets the
 * user pick which one to import).
 */
export function parseProjectExports(text: string): ProjectExportFile[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  const d = raw as { format?: string };

  if (d?.format === PROJECT_EXPORT_FORMAT) {
    const f = d as Partial<ProjectExportFile>;
    if (typeof f.version !== 'number' || f.version < 1 || f.version > PROJECT_EXPORT_VERSION) {
      throw new Error(
        `Unsupported export version ${f.version} — this build reads v1–v${PROJECT_EXPORT_VERSION}.`,
      );
    }
    if (!f.project?.name || !Array.isArray(f.roles)) {
      throw new Error('Export file is incomplete (project or roles section missing).');
    }
    // v1 files predate apps — normalize so the importer can rely on the array.
    if (!Array.isArray(f.apps)) f.apps = [];
    return [f as ProjectExportFile];
  }

  if (d?.format === ORG_EXPORT_FORMAT) {
    const o = d as Partial<OrgExportFile>;
    if (typeof o.version !== 'number' || o.version < 1 || o.version > ORG_EXPORT_VERSION) {
      throw new Error(
        `Unsupported org export version ${o.version} — this build reads v1–v${ORG_EXPORT_VERSION}.`,
      );
    }
    if (!Array.isArray(o.projects) || o.projects.length === 0) {
      throw new Error('This org export contains no projects.');
    }
    return o.projects.map((p) => ({
      format: PROJECT_EXPORT_FORMAT,
      version: PROJECT_EXPORT_VERSION,
      exportedAt: o.exportedAt ?? '',
      sourceInstance: o.sourceInstance,
      sourceOrg: o.org,
      project: {
        id: p.id,
        name: p.name,
        projectRoleAssertion: p.projectRoleAssertion,
        projectRoleCheck: p.projectRoleCheck,
        hasProjectCheck: p.hasProjectCheck,
        privateLabelingSetting: p.privateLabelingSetting,
      },
      roles: p.roles ?? [],
      apps: p.apps ?? [],
    }));
  }

  throw new Error('Not a ZITADEL project or org export file (missing format marker).');
}

// ---- Import -----------------------------------------------------------------

export interface ProjectImportOptions {
  /** Existing organization the project is created in. */
  orgId: string;
  /** Name for the recreated project (defaults to the exported name in the UI). */
  projectName: string;
  includeRoles: boolean;
  includeApps: boolean;
}

/**
 * Credentials of a recreated application. The target instance mints fresh
 * ones — secrets cannot be read from the source — so `clientSecret` here is
 * the ONLY time it is visible; it must be copied before the dialog closes.
 * BASIC-auth API apps and BASIC/POST OIDC apps get a secret; NONE/JWT don't.
 */
export interface ImportedProjectApp {
  appId: string;
  name: string;
  type: 'OIDC' | 'API';
  clientId?: string;
  clientSecret?: string;
}

export interface ProjectImportResult {
  projectId: string;
  projectName: string;
  apps: ImportedProjectApp[];
  steps: TransferStep[];
}

/**
 * Recreates the exported project inside an existing org on the currently
 * connected instance. Role/app failures are recorded on their step and the
 * import continues (same best-effort contract as the org import); only the
 * project creation itself is fatal.
 */
export async function importProject(
  data: ProjectExportFile,
  opts: ProjectImportOptions,
  onProgress: Emit,
): Promise<ProjectImportResult> {
  const { steps, add, set } = stepTracker(onProgress);
  const apps: ImportedProjectApp[] = [];

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

  if (opts.includeApps) {
    for (const app of data.apps) {
      const aStep = add({
        id: `a:${app.id}`,
        label: `App “${app.name}” (${app.type})`,
        kind: 'app',
      });
      if (app.type === 'SAML') {
        set(aStep, 'skipped', 'SAML metadata is certificate-bound; recreate manually');
        continue;
      }
      set(aStep, 'running');
      try {
        const res =
          app.type === 'OIDC'
            ? await createOIDCApp(
                newProjectId,
                {
                  name: app.name,
                  redirectUris: app.oidc?.redirectUris ?? [],
                  postLogoutRedirectUris: app.oidc?.postLogoutRedirectUris ?? [],
                  appType: app.oidc?.appType,
                  authMethodType: app.oidc?.authMethodType,
                  grantTypes: app.oidc?.grantTypes,
                  responseTypes: app.oidc?.responseTypes,
                  devMode: app.oidc?.devMode,
                  accessTokenType: app.oidc?.accessTokenType,
                },
                opts.orgId,
              )
            : await createAPIApp(
                newProjectId,
                { name: app.name, authMethodType: app.api?.authMethodType },
                opts.orgId,
              );
        apps.push({
          appId: res.appId,
          name: app.name,
          type: app.type,
          clientId: res.clientId,
          clientSecret: res.clientSecret,
        });
        set(
          aStep,
          'done',
          res.clientSecret
            ? `id ${res.appId} — new client secret issued (shown below)`
            : `id ${res.appId}`,
        );
      } catch (err) {
        set(aStep, 'error', (err as Error).message);
      }
    }
  }

  return { projectId: newProjectId, projectName: opts.projectName, apps, steps };
}
