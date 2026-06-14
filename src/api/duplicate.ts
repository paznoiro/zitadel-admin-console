import { createOrganization } from './orgs';
import { createProject, createRole, listProjects, listRoles } from './projects';
import { createAPIApp, createOIDCApp, listApps } from './apps';

export type CloneStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface CloneStep {
  id: string;
  label: string;
  kind: 'org' | 'project' | 'role' | 'app';
  status: CloneStatus;
  detail?: string;
}

export interface CloneOptions {
  sourceOrgId: string;
  newOrgName: string;
  includeRoles: boolean;
  includeApps: boolean;
}

export interface CloneResult {
  newOrgId: string;
  steps: CloneStep[];
}

type Emit = (steps: CloneStep[]) => void;

/**
 * Deep-clones an organization: creates a new org, then recreates every project,
 * its roles, and its applications (OIDC + API). SAML apps are flagged as skipped
 * because their certificate-bound metadata cannot be meaningfully duplicated.
 *
 * Progress is streamed through `onProgress` so the wizard can render a live
 * checklist. The whole thing is best-effort: a failure on one item is recorded
 * on that step and the clone continues with the rest.
 */
export async function duplicateOrganization(
  opts: CloneOptions,
  onProgress: Emit,
): Promise<CloneResult> {
  const steps: CloneStep[] = [];
  const emit = () => onProgress([...steps]);

  const add = (step: Omit<CloneStep, 'status'> & { status?: CloneStatus }): CloneStep => {
    const s: CloneStep = { status: 'pending', ...step };
    steps.push(s);
    emit();
    return s;
  };
  const set = (s: CloneStep, status: CloneStatus, detail?: string) => {
    s.status = status;
    if (detail !== undefined) s.detail = detail;
    emit();
  };

  // 1. Create the new organization.
  const orgStep = add({ id: 'org', label: `Create organization “${opts.newOrgName}”`, kind: 'org' });
  set(orgStep, 'running');
  let newOrgId: string;
  try {
    const res = await createOrganization({ name: opts.newOrgName });
    newOrgId = res.organizationId;
    set(orgStep, 'done', `id ${newOrgId}`);
  } catch (err) {
    set(orgStep, 'error', (err as Error).message);
    throw err;
  }

  // 2. Read the source projects (token's own org).
  const sourceProjects = await listProjects();

  for (const project of sourceProjects) {
    const pStep = add({ id: `p:${project.id}`, label: `Project “${project.name}”`, kind: 'project' });
    set(pStep, 'running');
    let newProjectId = '';
    try {
      const created = await createProject(
        {
          name: project.name,
          projectRoleAssertion: project.projectRoleAssertion,
          projectRoleCheck: project.projectRoleCheck,
          hasProjectCheck: project.hasProjectCheck,
          privateLabelingSetting: project.privateLabelingSetting,
        },
        newOrgId,
      );
      newProjectId = created.id;
      set(pStep, 'done', `id ${newProjectId}`);
    } catch (err) {
      set(pStep, 'error', (err as Error).message);
      continue; // can't clone children without the project
    }

    // 2a. Roles
    if (opts.includeRoles) {
      let roles: Awaited<ReturnType<typeof listRoles>> = [];
      try {
        roles = await listRoles(project.id);
      } catch (err) {
        add({
          id: `r:${project.id}:_`,
          label: `Roles for “${project.name}”`,
          kind: 'role',
          status: 'error',
          detail: (err as Error).message,
        });
      }
      for (const role of roles) {
        const rStep = add({
          id: `r:${project.id}:${role.key}`,
          label: `Role “${role.key}” → ${project.name}`,
          kind: 'role',
        });
        set(rStep, 'running');
        try {
          await createRole(
            newProjectId,
            { roleKey: role.key, displayName: role.displayName, group: role.group },
            newOrgId,
          );
          set(rStep, 'done');
        } catch (err) {
          set(rStep, 'error', (err as Error).message);
        }
      }
    }

    // 2b. Applications
    if (opts.includeApps) {
      let apps: Awaited<ReturnType<typeof listApps>> = [];
      try {
        apps = await listApps(project.id);
      } catch (err) {
        add({
          id: `a:${project.id}:_`,
          label: `Apps for “${project.name}”`,
          kind: 'app',
          status: 'error',
          detail: (err as Error).message,
        });
      }
      for (const app of apps) {
        const aStep = add({
          id: `a:${project.id}:${app.id}`,
          label: `App “${app.name}” (${app.type}) → ${project.name}`,
          kind: 'app',
        });
        if (app.type === 'SAML') {
          set(aStep, 'skipped', 'SAML metadata is certificate-bound; recreate manually');
          continue;
        }
        set(aStep, 'running');
        try {
          if (app.type === 'OIDC') {
            const oidc = (app.raw as Record<string, unknown>)?.oidcConfig as
              | Record<string, unknown>
              | undefined;
            await createOIDCApp(
              newProjectId,
              {
                name: app.name,
                redirectUris: (oidc?.redirectUris as string[]) ?? [],
                postLogoutRedirectUris: (oidc?.postLogoutRedirectUris as string[]) ?? [],
                appType: oidc?.appType as string | undefined,
                authMethodType: oidc?.authMethodType as string | undefined,
                grantTypes: oidc?.grantTypes as string[] | undefined,
                responseTypes: oidc?.responseTypes as string[] | undefined,
                devMode: oidc?.devMode as boolean | undefined,
              },
              newOrgId,
            );
          } else {
            const apiCfg = (app.raw as Record<string, unknown>)?.apiConfig as
              | Record<string, unknown>
              | undefined;
            await createAPIApp(
              newProjectId,
              { name: app.name, authMethodType: apiCfg?.authMethodType as string | undefined },
              newOrgId,
            );
          }
          set(aStep, 'done', 'new client credentials issued');
        } catch (err) {
          set(aStep, 'error', (err as Error).message);
        }
      }
    }
  }

  return { newOrgId, steps };
}
