import { api } from './client';
import { EP } from './endpoints';

export interface UserGrant {
  id: string;
  projectId: string;
  projectName?: string;
  roleKeys: string[];
  state?: string;
}

const CONNECT_HDR = { 'Connect-Protocol-Version': '1' };

interface AuthorizationListResponse {
  authorizations?: Array<Record<string, unknown>>;
}

function normalizeGrant(raw: Record<string, unknown>): UserGrant {
  const project = raw.project as Record<string, unknown> | undefined;
  const roles = (raw.roles as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    id: String(raw.id ?? ''),
    projectId: String(project?.id ?? ''),
    projectName: project?.name as string | undefined,
    roleKeys: roles.map((r) => String(r.key ?? '')).filter(Boolean),
    state: raw.state as string | undefined,
  };
}

export async function listUserGrants(userId: string): Promise<UserGrant[]> {
  const res = await api.post<AuthorizationListResponse>(
    EP.authorizationList(),
    { filters: [{ inUserIds: { ids: [userId] } }] },
    { extraHeaders: CONNECT_HDR },
  );
  return (res.authorizations ?? []).map(normalizeGrant);
}

export async function createUserGrant(
  userId: string,
  projectId: string,
  roleKeys: string[],
  organizationId?: string,
): Promise<string> {
  const res = await api.post<Record<string, unknown>>(
    EP.authorizationCreate(),
    { userId, projectId, organizationId, roleKeys },
    { extraHeaders: CONNECT_HDR },
  );
  return String(res.id ?? '');
}

export async function updateUserGrant(
  _userId: string,
  grantId: string,
  roleKeys: string[],
): Promise<void> {
  await api.post(
    EP.authorizationUpdate(),
    { id: grantId, roleKeys },
    { extraHeaders: CONNECT_HDR },
  );
}

export async function deleteUserGrant(_userId: string, grantId: string): Promise<void> {
  await api.post(
    EP.authorizationDelete(),
    { id: grantId },
    { extraHeaders: CONNECT_HDR },
  );
}
