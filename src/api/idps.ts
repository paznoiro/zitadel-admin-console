import { api } from './client';
import { EP } from './endpoints';

// ---- Types -----------------------------------------------------------------

// v1 management types + v2beta settings types (IDENTITY_PROVIDER_TYPE_*)
export type IDPRawType =
  | 'IDP_TYPE_OIDC' | 'IDP_TYPE_OAUTH' | 'IDP_TYPE_JWT' | 'IDP_TYPE_SAML2'
  | 'IDENTITY_PROVIDER_TYPE_OIDC' | 'IDENTITY_PROVIDER_TYPE_OAUTH'
  | 'IDENTITY_PROVIDER_TYPE_JWT' | 'IDENTITY_PROVIDER_TYPE_SAML'
  | 'IDENTITY_PROVIDER_TYPE_GOOGLE' | 'IDENTITY_PROVIDER_TYPE_GITHUB'
  | 'IDENTITY_PROVIDER_TYPE_GITLAB' | 'IDENTITY_PROVIDER_TYPE_AZURE_AD'
  | 'IDENTITY_PROVIDER_TYPE_APPLE' | string;

export interface IDPOIDCConfig {
  clientId?: string;
  issuer?: string;
  scopes?: string[];
  displayNameMapping?: string;
  usernameMapping?: string;
  isAutoRegister?: boolean;
}

export interface IDPOAuthConfig {
  clientId?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userEndpoint?: string;
  scopes?: string[];
  idAttribute?: string;
}

export interface IDPJWTConfig {
  jwtEndpoint?: string;
  issuer?: string;
  keysEndpoint?: string;
  headerName?: string;
}

export interface IDPOptions {
  isLinkingAllowed?: boolean;
  isCreationAllowed?: boolean;
  isAutoCreation?: boolean;
  isAutoUpdate?: boolean;
  autoLinking?: string;
}

export interface IdentityProvider {
  id: string;
  name: string;
  type: IDPRawType;
  state?: string;
  owner?: string;
  oidcConfig?: IDPOIDCConfig;
  oauthConfig?: IDPOAuthConfig;
  jwtConfig?: IDPJWTConfig;
  options?: IDPOptions;
  raw?: unknown;
}

// ---- Normalizer ------------------------------------------------------------

function normalizeIDP(raw: Record<string, unknown>): IdentityProvider {
  const cfg = raw.config as Record<string, unknown> | undefined;
  const oidcConfig = (cfg?.oidcConfig ?? raw.oidcConfig) as IDPOIDCConfig | undefined;
  const oauthConfig = (cfg?.oauthConfig ?? raw.oauthConfig) as IDPOAuthConfig | undefined;
  const jwtConfig = (cfg?.jwtConfig ?? raw.jwtConfig) as IDPJWTConfig | undefined;
  const optRaw = (raw.options ?? cfg?.options) as Record<string, unknown> | undefined;
  const options: IDPOptions | undefined = optRaw ? {
    isLinkingAllowed: optRaw.isLinkingAllowed as boolean | undefined,
    isCreationAllowed: optRaw.isCreationAllowed as boolean | undefined,
    isAutoCreation: optRaw.isAutoCreation as boolean | undefined,
    isAutoUpdate: optRaw.isAutoUpdate as boolean | undefined,
    autoLinking: optRaw.autoLinking as string | undefined,
  } : undefined;
  return {
    id: String(raw.id ?? raw.idpId ?? ''),
    name: String(raw.name ?? ''),
    type: (raw.type ?? 'IDP_TYPE_OIDC') as IDPRawType,
    state: raw.state as string | undefined,
    owner: raw.owner as string | undefined,
    oidcConfig,
    oauthConfig,
    jwtConfig,
    options,
    raw,
  };
}

// ---- API functions ---------------------------------------------------------

/**
 * List IDPs via GET /v2beta/settings/login/idps.
 * Pass orgId to scope to a specific org — sent as ctx.orgId query param.
 */
export async function listIDPs(orgId?: string): Promise<IdentityProvider[]> {
  const res = await api.get<Record<string, unknown>>(
    EP.idpList(orgId),
    orgId ? { orgId } : undefined,
  );
  // v2beta returns `identityProviders`; older endpoints return `idps` or `result`
  const rows = (res.identityProviders ?? res.idps ?? res.result ?? []) as Array<Record<string, unknown>>;
  return rows.map(normalizeIDP);
}

export async function getIDP(id: string): Promise<IdentityProvider> {
  const res = await api.get<Record<string, unknown>>(EP.idpGet(id));
  const raw = (res.idp ?? res) as Record<string, unknown>;
  return normalizeIDP(raw);
}

export async function deleteIDP(id: string): Promise<void> {
  await api.delete(EP.idpDelete(id));
}

