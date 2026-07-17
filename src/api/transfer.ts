import { getSession } from './session';
import {
  activateLabelPolicy,
  createOrganization,
  getLabelPolicy,
  saveLabelPolicy,
  uploadOrgIcon,
  uploadOrgLogo,
} from './orgs';
import type { LabelPolicy } from './orgs';
import { createProject, createRole, listProjects, listRoles } from './projects';
import { createAPIApp, createOIDCApp, listApps } from './apps';
import { addHumanUser, addMachineUser, listUsers } from './users';
import { createUserGrant, listUserGrants } from './grants';
import {
  getDomainPolicy,
  getLockoutPolicy,
  getLoginPolicy,
  getNotificationPolicy,
  getPasswordAgePolicy,
  getPasswordComplexityPolicy,
  getPrivacyPolicy,
  saveDomainPolicy,
  saveLockoutPolicy,
  saveLoginPolicy,
  saveNotificationPolicy,
  savePasswordAgePolicy,
  savePasswordComplexityPolicy,
  savePrivacyPolicy,
} from './orgSettings';
import type {
  DomainPolicy,
  LockoutPolicy,
  LoginPolicy,
  NotificationPolicy,
  PasswordAgePolicy,
  PasswordComplexityPolicy,
  PrivacyPolicy,
} from './orgSettings';
import type { User } from './types';

/**
 * Org export / import ("transfer"). Export serializes everything an org owns
 * that this console can read — projects (with their flags), project roles,
 * applications (OIDC + API config), and users — into a portable JSON file.
 * Import replays that file against whichever instance the console is currently
 * connected to, so moving an org between instances is: export here, reconnect
 * the console to the target instance, import there.
 *
 * IDs are never reused: the target instance mints fresh org/project/app/user
 * ids (and fresh client credentials — secrets cannot be read from the source).
 * The import result carries the old→new mapping the UI reports afterwards.
 */

export const EXPORT_FORMAT = 'zitadel-org-export' as const;
// v1: projects/roles/apps/users. v2 adds user grants + org settings (policies & branding colors).
export const EXPORT_VERSION = 2;

export interface ExportedRole {
  key: string;
  displayName?: string;
  group?: string;
}

export interface ExportedOidcConfig {
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  additionalOrigins: string[];
  responseTypes: string[];
  grantTypes: string[];
  appType: string;
  authMethodType: string;
  devMode: boolean;
  accessTokenType: string;
}

export interface ExportedApp {
  id: string;
  name: string;
  type: 'OIDC' | 'API' | 'SAML';
  oidc?: ExportedOidcConfig;
  api?: { authMethodType: string };
}

export interface ExportedProject {
  id: string;
  name: string;
  projectRoleAssertion?: boolean;
  projectRoleCheck?: boolean;
  hasProjectCheck?: boolean;
  privateLabelingSetting?: string;
  roles: ExportedRole[];
  apps: ExportedApp[];
}

export interface ExportedUser {
  id: string;
  type: 'human' | 'machine';
  username?: string;
  human?: {
    givenName?: string;
    familyName?: string;
    email?: string;
    emailVerified?: boolean;
    phone?: string;
    preferredLanguage?: string;
  };
  machine?: { name?: string; description?: string };
}

/** A project-role authorization; ids reference the *source* instance and are remapped on import. */
export interface ExportedGrant {
  userId: string;
  projectId: string;
  projectName?: string;
  roleKeys: string[];
}

/**
 * Org-level settings. `isDefault: true` means the source org inherited the
 * instance default, so there is nothing org-specific to copy. Beware proto3
 * JSON: ZITADEL omits false booleans entirely, so a *custom* policy usually has
 * no isDefault field at all — anything other than an explicit true is custom.
 * Branding covers the colors/flags plus the logo & icon images, embedded as
 * base64 data URLs so the export file stays self-contained.
 */
export interface ExportedSettings {
  login?: LoginPolicy;
  passwordComplexity?: PasswordComplexityPolicy;
  lockout?: LockoutPolicy;
  passwordAge?: PasswordAgePolicy;
  privacy?: PrivacyPolicy;
  notification?: NotificationPolicy;
  domain?: DomainPolicy;
  branding?: LabelPolicy;
  /** data: URLs of the custom branding images (only present when branding is custom). */
  brandingAssets?: {
    logo?: string;
    logoDark?: string;
    icon?: string;
    iconDark?: string;
  };
}

