import { api } from './client';
import { EP } from './endpoints';
import type { ListDetails, User } from './types';

interface UserSearchResponse {
  details?: ListDetails;
  result?: Array<Record<string, unknown>>;
}

function normalizeUser(raw: Record<string, unknown>): User {
  return {
    userId: String(raw.userId ?? raw.id ?? ''),
    username: raw.username as string | undefined,
    state: raw.state as string | undefined,
    type: raw.type as string | undefined,
    loginNames: raw.loginNames as string[] | undefined,
    preferredLoginName: raw.preferredLoginName as string | undefined,
    human: raw.human as User['human'],
    machine: raw.machine as User['machine'],
    details: raw.details as User['details'],
  };
}

export interface ListUsersParams {
  orgId?: string;
  query?: string;
  limit?: number;
  offset?: number;
  type?: 'human' | 'machine';
}

export async function listUsers(params: ListUsersParams = {}): Promise<{
  total: number;
  users: User[];
}> {
  const queries: unknown[] = [];
  if (params.orgId) {
    queries.push({ organizationIdQuery: { organizationId: params.orgId } });
  }
  if (params.type === 'human') {
    queries.push({ typeQuery: { type: 'TYPE_HUMAN' } });
  } else if (params.type === 'machine') {
    queries.push({ typeQuery: { type: 'TYPE_MACHINE' } });
  }
  if (params.query?.trim()) {
    queries.push({
      orQuery: {
        queries: [
          { userNameQuery: { userName: params.query.trim(), method: 'TEXT_QUERY_METHOD_CONTAINS_IGNORE_CASE' } },
          { emailQuery: { emailAddress: params.query.trim(), method: 'TEXT_QUERY_METHOD_CONTAINS_IGNORE_CASE' } },
          { displayNameQuery: { displayName: params.query.trim(), method: 'TEXT_QUERY_METHOD_CONTAINS_IGNORE_CASE' } },
        ],
      },
    });
  }
  const body = {
    query: { offset: String(params.offset ?? 0), limit: params.limit ?? 100, asc: true },
    queries,
  };
  // org scoping is done via the body query, never the x-zitadel-orgid header
  const res = await api.post<UserSearchResponse>(EP.userSearch(), body);
  return {
    total: Number(res.details?.totalResult ?? res.result?.length ?? 0),
    users: (res.result ?? []).map(normalizeUser),
  };
}

export interface AddHumanUserInput {
  orgId: string;
  username?: string;
  givenName: string;
  familyName: string;
  email: string;
  /** Mark email verified immediately instead of sending a verification code. */
  emailVerified?: boolean;
  preferredLanguage?: string;
  phone?: string;
  /** Optional initial password. */
  password?: string;
  /** Whether the user must change the password on first login. */
  changeRequired?: boolean;
}

export interface AddHumanUserResult {
  userId: string;
}

export async function addHumanUser(input: AddHumanUserInput): Promise<AddHumanUserResult> {
  const body: Record<string, unknown> = {
    username: input.username || input.email,
    organization: { orgId: input.orgId },
    profile: {
      givenName: input.givenName,
      familyName: input.familyName,
      preferredLanguage: input.preferredLanguage || 'en',
    },
    email: input.emailVerified
      ? { email: input.email, isVerified: true }
      : { email: input.email, sendCode: {} },
  };
  if (input.phone) body.phone = { phone: input.phone };
  if (input.password) {
    body.password = { password: input.password, changeRequired: input.changeRequired ?? true };
  }
  // target org is set via the `organization` body field, not a header
  const res = await api.post<Record<string, unknown>>(EP.userAddHuman(), body);
  return { userId: String(res.userId ?? res.id ?? '') };
}

export interface UpdateHumanUserInput {
  username?: string;
  givenName: string;
  familyName: string;
  preferredLanguage?: string;
  /** Only set when the email is actually changing. */
  email?: string;
  emailVerified?: boolean;
  /** Only set when the phone is actually changing. */
  phone?: string;
}

export async function updateHumanUser(
  userId: string,
  input: UpdateHumanUserInput,
): Promise<void> {
  const body: Record<string, unknown> = {
    // SetHumanProfile requires both names together
    profile: {
      givenName: input.givenName,
      familyName: input.familyName,
      ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
    },
  };
  if (input.username) body.username = input.username;
  if (input.email) {
    body.email = input.emailVerified
      ? { email: input.email, isVerified: true }
      : { email: input.email, sendCode: {} };
  }
  if (input.phone) body.phone = { phone: input.phone };
  await api.put(EP.userUpdateHuman(userId), body);
}

export interface AddMachineUserInput {
  orgId: string;
  username: string;
  name: string;
  description?: string;
}

export async function addMachineUser(input: AddMachineUserInput): Promise<{ userId: string }> {
  const body = {
    username: input.username,
    name: input.name,
    description: input.description || undefined,
    organization: { orgId: input.orgId },
  };
  const res = await api.post<Record<string, unknown>>(EP.userAddMachine(), body);
  return { userId: String(res.userId ?? res.id ?? '') };
}

export async function setUserPassword(
  userId: string,
  password: string,
  changeRequired = true,
): Promise<void> {
  await api.post(EP.userSetPassword(userId), {
    newPassword: { password, changeRequired },
  });
}

export async function updateMachineUser(
  userId: string,
  input: { name: string; description?: string },
): Promise<void> {
  await api.put(EP.userUpdateMachine(userId), {
    name: input.name,
    description: input.description || undefined,
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await api.delete(EP.userDelete(userId));
}

export async function deactivateUser(userId: string): Promise<void> {
  await api.post(EP.userDeactivate(userId), {});
}

export async function reactivateUser(userId: string): Promise<void> {
  await api.post(EP.userReactivate(userId), {});
}

export async function makeUserOrgAdmin(userId: string, orgId: string): Promise<void> {
  await api.post(EP.createAdministrator(), {
    userId,
    resource: {
      // ResourceType.resource oneof — for an org this is a plain string
      // field `organizationId`, not a nested `organization` message.
      organizationId: orgId
    },
    roles: ["ORG_OWNER"]
  });
}