export async function activateIDP(id: string): Promise<void> {
  await api.post(EP.idpActivate(id), {});
}

export async function deactivateIDP(id: string): Promise<void> {
  await api.post(EP.idpDeactivate(id), {});
}

// ---- Create ----------------------------------------------------------------

export interface CreateOIDCIDPInput {
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  displayNameMapping?: string;
  usernameMapping?: string;
  isAutoRegister?: boolean;
}

export async function createOIDCIDP(input: CreateOIDCIDPInput, orgId?: string): Promise<string> {
  const res = await api.post<Record<string, unknown>>(EP.idpCreateOIDC(), {
    name: input.name,
    issuer: input.issuer,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    scopes: input.scopes ?? ['openid', 'profile', 'email'],
    displayNameMapping: input.displayNameMapping ?? 'IDP_CONFIG_MAPPING_FIELD_PREFERRED_USERNAME',
    usernameMapping: input.usernameMapping ?? 'IDP_CONFIG_MAPPING_FIELD_EMAIL',
    isAutoRegister: input.isAutoRegister ?? false,
  }, orgId ? { orgId } : undefined);
  return String(res.id ?? res.idpId ?? '');
}

export interface CreateOAuthIDPInput {
  name: string;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userEndpoint: string;
  scopes?: string[];
  idAttribute?: string;
}

export async function createOAuthIDP(input: CreateOAuthIDPInput, orgId?: string): Promise<string> {
  const res = await api.post<Record<string, unknown>>(EP.idpCreateOAuth(), {
    name: input.name,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    authorizationEndpoint: input.authorizationEndpoint,
    tokenEndpoint: input.tokenEndpoint,
    userEndpoint: input.userEndpoint,
    scopes: input.scopes ?? ['openid', 'profile', 'email'],
    idAttribute: input.idAttribute ?? 'sub',
  }, orgId ? { orgId } : undefined);
  return String(res.id ?? res.idpId ?? '');
}

export interface CreateJWTIDPInput {
  name: string;
  jwtEndpoint: string;
  issuer: string;
  keysEndpoint: string;
  headerName?: string;
}

export async function createJWTIDP(input: CreateJWTIDPInput, orgId?: string): Promise<string> {
  const res = await api.post<Record<string, unknown>>(EP.idpCreateJWT(), {
    name: input.name,
    jwtEndpoint: input.jwtEndpoint,
    issuer: input.issuer,
    keysEndpoint: input.keysEndpoint,
    headerName: input.headerName ?? 'authorization',
  }, orgId ? { orgId } : undefined);
  return String(res.id ?? res.idpId ?? '');
}

// ---- Update ----------------------------------------------------------------

export interface UpdateOIDCIDPInput extends Omit<CreateOIDCIDPInput, 'clientSecret'> {
  /** Omit to leave the current secret unchanged. */
  clientSecret?: string;
}

export async function updateOIDCIDP(id: string, input: UpdateOIDCIDPInput): Promise<void> {
  const body: Record<string, unknown> = {
    name: input.name,
    issuer: input.issuer,
    clientId: input.clientId,
    scopes: input.scopes ?? ['openid', 'profile', 'email'],
    displayNameMapping: input.displayNameMapping ?? 'IDP_CONFIG_MAPPING_FIELD_PREFERRED_USERNAME',
    usernameMapping: input.usernameMapping ?? 'IDP_CONFIG_MAPPING_FIELD_EMAIL',
    isAutoRegister: input.isAutoRegister ?? false,
  };
  if (input.clientSecret) body.clientSecret = input.clientSecret;
  await api.put(EP.idpUpdateOIDC(id), body);
}

export interface UpdateOAuthIDPInput extends Omit<CreateOAuthIDPInput, 'clientSecret'> {
  clientSecret?: string;
}

export async function updateOAuthIDP(id: string, input: UpdateOAuthIDPInput): Promise<void> {
  const body: Record<string, unknown> = {
    name: input.name,
    clientId: input.clientId,
    authorizationEndpoint: input.authorizationEndpoint,
    tokenEndpoint: input.tokenEndpoint,
    userEndpoint: input.userEndpoint,
    scopes: input.scopes ?? [],
    idAttribute: input.idAttribute ?? 'sub',
  };
  if (input.clientSecret) body.clientSecret = input.clientSecret;
  await api.put(EP.idpUpdateOAuth(id), body);
}

export async function updateJWTIDP(id: string, input: CreateJWTIDPInput): Promise<void> {
  await api.put(EP.idpUpdateJWT(id), {
    name: input.name,
    jwtEndpoint: input.jwtEndpoint,
    issuer: input.issuer,
    keysEndpoint: input.keysEndpoint,
    headerName: input.headerName ?? 'authorization',
  });
}