export interface OrgExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  sourceInstance?: string;
  org: { id: string; name: string };
  projects: ExportedProject[];
  users: ExportedUser[];
  grants: ExportedGrant[];
  settings?: ExportedSettings;
}

// ---- Export -----------------------------------------------------------------

function toExportedUser(u: User): ExportedUser {
  const isMachine = !!u.machine || u.type === 'TYPE_MACHINE';
  if (isMachine) {
    return {
      id: u.userId,
      type: 'machine',
      username: u.username,
      machine: { name: u.machine?.name, description: u.machine?.description },
    };
  }
  return {
    id: u.userId,
    type: 'human',
    username: u.username,
    human: {
      givenName: u.human?.profile?.givenName,
      familyName: u.human?.profile?.familyName,
      email: u.human?.email?.email,
      emailVerified: u.human?.email?.isVerified,
      phone: u.human?.phone?.phone,
      preferredLanguage: u.human?.profile?.preferredLanguage,
    },
  };
}

async function listAllUsers(orgId: string): Promise<User[]> {
  const pageSize = 200;
  const users: User[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const res = await listUsers({ orgId, limit: pageSize, offset });
    users.push(...res.users);
    if (res.users.length < pageSize || users.length >= res.total) break;
  }
  return users;
}

export async function exportOrganization(
  org: { id: string; name: string },
  onProgress?: Emit,
): Promise<OrgExportFile> {
  const { add, set } = stepTracker(onProgress);
  const fail = (step: TransferStep, err: unknown): never => {
    set(step, 'error', (err as Error).message);
    throw err;
  };

  const listStep = add({ id: 'projects', label: 'Reading projects', kind: 'org' });
  set(listStep, 'running');
  let projects: Awaited<ReturnType<typeof listProjects>>;
  try {
    projects = await listProjects(undefined, org.id);
    set(listStep, 'done', `${projects.length} found`);
  } catch (err) {
    return fail(listStep, err);
  }

  const exportedProjects: ExportedProject[] = [];
  for (const p of projects) {
    const pStep = add({
      id: `p:${p.id}`,
      label: `Exporting project “${p.name}” — roles & applications`,
      kind: 'project',
    });
    set(pStep, 'running');
    let roles: Awaited<ReturnType<typeof listRoles>>;
    let apps: Awaited<ReturnType<typeof listApps>>;
    try {
      [roles, apps] = await Promise.all([listRoles(p.id, org.id), listApps(p.id, org.id)]);
      set(pStep, 'done', `${roles.length} roles, ${apps.length} apps`);
    } catch (err) {
      return fail(pStep, err);
    }
    exportedProjects.push({
      id: p.id,
      name: p.name,
      projectRoleAssertion: p.projectRoleAssertion,
      projectRoleCheck: p.projectRoleCheck,
      hasProjectCheck: p.hasProjectCheck,
      privateLabelingSetting: p.privateLabelingSetting,
      roles: roles.map((r) => ({ key: r.key, displayName: r.displayName, group: r.group })),
      apps: apps.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        oidc: a.oidc
          ? {
              redirectUris: a.oidc.redirectUris,
              postLogoutRedirectUris: a.oidc.postLogoutRedirectUris,
              additionalOrigins: a.oidc.additionalOrigins,
              responseTypes: a.oidc.responseTypes,
              grantTypes: a.oidc.grantTypes,
              appType: a.oidc.appType,
              authMethodType: a.oidc.authMethodType,
              devMode: a.oidc.devMode,
              accessTokenType: a.oidc.accessTokenType,
            }
          : undefined,
        api: a.api ? { authMethodType: a.api.authMethodType } : undefined,
      })),
    });
  }

  const uStep = add({ id: 'users', label: 'Exporting users', kind: 'user' });
  set(uStep, 'running');
  let rawUsers: User[];
  try {
    rawUsers = await listAllUsers(org.id);
    set(uStep, 'done', `${rawUsers.length} users`);
  } catch (err) {
    return fail(uStep, err);
  }
  const users = rawUsers.map(toExportedUser);

  // Authorizations, batched a few users at a time to keep request volume sane.
  const gStep = add({ id: 'grants', label: 'Exporting user grants', kind: 'grant' });
  set(gStep, 'running');
  const grants: ExportedGrant[] = [];
  const batchSize = 8;
  try {
    for (let i = 0; i < rawUsers.length; i += batchSize) {
      const slice = rawUsers.slice(i, i + batchSize);
      const results = await Promise.all(slice.map((u) => listUserGrants(u.userId)));
      results.forEach((userGrants, idx) => {
        for (const g of userGrants) {
          if (!g.projectId || g.roleKeys.length === 0) continue;
          grants.push({
            userId: slice[idx].userId,
            projectId: g.projectId,
            projectName: g.projectName,
            roleKeys: g.roleKeys,
          });
        }
      });
      set(gStep, 'running', `${Math.min(i + batchSize, rawUsers.length)}/${rawUsers.length} users checked`);
    }
    set(gStep, 'done', `${grants.length} grants`);
  } catch (err) {
    return fail(gStep, err);
  }

  const sStep = add({ id: 'settings', label: 'Exporting organization settings', kind: 'setting' });
  set(sStep, 'running');
  const settings = await exportSettings(org.id);
  const imageCount = Object.values(settings.brandingAssets ?? {}).filter(Boolean).length;
  set(sStep, 'done', `${customSettings(settings).length} custom policies, ${imageCount} branding images`);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sourceInstance: getSession()?.baseUrl,
    org: { id: org.id, name: org.name },
    projects: exportedProjects,
    users,
    grants,
    settings,
  };
}

