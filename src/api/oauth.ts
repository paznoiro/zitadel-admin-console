import { normalizeBaseUrl, getSession, patchSession } from './session';

/**
 * OIDC Authorization Code + PKCE login against any ZITADEL instance.
 *
 * Flow:
 *   1. beginLogin()    — discover endpoints, build a PKCE challenge, redirect to
 *                        the instance's hosted login.
 *   2. (user authenticates on the ZITADEL login page)
 *   3. completeLogin() — runs on our /callback route: validates state, exchanges
 *                        the code for an access token + refresh token.
 *
 * The resulting access token becomes the session Bearer token, so every API
 * call in the app uses it automatically. refreshAccessToken() keeps it alive.
 */

const DISCOVERY = '/.well-known/openid-configuration';
const PENDING_KEY = 'zitadel-admin.oauth-pending';

// Scopes: openid/profile/email for identity, offline_access for a refresh token,
// optional org scoping, and the reserved aud scope so the token is accepted by
// the ZITADEL APIs.
const BASE_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
];
const ZITADEL_AUDIENCE_SCOPE = 'urn:zitadel:iam:org:project:id:zitadel:aud';

export function buildLoginScope(orgIdRaw = ''): string {
  const orgId = orgIdRaw.trim();
  return [
    ...BASE_SCOPES,
    ...(orgId ? [`urn:zitadel:iam:org:id:${orgId}`] : []),
    ZITADEL_AUDIENCE_SCOPE,
  ].join(' ');
}

interface OidcConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
}

interface PendingAuth {
  baseUrl: string;
  clientId: string;
  verifier: string;
  state: string;
  redirectUri: string;
  scope: string;
}

export interface OidcLoginResult {
  baseUrl: string;
  token: string;
  refreshToken?: string;
  idToken?: string;
  tokenResponse: Record<string, unknown>;
  expiresIn?: number;
  clientId: string;
  tokenEndpoint: string;
  scope: string;
}

export function redirectUri(): string {
  return `${window.location.origin}/callback`;
}

async function fetchOidcConfig(baseUrl: string): Promise<OidcConfig> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${DISCOVERY}`, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new Error(
      `Couldn't reach ${baseUrl}. Check the URL and that the instance allows requests from this origin. (${(err as Error).message})`,
    );
  }
  if (!res.ok) throw new Error(`OIDC discovery failed (${res.status}) at ${baseUrl}${DISCOVERY}`);
  return (await res.json()) as OidcConfig;
}

// ---- PKCE helpers ----------------------------------------------------------

function base64url(bytes: Uint8Array): string {
  let str = '';
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(byteLength = 48): string {
  const a = new Uint8Array(byteLength);
  crypto.getRandomValues(a);
  return base64url(a);
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return new Uint8Array(digest);
}

// ---- Public flow -----------------------------------------------------------

export async function beginLogin(
  baseUrlRaw: string,
  clientIdRaw: string,
  orgIdRaw = '',
): Promise<void> {
  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  const clientId = clientIdRaw.trim();
  if (!baseUrl || !clientId) throw new Error('Server URL and Client ID are both required.');
  const scope = buildLoginScope(orgIdRaw);

  const cfg = await fetchOidcConfig(baseUrl);
  const verifier = randomToken(48);
  const challenge = base64url(await sha256(verifier));
  const state = randomToken(16);
  const uri = redirectUri();

  const pending: PendingAuth = { baseUrl, clientId, verifier, state, redirectUri: uri, scope };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: uri,
    response_type: 'code',
    scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'login',
  });
  window.location.assign(`${cfg.authorization_endpoint}?${params.toString()}`);
}

export function hasPendingLogin(): boolean {
  return !!sessionStorage.getItem(PENDING_KEY);
}

export async function completeLogin(search: string): Promise<OidcLoginResult> {
  const params = new URLSearchParams(search);
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) throw new Error('No login in progress. Start again from the sign-in page.');
  const pending = JSON.parse(raw) as PendingAuth;

  const error = params.get('error');
  if (error) {
    sessionStorage.removeItem(PENDING_KEY);
    throw new Error(`${error}: ${params.get('error_description') ?? 'Login was cancelled or denied.'}`);
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code) throw new Error('Authorization code missing from the callback.');
  if (state !== pending.state) throw new Error('State mismatch — aborting for safety (possible CSRF).');

  const cfg = await fetchOidcConfig(pending.baseUrl);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirectUri,
    client_id: pending.clientId,
    code_verifier: pending.verifier,
  });

  const res = await fetch(cfg.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !data.access_token) {
    throw new Error(
      (data.error_description as string) ||
        (data.error as string) ||
        `Token exchange failed (${res.status}).`,
    );
  }

  sessionStorage.removeItem(PENDING_KEY);
  return {
    baseUrl: pending.baseUrl,
    token: String(data.access_token),
    refreshToken: data.refresh_token as string | undefined,
    idToken: data.id_token as string | undefined,
    tokenResponse: data,
    expiresIn: typeof data.expires_in === 'number' ? data.expires_in : undefined,
    clientId: pending.clientId,
    tokenEndpoint: cfg.token_endpoint,
    scope: pending.scope,
  };
}

/**
 * Exchanges the stored refresh token for a fresh access token and updates the
 * session in place. Returns false if there's nothing to refresh or it fails;
 * the caller (the API client) then lets the original 401 surface.
 */
export async function refreshAccessToken(): Promise<boolean> {
  const s = getSession();
  if (!s || s.kind !== 'oidc' || !s.refreshToken || !s.tokenEndpoint || !s.clientId) return false;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: s.refreshToken,
    client_id: s.clientId,
    scope: s.oauthScope ?? buildLoginScope(),
  });
  try {
    const res = await fetch(s.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !data.access_token) return false;
    const nextRefreshToken = (data.refresh_token as string | undefined) ?? s.refreshToken;
    patchSession({
      token: String(data.access_token),
      refreshToken: nextRefreshToken,
      idToken: (data.id_token as string | undefined) ?? s.idToken,
      tokenResponse: {
        ...(s.tokenResponse ?? {}),
        ...data,
        access_token: String(data.access_token),
        refresh_token: nextRefreshToken,
        ...(data.id_token ? { id_token: data.id_token } : s.idToken ? { id_token: s.idToken } : {}),
      },
      expiresAt:
        typeof data.expires_in === 'number' ? Date.now() + data.expires_in * 1000 : undefined,
    });
    return true;
  } catch {
    return false;
  }
}
