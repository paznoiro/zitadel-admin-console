/**
 * Holds the active connection credentials (server URL + PAT) outside of React
 * so the plain fetch client can read them without prop drilling. AuthContext is
 * the single writer; everything else only reads.
 */
export type AuthKind = 'pat' | 'oidc';

export interface ZitadelSession {
  /** Base server URL, e.g. https://my-instance.zitadel.cloud (no trailing slash). */
  baseUrl: string;
  /** Personal Access Token or an OIDC access token — used as the Bearer token. */
  token: string;
  /** How the token was obtained. */
  kind?: AuthKind;
  /** Resolved org id of the token owner, discovered at login. */
  orgId?: string;
  /** Friendly label shown in the UI (instance host). */
  label?: string;

  // ---- OIDC-only fields (enable silent token refresh) ----
  refreshToken?: string;
  idToken?: string;
  tokenResponse?: Record<string, unknown>;
  clientId?: string;
  tokenEndpoint?: string;
  oauthScope?: string;
  /** Epoch ms when the access token expires. */
  expiresAt?: number;
}

const STORAGE_KEY = 'zitadel-admin.session';

let current: ZitadelSession | null = null;

export function normalizeBaseUrl(url: string): string {
  let u = url.trim();
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    return new URL(u).origin;
  } catch {
    return u.replace(/\/+$/, '');
  }
}

export function loadSession(): ZitadelSession | null {
  if (current) return current;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) current = JSON.parse(raw) as ZitadelSession;
  } catch {
    current = null;
  }
  return current;
}

export function setSession(session: ZitadelSession): void {
  current = session;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage might be unavailable; in-memory copy still works */
  }
}

export function patchSession(patch: Partial<ZitadelSession>): void {
  if (!current) return;
  setSession({ ...current, ...patch });
}

export function clearSession(): void {
  current = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getSession(): ZitadelSession | null {
  return current ?? loadSession();
}