/**
 * Best-effort settings snapshot: a token without policy-read rights loses that
 * one policy, not the whole export.
 */
async function exportSettings(orgId: string): Promise<ExportedSettings> {
  const tryGet = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch {
      return undefined;
    }
  };
  const settings: ExportedSettings = {
    login: await tryGet(() => getLoginPolicy(orgId)),
    passwordComplexity: await tryGet(() => getPasswordComplexityPolicy(orgId)),
    lockout: await tryGet(() => getLockoutPolicy(orgId)),
    passwordAge: await tryGet(() => getPasswordAgePolicy(orgId)),
    privacy: await tryGet(() => getPrivacyPolicy(orgId)),
    notification: await tryGet(() => getNotificationPolicy(orgId)),
    domain: await tryGet(() => getDomainPolicy(orgId)),
    branding: await tryGet(() => getLabelPolicy(orgId)),
  };

  // Embed the branding images (org-custom only — instance-default images stay
  // with the instance). Custom = isDefault absent or false (proto3 omits false).
  // Any asset that fails to download is simply omitted.
  const b = settings.branding;
  if (b && b.isDefault !== true) {
    const assets = {
      logo: await fetchAssetDataUrl(b.logoUrl),
      logoDark: await fetchAssetDataUrl(b.logoDarkUrl),
      icon: await fetchAssetDataUrl(b.iconUrl),
      iconDark: await fetchAssetDataUrl(b.iconDarkUrl),
    };
    if (Object.values(assets).some(Boolean)) settings.brandingAssets = assets;
  }
  return settings;
}

/** Downloads a (token-protected) asset and returns it as a `data:` URL. */
async function fetchAssetDataUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  const session = getSession();
  if (!session) return undefined;
  const abs = url.startsWith('http') ? url : `${session.baseUrl}${url}`;
  try {
    const res = await fetch(abs, { headers: { Authorization: `Bearer ${session.token}` } });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/** Rebuilds an uploadable File from an embedded `data:` URL. */
function dataUrlToFile(dataUrl: string, name: string): File | undefined {
  const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!m) return undefined;
  let bytes: string;
  try {
    bytes = atob(m[2]);
  } catch {
    return undefined;
  }
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const ext = m[1].split('/')[1]?.split('+')[0] ?? 'png';
  return new File([arr], `${name}.${ext}`, { type: m[1] });
}

type PolicyKey = Exclude<keyof ExportedSettings, 'brandingAssets'>;

