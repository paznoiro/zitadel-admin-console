import { api } from './client';
import { EP } from './endpoints';
import type { Application, ApiConfig, AppType, OidcConfig } from './types';

/** Application list uses the v2 Connect RPC service; write operations use management v1. */

interface AppListResponse {
  applications?: Array<Record<string, unknown>>;
}

/** v2 nests config as `oidcConfiguration`; management v1 uses `oidcConfig`. */
function rawOidc(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  return (raw.oidcConfig ?? raw.oidcConfiguration) as Record<string, unknown> | undefined;
}
function rawApi(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  return (raw.apiConfig ?? raw.apiConfiguration) as Record<string, unknown> | undefined;
}

function detectType(raw: Record<string, unknown>): AppType {
  if (rawOidc(raw)) return 'OIDC';
  if (rawApi(raw)) return 'API';
  if (raw.samlConfig || raw.samlConfiguration) return 'SAML';
  return 'OIDC';
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

/** Reads an OIDC config block, tolerating both v2 and management v1 field names. */
function parseOidc(c: Record<string, unknown>): OidcConfig {
  const lv = c.loginVersion as Record<string, unknown> | undefined;
  return {
    redirectUris: strArray(c.redirectUris),
    postLogoutRedirectUris: strArray(c.postLogoutRedirectUris),
    // v2 calls this `allowedOrigins`; management v1 calls it `additionalOrigins`.
    additionalOrigins: strArray(c.additionalOrigins ?? c.allowedOrigins),
    responseTypes: strArray(c.responseTypes).length
      ? strArray(c.responseTypes)
      : ['OIDC_RESPONSE_TYPE_CODE'],
    grantTypes: strArray(c.grantTypes).length
      ? strArray(c.grantTypes)
      : ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'],
    appType: (c.appType as string | undefined) ?? 'OIDC_APP_TYPE_WEB',
    authMethodType: (c.authMethodType as string | undefined) ?? 'OIDC_AUTH_METHOD_TYPE_BASIC',
    clientId: c.clientId as string | undefined,
    devMode: (c.devMode as boolean | undefined) ?? false,
    accessTokenType: (c.accessTokenType as string | undefined) ?? 'OIDC_TOKEN_TYPE_BEARER',
    accessTokenRoleAssertion: (c.accessTokenRoleAssertion as boolean | undefined) ?? false,
    idTokenRoleAssertion: (c.idTokenRoleAssertion as boolean | undefined) ?? false,
    idTokenUserinfoAssertion: (c.idTokenUserinfoAssertion as boolean | undefined) ?? false,
    clockSkew: c.clockSkew as string | undefined,
    loginVersion: lv ? ('loginV2' in lv ? 'v2' : 'v1') : undefined,
  };
}

function normalizeApp(raw: Record<string, unknown>): Application {
  const type = detectType(raw);
  const oidcRaw = rawOidc(raw);
  const apiRaw = rawApi(raw);
  const oidc = oidcRaw ? parseOidc(oidcRaw) : undefined;
  const api: ApiConfig | undefined = apiRaw
    ? {
        authMethodType: (apiRaw.authMethodType as string | undefined) ?? 'API_AUTH_METHOD_TYPE_BASIC',
        clientId: apiRaw.clientId as string | undefined,
      }
    : undefined;
  return {
    id: String(raw.id ?? raw.appId ?? raw.applicationId ?? ''),
    name: String(raw.name ?? ''),
    state: raw.state as string | undefined,
    type,
    clientId: oidc?.clientId ?? api?.clientId,
    redirectUris: oidc?.redirectUris,
    oidc,
    api,
    raw,
  };
}

export async function listApps(projectId: string): Promise<Application[]> {
  const body = { filters: [{ projectIdFilter: { projectId } }] };
  const res = await api.post<AppListResponse>(EP.appList(), body, {
    extraHeaders: { 'Connect-Protocol-Version': '1' },
  });
  return (res.applications ?? []).map(normalizeApp);
}

export interface CreateOIDCAppInput {
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  appType?: string; // OIDC_APP_TYPE_WEB | _USER_AGENT | _NATIVE
  authMethodType?: string; // OIDC_AUTH_METHOD_TYPE_BASIC | _POST | _NONE | _PRIVATE_KEY_JWT
  grantTypes?: string[];
  responseTypes?: string[];
  devMode?: boolean;
}

export interface CreateOIDCAppResult {
  appId: string;
  clientId?: string;
  clientSecret?: string;
}

export async function createOIDCApp(
  projectId: string,
  input: CreateOIDCAppInput,
  orgId?: string,
): Promise<CreateOIDCAppResult> {
  const body = {
    name: input.name,
    redirectUris: input.redirectUris,
    postLogoutRedirectUris: input.postLogoutRedirectUris ?? [],
    responseTypes: input.responseTypes ?? ['OIDC_RESPONSE_TYPE_CODE'],
    grantTypes: input.grantTypes ?? ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'],
    appType: input.appType ?? 'OIDC_APP_TYPE_WEB',
    authMethodType: input.authMethodType ?? 'OIDC_AUTH_METHOD_TYPE_BASIC',
    version: 'OIDC_VERSION_1_0',
    devMode: input.devMode ?? false,
    accessTokenType: 'OIDC_TOKEN_TYPE_BEARER',
    accessTokenRoleAssertion: true,
    idTokenRoleAssertion: true,
    idTokenUserinfoAssertion: true,
    clockSkew: '0s',
  };
  const res = await api.post<Record<string, unknown>>(EP.appCreateOIDC(projectId), body, { orgId });
  return {
    appId: String(res.appId ?? res.id ?? ''),
    clientId: res.clientId as string | undefined,
    clientSecret: res.clientSecret as string | undefined,
  };
}

export interface CreateAPIAppInput {
  name: string;
  authMethodType?: string; // API_AUTH_METHOD_TYPE_BASIC | _PRIVATE_KEY_JWT
}

export interface CreateAPIAppResult {
  appId: string;
  clientId?: string;
  clientSecret?: string;
}

export async function createAPIApp(
  projectId: string,
  input: CreateAPIAppInput,
  orgId?: string,
): Promise<CreateAPIAppResult> {
  const body = {
    name: input.name,
    authMethodType: input.authMethodType ?? 'API_AUTH_METHOD_TYPE_BASIC',
  };
  const res = await api.post<Record<string, unknown>>(EP.appCreateAPI(projectId), body, { orgId });
  return {
    appId: String(res.appId ?? res.id ?? ''),
    clientId: res.clientId as string | undefined,
    clientSecret: res.clientSecret as string | undefined,
  };
}

export async function deleteApp(projectId: string, appId: string): Promise<void> {
  await api.delete(EP.appDelete(projectId, appId));
}

export async function getApp(projectId: string, appId: string): Promise<Application> {
  const res = await api.get<Record<string, unknown>>(EP.appGet(projectId, appId));
  const raw = (res.app ?? res) as Record<string, unknown>;
  return normalizeApp(raw);
}

export async function updateAppName(projectId: string, appId: string, name: string): Promise<void> {
  await api.put(EP.appUpdate(projectId, appId), { name });
}

export interface UpdateOIDCAppInput {
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  additionalOrigins: string[];
  appType: string;
  authMethodType: string;
  grantTypes: string[];
  responseTypes: string[];
  devMode: boolean;
  accessTokenType: string;
  accessTokenRoleAssertion: boolean;
  idTokenRoleAssertion: boolean;
  idTokenUserinfoAssertion: boolean;
  clockSkew?: string;
}

export async function updateOIDCApp(
  projectId: string,
  appId: string,
  input: UpdateOIDCAppInput,
): Promise<void> {
  await api.put(EP.appUpdateOIDC(projectId, appId), {
    ...input,
    clockSkew: input.clockSkew ?? '0s',
  });
}

export async function updateAPIApp(
  projectId: string,
  appId: string,
  authMethodType: string,
): Promise<void> {
  await api.put(EP.appUpdateAPI(projectId, appId), { authMethodType });
}
