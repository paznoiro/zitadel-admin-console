import { api } from './client';
import { EP } from './endpoints';
import type { Project, ProjectRole } from './types';

/**
 * Projects and roles use the zitadel.project.v2 Connect RPC transport. List
 * reads filter by org via the request body; create/delete carry the org in the
 * body too (organizationId). Project update still uses management v1 (no v2 RPC
 * yet). The optional `orgId` on the create helper is supplied by the
 * duplicate-org wizard to target a freshly created org; when omitted the call
 * runs in the token's own org.
 */

// All v2 Connect RPCs require this header.
const CONNECT_HDR = { 'Connect-Protocol-Version': '1' };

interface ProjectListResponse {
  projects?: Array<Record<string, unknown>>;
}

function normalizeProject(raw: Record<string, unknown>): Project {
  const details = raw.details as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? raw.projectId ?? ''),
    name: String(raw.name ?? ''),
    state: raw.state as string | undefined,
    projectRoleAssertion: raw.projectRoleAssertion as boolean | undefined,
    projectRoleCheck: raw.projectRoleCheck as boolean | undefined,
    hasProjectCheck: raw.hasProjectCheck as boolean | undefined,
    privateLabelingSetting: raw.privateLabelingSetting as string | undefined,
    organizationId: (raw.organizationId ?? details?.resourceOwner) as string | undefined,
    details: raw.details as Project['details'],
  };
}

export async function listProjects(query?: string, orgId?: string): Promise<Project[]> {
  const filters: unknown[] = [];
  if (orgId) {
    filters.push({ organizationIdFilter: { organizationId: orgId } });
  }
  if (query?.trim()) {
    filters.push({
      nameFilter: { name: query.trim(), method: 'TEXT_QUERY_METHOD_CONTAINS_IGNORE_CASE' },
    });
  }
  const body = { filters };
  const res = await api.post<ProjectListResponse>(EP.projectList(), body, {
    extraHeaders: { 'Connect-Protocol-Version': '1' },
  });
  return (res.projects ?? []).map(normalizeProject);
}

export interface CreateProjectInput {
  name: string;
  projectRoleAssertion?: boolean;
  projectRoleCheck?: boolean;
  hasProjectCheck?: boolean;
  privateLabelingSetting?: string;
}

export async function createProject(input: CreateProjectInput, orgId?: string): Promise<Project> {
  // v2 CreateProject: org is in the body (organizationId), and the role/access
  // flags are renamed (projectRoleCheck → authorizationRequired,
  // hasProjectCheck → projectAccessRequired).
  const body = {
    ...(orgId ? { organizationId: orgId } : {}),
    name: input.name,
    projectRoleAssertion: input.projectRoleAssertion ?? false,
    authorizationRequired: input.projectRoleCheck ?? false,
    projectAccessRequired: input.hasProjectCheck ?? false,
    privateLabelingSetting:
      input.privateLabelingSetting ?? 'PRIVATE_LABELING_SETTING_UNSPECIFIED',
  };
  const res = await api.post<Record<string, unknown>>(EP.projectCreate(), body, {
    extraHeaders: CONNECT_HDR,
  });
  // Re-shape into the normalizer's expected (v1-style) field names.
  return normalizeProject({
    id: res.projectId,
    name: input.name,
    projectRoleAssertion: body.projectRoleAssertion,
    projectRoleCheck: body.authorizationRequired,
    hasProjectCheck: body.projectAccessRequired,
    privateLabelingSetting: body.privateLabelingSetting,
    organizationId: orgId,
    ...res,
  });
}

export async function updateProject(
  projectId: string,
  input: CreateProjectInput,
): Promise<void> {
  const body = {
    name: input.name,
    projectRoleAssertion: input.projectRoleAssertion ?? false,
    projectRoleCheck: input.projectRoleCheck ?? false,
    hasProjectCheck: input.hasProjectCheck ?? false,
    privateLabelingSetting: input.privateLabelingSetting ?? 'PRIVATE_LABELING_SETTING_UNSPECIFIED',
  };
  await api.put(EP.projectUpdate(projectId), body);
}

export async function getProject(projectId: string): Promise<Project> {
  const res = await api.get<Record<string, unknown>>(EP.projectGet(projectId));
  const inner = (res.project ?? res) as Record<string, unknown>;
  return normalizeProject(inner);
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.post(EP.projectDelete(), { projectId }, { extraHeaders: CONNECT_HDR });
}

// ---- Roles -----------------------------------------------------------------

interface RoleListResponse {
  projectRoles?: Array<Record<string, unknown>>;
}

function normalizeRole(raw: Record<string, unknown>): ProjectRole {
  return {
    key: String(raw.key ?? raw.roleKey ?? ''),
    displayName: raw.displayName as string | undefined,
    group: raw.group as string | undefined,
    details: raw.details as ProjectRole['details'],
  };
}

export async function listRoles(projectId: string, orgId?: string): Promise<ProjectRole[]> {
  const res = await api.post<RoleListResponse>(
    EP.roleList(),
    { projectId },
    { extraHeaders: CONNECT_HDR, orgId },
  );
  return (res.projectRoles ?? []).map(normalizeRole);
}

export interface CreateRoleInput {
  roleKey: string;
  displayName?: string;
  group?: string;
}

export async function createRole(
  projectId: string,
  input: CreateRoleInput,
  orgId?: string,
): Promise<void> {
  await api.post(
    EP.roleAdd(),
    {
      projectId,
      roleKey: input.roleKey,
      displayName: input.displayName || input.roleKey,
      ...(input.group ? { group: input.group } : {}),
    },
    { extraHeaders: CONNECT_HDR, orgId },
  );
}

export async function updateRole(
  projectId: string,
  roleKey: string,
  input: { displayName?: string; group?: string },
): Promise<void> {
  await api.post(
    EP.roleUpdate(),
    {
      projectId,
      roleKey,
      displayName: input.displayName || roleKey,
      ...(input.group ? { group: input.group } : {}),
    },
    { extraHeaders: CONNECT_HDR },
  );
}

export async function deleteRole(projectId: string, roleKey: string): Promise<void> {
  await api.post(EP.roleRemove(), { projectId, roleKey }, { extraHeaders: CONNECT_HDR });
}