/** Policies the source org actually customized (instance defaults carry nothing to copy). */
export function customSettings(
  s: ExportedSettings | undefined,
): Array<{ key: PolicyKey; label: string }> {
  if (!s) return [];
  const labels: Record<PolicyKey, string> = {
    login: 'Login policy',
    passwordComplexity: 'Password complexity',
    lockout: 'Lockout policy',
    passwordAge: 'Password age',
    privacy: 'Privacy & support links',
    notification: 'Notification policy',
    domain: 'Domain policy',
    branding: 'Branding colors',
  };
  // proto3 JSON omits false → a custom policy has NO isDefault field; only an
  // explicit true marks an inherited instance default.
  return (Object.keys(labels) as PolicyKey[])
    .filter((k) => s[k] && s[k]!.isDefault !== true)
    .map((k) => ({ key: k, label: labels[k] }));
}

export function exportCounts(d: OrgExportFile): {
  projects: number;
  roles: number;
  apps: number;
  users: number;
  grants: number;
  settings: number;
} {
  return {
    projects: d.projects.length,
    roles: d.projects.reduce((n, p) => n + p.roles.length, 0),
    apps: d.projects.reduce((n, p) => n + p.apps.length, 0),
    users: d.users.length,
    grants: d.grants.length,
    settings: customSettings(d.settings).length,
  };
}

