import { api, ApiError } from './client';
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
    const q = params.query.trim();
    queries.push({
      orQuery: {
        queries: [
          // userIdQuery is an exact match — lets admins paste an ID straight
          // into the search box, in addition to name / email / display name.
          { userIdQuery: { userId: q } },
          { userNameQuery: { userName: q, method: 'TEXT_QUERY_METHOD_CONTAINS_IGNORE_CASE' } },
          { emailQuery: { emailAddress: q, method: 'TEXT_QUERY_METHOD_CONTAINS_IGNORE_CASE' } },
          { displayNameQuery: { displayName: q, method: 'TEXT_QUERY_METHOD_CONTAINS_IGNORE_CASE' } },
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
  await api.patch(EP.userUpdateMachine(userId), {
    machine: {
      name: input.name,
      description: input.description || undefined,
    },
  });
}

export interface MachineSecret {
  clientId?: string;
  clientSecret?: string;
}

/**
 * Generates client-credentials for a machine user. Replaces any existing
 * secret — the old one stops working immediately. Uses user.v2 AddSecret
 * (PUT /v2/users/{id}/secret); if the instance doesn't serve that route yet it
 * falls back to management v1 GenerateMachineSecret. The v2 response carries
 * only the secret (the client id is the user's login name); v1 returns both.
 */
export async function generateMachineSecret(userId: string): Promise<MachineSecret> {
  try {
    const res = await api.put<Record<string, unknown>>(EP.userSecret(userId), {});
    return {
      clientId: res.clientId as string | undefined,
      clientSecret: res.clientSecret as string | undefined,
    };
  } catch (err) {
    if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 405)) throw err;
    const res = await api.put<Record<string, unknown>>(EP.userSecretV1(userId), {});
    return {
      clientId: res.clientId as string | undefined,
      clientSecret: res.clientSecret as string | undefined,
    };
  }
}

/** Revokes a machine user's client secret (v2 RemoveSecret, v1 fallback). */
export async function removeMachineSecret(userId: string): Promise<void> {
  try {
    await api.delete(EP.userSecret(userId));
  } catch (err) {
    if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 405)) throw err;
    await api.delete(EP.userSecretV1(userId));
  }
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

// ── User details / MFA (user.v2) ─────────────────────────────────────────────

/**
 * Full user record via GetUserByID (GET /v2/users/{id}) — profile, verified
 * flags and details (creation date, change date, resource owner). Returns
 * undefined on failure; callers fall back to the lighter list-view data.
 */
export async function getUser(userId: string): Promise<User | undefined> {
  try {
    const res = await api.get<Record<string, unknown>>(EP.userGet(userId));
    const raw = (res.user ?? res) as Record<string, unknown> | undefined;
    return raw && typeof raw === 'object' ? normalizeUser(raw) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Authentication methods a user has configured (password, passkey, TOTP,
 * OTP email/SMS, U2F, recovery codes) — raw enums like
 * `AUTHENTICATION_METHOD_TYPE_TOTP`.
 */
export async function listUserAuthMethods(userId: string): Promise<string[]> {
  const res = await api.get<{ authMethodTypes?: string[] }>(EP.userAuthMethods(userId));
  return res.authMethodTypes ?? [];
}

export interface UserPasskey {
  id: string;
  name?: string;
  state?: string;
}

/** Registered passkeys of a user (ListPasskeys — each has the id removal needs). */
export async function listUserPasskeys(userId: string): Promise<UserPasskey[]> {
  const res = await api.post<{ result?: Array<Record<string, unknown>> }>(
    EP.userListPasskeys(userId),
    {},
  );
  return (res.result ?? []).map((p) => ({
    id: String(p.id ?? ''),
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : undefined,
    state: typeof p.state === 'string' ? p.state : undefined,
  }));
}

/** Removes the user's TOTP generator (authenticator app) — second factor. */
export async function removeUserTOTP(userId: string): Promise<void> {
  await api.delete(EP.userRemoveTOTP(userId));
}

/** Removes the user's OTP-via-email second factor. */
export async function removeUserOtpEmail(userId: string): Promise<void> {
  await api.delete(EP.userRemoveOtpEmail(userId));
}

/** Removes the user's OTP-via-SMS second factor. */
export async function removeUserOtpSms(userId: string): Promise<void> {
  await api.delete(EP.userRemoveOtpSms(userId));
}

/** Removes a specific passkey (per passkey id from ListPasskeys). */
export async function removeUserPasskey(userId: string, passkeyId: string): Promise<void> {
  await api.delete(EP.userRemovePasskey(userId, passkeyId));
}