/** Triggers a browser download of the export as pretty-printed JSON. Returns the filename. */
export function downloadOrgExport(data: OrgExportFile): string {
  const slug =
    data.org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org';
  const filename = `${slug}-export-${data.exportedAt.slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

export function parseOrgExport(text: string): OrgExportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  const d = raw as Partial<OrgExportFile>;
  if (!d || d.format !== EXPORT_FORMAT) {
    throw new Error('Not a ZITADEL org export file (missing format marker).');
  }
  if (typeof d.version !== 'number' || d.version < 1 || d.version > EXPORT_VERSION) {
    throw new Error(`Unsupported export version ${d.version} — this build reads v1–v${EXPORT_VERSION}.`);
  }
  if (!d.org?.name || !Array.isArray(d.projects) || !Array.isArray(d.users)) {
    throw new Error('Export file is incomplete (org, projects or users section missing).');
  }
  // v1 files predate grants/settings — normalize so the importer can rely on them.
  if (!Array.isArray(d.grants)) d.grants = [];
  return d as OrgExportFile;
}

// ---- Import -----------------------------------------------------------------

export type TransferStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

/** One line in the live progress log — shared by export and import. */
export interface TransferStep {
  id: string;
  label: string;
  kind: 'org' | 'project' | 'role' | 'app' | 'user' | 'grant' | 'setting';
  status: TransferStatus;
  detail?: string;
}

type Emit = (steps: TransferStep[]) => void;

function stepTracker(onProgress?: Emit) {
  const steps: TransferStep[] = [];
  const emit = () => onProgress?.([...steps]);
  const add = (step: Omit<TransferStep, 'status'> & { status?: TransferStatus }): TransferStep => {
    const s: TransferStep = { status: 'pending', ...step };
    steps.push(s);
    emit();
    return s;
  };
  const set = (s: TransferStep, status: TransferStatus, detail?: string) => {
    s.status = status;
    if (detail !== undefined) s.detail = detail;
    emit();
  };
  return { steps, add, set };
}

export interface ImportOptions {
  newOrgName: string;
  includeRoles: boolean;
  includeApps: boolean;
  includeUsers: boolean;
  includeGrants: boolean;
  includeSettings: boolean;
}

export interface ImportedAppInfo {
  appId: string;
  name: string;
  projectName: string;
  clientId?: string;
}

export interface ImportedUserInfo {
  userId: string;
  email?: string;
  username?: string;
  type: 'human' | 'machine';
}

export interface ImportResult {
  orgId: string;
  orgName: string;
  apps: ImportedAppInfo[];
  users: ImportedUserInfo[];
  steps: TransferStep[];
}

/**
 * Replays an export file against the currently connected instance. Best-effort
 * like the duplicate wizard: a failing item is recorded on its step and the
 * import continues. Human users are created with their email pre-verified so
 * the target instance sends no verification mails; passwords cannot be
 * migrated, so users must reset them on the new instance.
 */
export async function importOrganization(
  data: OrgExportFile,
  opts: ImportOptions,
  onProgress: Emit,
): Promise<ImportResult> {
  const { steps, add, set } = stepTracker(onProgress);

  const apps: ImportedAppInfo[] = [];
  const users: ImportedUserInfo[] = [];
  // old source ids → new target ids, for rewiring grants after users/projects exist
  const projectIdMap = new Map<string, string>();
  const userIdMap = new Map<string, string>();

  // 1. Organization — everything else hangs off the new org id.
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

  // 2. Org settings — only policies the source org customized; inherited
  // instance defaults are left alone so the target's own defaults apply.
  if (opts.includeSettings) {
    const custom = customSettings(data.settings);
    if (custom.length === 0) {
      add({
        id: 'settings',
        label: 'Organization settings',
        kind: 'setting',
        status: 'skipped',
        detail: 'source org used instance defaults — nothing to copy',
      });
    } else {
      const s = data.settings!;
      const jobs: Record<PolicyKey, () => Promise<void>> = {
        login: () => saveLoginPolicy(newOrgId, { ...s.login!, isDefault: true }),
        passwordComplexity: () =>
          savePasswordComplexityPolicy(newOrgId, { ...s.passwordComplexity!, isDefault: true }),
        lockout: () => saveLockoutPolicy(newOrgId, { ...s.lockout!, isDefault: true }),
        passwordAge: () => savePasswordAgePolicy(newOrgId, { ...s.passwordAge!, isDefault: true }),
        privacy: () => savePrivacyPolicy(newOrgId, { ...s.privacy!, isDefault: true }),
        notification: () => saveNotificationPolicy(newOrgId, { ...s.notification!, isDefault: true }),
        domain: () => saveDomainPolicy(newOrgId, { ...s.domain!, isDefault: true }),
        branding: async () => {
          const { isDefault, logoUrl, logoDarkUrl, iconUrl, iconDarkUrl, ...colors } = s.branding!;
          void isDefault; void logoUrl; void logoDarkUrl; void iconUrl; void iconDarkUrl;
          await saveLabelPolicy(newOrgId, true, colors);
          await activateLabelPolicy(newOrgId);
        },
      };
      for (const { key, label } of custom) {
        const sStep = add({ id: `s:${key}`, label, kind: 'setting' });
        set(sStep, 'running');
        try {
          await jobs[key]();
          set(sStep, 'done');
        } catch (err) {
          set(sStep, 'error', (err as Error).message);
        }
      }

      // Branding images — re-uploaded through the assets API (which creates the
      // custom label policy on demand), then re-activated so they go live.
      const assets = s.brandingAssets;
      if (assets) {
        const assetJobs: Array<{ key: string; label: string; data?: string; upload: (f: File) => Promise<void> }> = [
          { key: 'logo', label: 'Branding logo (light)', data: assets.logo, upload: (f) => uploadOrgLogo(newOrgId, f, false) },
          { key: 'logoDark', label: 'Branding logo (dark)', data: assets.logoDark, upload: (f) => uploadOrgLogo(newOrgId, f, true) },
          { key: 'icon', label: 'Branding icon (light)', data: assets.icon, upload: (f) => uploadOrgIcon(newOrgId, f, false) },
          { key: 'iconDark', label: 'Branding icon (dark)', data: assets.iconDark, upload: (f) => uploadOrgIcon(newOrgId, f, true) },
        ];
        let uploaded = 0;
        for (const job of assetJobs) {
          if (!job.data) continue;
          const aStep = add({ id: `s:asset:${job.key}`, label: job.label, kind: 'setting' });
          set(aStep, 'running');
          const file = dataUrlToFile(job.data, job.key);
          if (!file) {
            set(aStep, 'skipped', 'embedded image data is unreadable');
            continue;
          }
          try {
            await job.upload(file);
            uploaded++;
            set(aStep, 'done');
          } catch (err) {
            set(aStep, 'error', (err as Error).message);
          }
        }
        if (uploaded > 0) {
          try {
            await activateLabelPolicy(newOrgId);
          } catch {
            // colors job may already have activated it; ignore
          }
        }
      }
    }
  }

  // 3. Projects with their roles and applications.
  for (const project of data.projects) {
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
      projectIdMap.set(project.id, newProjectId);
      set(pStep, 'done', `id ${newProjectId}`);
    } catch (err) {
      set(pStep, 'error', (err as Error).message);
      continue; // children need the project
    }

    if (opts.includeRoles) {
      for (const role of project.roles) {
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

    if (opts.includeApps) {
      for (const app of project.apps) {
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
            const oidc = app.oidc;
            const res = await createOIDCApp(
              newProjectId,
              {
                name: app.name,
                redirectUris: oidc?.redirectUris ?? [],
                postLogoutRedirectUris: oidc?.postLogoutRedirectUris ?? [],
                appType: oidc?.appType,
                authMethodType: oidc?.authMethodType,
                grantTypes: oidc?.grantTypes,
                responseTypes: oidc?.responseTypes,
                devMode: oidc?.devMode,
                accessTokenType: oidc?.accessTokenType,
              },
              newOrgId,
            );
            apps.push({ appId: res.appId, name: app.name, projectName: project.name, clientId: res.clientId });
            set(aStep, 'done', `id ${res.appId} — new client credentials issued`);
          } else {
            const res = await createAPIApp(
              newProjectId,
              { name: app.name, authMethodType: app.api?.authMethodType },
              newOrgId,
            );
            apps.push({ appId: res.appId, name: app.name, projectName: project.name, clientId: res.clientId });
            set(aStep, 'done', `id ${res.appId} — new client credentials issued`);
          }
        } catch (err) {
          set(aStep, 'error', (err as Error).message);
        }
      }
    }
  }

  // 4. Users (org-level, independent of projects).
  if (opts.includeUsers) {
    for (const u of data.users) {
      const label =
        u.type === 'machine'
          ? `Machine user “${u.username ?? u.machine?.name ?? u.id}”`
          : `User “${u.human?.email ?? u.username ?? u.id}”`;
      const uStep = add({ id: `u:${u.id}`, label, kind: 'user' });
      set(uStep, 'running');
      try {
        if (u.type === 'machine') {
          if (!u.username) throw new Error('machine user has no username in the export');
          const res = await addMachineUser({
            orgId: newOrgId,
            username: u.username,
            name: u.machine?.name || u.username,
            description: u.machine?.description,
          });
          users.push({ userId: res.userId, username: u.username, type: 'machine' });
          userIdMap.set(u.id, res.userId);
          set(uStep, 'done', `id ${res.userId}`);
        } else {
          const h = u.human ?? {};
          if (!h.email) throw new Error('user has no email in the export');
          const res = await addHumanUser({
            orgId: newOrgId,
            username: u.username,
            givenName: h.givenName || h.email,
            familyName: h.familyName || h.email,
            email: h.email,
            // pre-verified so the target instance never mails a code during migration
            emailVerified: true,
            preferredLanguage: h.preferredLanguage,
            phone: h.phone,
          });
          users.push({ userId: res.userId, email: h.email, username: u.username, type: 'human' });
          userIdMap.set(u.id, res.userId);
          set(uStep, 'done', `id ${res.userId}`);
        }
      } catch (err) {
        set(uStep, 'error', (err as Error).message);
      }
    }
  }

  // 5. User grants — needs both maps, so this runs last. Grants pointing at
  // users or projects that were not (successfully) imported are skipped, not
  // failed: the export may legitimately contain grants on other orgs' projects.
  if (opts.includeGrants && data.grants.length > 0) {
    const exportedUserById = new Map(data.users.map((u) => [u.id, u]));
    for (const [i, g] of data.grants.entries()) {
      const who = exportedUserById.get(g.userId);
      const whoLabel = who?.human?.email ?? who?.username ?? g.userId;
      const gStep = add({
        id: `g:${i}:${g.userId}:${g.projectId}`,
        label: `Grant ${g.roleKeys.join(', ')} on “${g.projectName ?? g.projectId}” → ${whoLabel}`,
        kind: 'grant',
      });
      const newUserId = userIdMap.get(g.userId);
      const newProjectId = projectIdMap.get(g.projectId);
      if (!newUserId) {
        set(gStep, 'skipped', 'user was not imported');
        continue;
      }
      if (!newProjectId) {
        set(gStep, 'skipped', 'project is not part of this import');
        continue;
      }
      set(gStep, 'running');
      try {
        await createUserGrant(newUserId, newProjectId, g.roleKeys, newOrgId);
        set(gStep, 'done');
      } catch (err) {
        set(gStep, 'error', (err as Error).message);
      }
    }
  }

  return { orgId: newOrgId, orgName: opts.newOrgName, apps, users, steps };
}
