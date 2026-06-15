import { getSession } from './session';
import { refreshAccessToken } from './oauth';

/**
 * Error thrown for any non-2xx response. Carries the HTTP status and the parsed
 * ZITADEL error payload so the UI can show the *server's* own message — which is
 * the fastest way to spot a version/path mismatch.
 */
export class ApiError extends Error {
  status: number;
  code?: number;
  /** ZITADEL error id, e.g. "AUTHZ-cdgFk" — stable across versions. */
  zitadelId?: string;
  /** The instance's original, unfriendly message (kept for debugging). */
  serverMessage?: string;
  details?: unknown;

  constructor(
    status: number,
    message: string,
    opts: { code?: number; zitadelId?: string; serverMessage?: string; details?: unknown } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = opts.code;
    this.zitadelId = opts.zitadelId;
    this.serverMessage = opts.serverMessage;
    this.details = opts.details;
  }
}

/**
 * Turns a raw ZITADEL error into something a human can act on. Matches on the
 * stable error id first, then on well-known message fragments, then on HTTP
 * status. Falls back to the server's own message.
 */
function humanize(status: number, serverMessage: string, zitadelId?: string): string {
  const msg = serverMessage.toLowerCase();

  // Known ZITADEL error ids (most reliable signal).
  switch (zitadelId) {
    case 'AUTHZ-cdgFk': // membership not found
      return (
        "Your token's user isn't an instance manager, so it can't create or delete " +
        'organizations. Grant that user the IAM_ORG_MANAGER (or IAM_OWNER) role, then retry.'
      );
    case 'AUTH-5mWD2': // no matching permissions
      return 'This token does not have permission to perform that action.';
    case 'AUTH-7fs1e': // token invalid
      return 'The token was rejected — it may have expired, or it does not support this request. Try reconnecting with a Personal Access Token.';
  }

  // Message-fragment fallbacks.
  if (msg.includes('membership not found'))
    return "Your token's user lacks instance-manager rights for this action. Grant IAM_ORG_MANAGER or IAM_OWNER.";
  if (msg.includes('no matching permissions') || msg.includes('permission denied'))
    return 'This token does not have permission to perform that action.';
  if (msg.includes('password') && (msg.includes('too short') || msg.includes('length')))
    return 'Password is too short. Use a longer password that meets your organization\'s policy.';
  if (msg.includes('password') && msg.includes('complexity'))
    return 'Password does not meet complexity requirements (uppercase, number, or symbol required).';
  if (msg.includes('already exists') || msg.includes('already in use'))
    return 'That already exists — pick a different name or key.';
  if (msg.includes('method not allowed'))
    return 'This action is not supported on your ZITADEL version (endpoint mismatch).';

  // HTTP status fallbacks.
  if (status === 401)
    return 'Authentication failed — the token is invalid or has expired. Reconnect to continue.';
  if (status === 403) return 'Permission denied for this action with the current token.';
  if (status === 404)
    return 'Not found. The resource may not exist, or this API is unavailable on your ZITADEL version.';
  if (status === 409) return 'Conflict — the resource already exists or is in a conflicting state.';
  if (status === 429) return 'Too many requests — slow down and try again in a moment.';
  if (status >= 500) return `The ZITADEL server returned an error (${status}). Try again shortly.`;

  return serverMessage || `Request failed with status ${status}`;
}

export interface RequestOptions {
  /** JSON body; serialized automatically. */
  body?: unknown;
  /** Sets the x-zitadel-orgid header to scope the call to another org. */
  orgId?: string;
  signal?: AbortSignal;
  /** Skip auth header (only used by unauthenticated probes). */
  anonymous?: boolean;
  /** Additional headers merged into the request (e.g. Connect-Protocol-Version). */
  extraHeaders?: Record<string, string>;
  /** Internal: set after a refresh retry to prevent infinite loops. */
  _retried?: boolean;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(
  status: number,
  payload: unknown,
): { message: string; code?: number; zitadelId?: string } {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    const message =
      (typeof p.message === 'string' && p.message) ||
      (typeof p.error === 'string' && p.error) ||
      (typeof p.error_description === 'string' && p.error_description) ||
      '';
    const code = typeof p.code === 'number' ? p.code : undefined;
    // ZITADEL nests a stable error id under details[].id
    let zitadelId: string | undefined;
    const details = p.details;
    if (Array.isArray(details) && details[0] && typeof details[0] === 'object') {
      const id = (details[0] as Record<string, unknown>).id;
      if (typeof id === 'string') zitadelId = id;
    }
    if (message) return { message, code, zitadelId };
  }
  if (typeof payload === 'string' && payload) return { message: payload };
  return { message: `Request failed with status ${status}` };
}

export async function request<T = unknown>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const session = getSession();
  if (!session && !opts.anonymous) {
    throw new ApiError(401, 'Not connected. Provide a server URL and token first.');
  }

  const base = session?.baseUrl ?? '';
  const url = `${base}${path}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.anonymous && session) headers['Authorization'] = `Bearer ${session.token}`;
  // Scope every call to the active org. `session.orgId` tracks the org selected
  // in the switcher (and is the token's own org before any switch), so this
  // keeps project/app/role/user writes in the same org the lists read from.
  // An explicit opts.orgId (e.g. the duplicate-org wizard) still wins.
  const orgId = opts.orgId ?? (opts.anonymous ? undefined : session?.orgId);
  if (orgId) headers['x-zitadel-orgid'] = orgId;
  if (opts.extraHeaders) Object.assign(headers, opts.extraHeaders);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    // Network/CORS failures land here with an opaque "Failed to fetch".
    throw new ApiError(
      0,
      `Could not reach ${base}. Check the URL is correct and that the ZITADEL instance allows ` +
        `requests from this origin (CORS). Original error: ${(err as Error).message}`,
    );
  }

  // For OIDC sessions, transparently refresh an expired access token once and
  // retry, so every API call keeps using a valid JWT without interrupting the user.
  if (res.status === 401 && !opts.anonymous && !opts._retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(method, path, { ...opts, _retried: true });
  }

  const payload = await parseBody(res);

  if (!res.ok) {
    const { message, code, zitadelId } = extractMessage(res.status, payload);
    throw new ApiError(res.status, humanize(res.status, message, zitadelId), {
      code,
      zitadelId,
      serverMessage: message,
      details: payload,
    });
  }

  return payload as T;
}

/** Upload a file via multipart/form-data. Used for logo / icon assets. */
async function uploadFile(
  path: string,
  file: File,
  opts: Omit<RequestOptions, 'body'> = {},
): Promise<unknown> {
  const session = getSession();
  if (!session) throw new ApiError(401, 'Not connected. Provide a server URL and token first.');

  const url = `${session.baseUrl}${path}`;
  const fd = new FormData();
  fd.append('file', file);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.token}`,
  };
  if (opts.orgId) headers['x-zitadel-orgid'] = opts.orgId;

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: fd, signal: opts.signal });
  } catch (err) {
    throw new ApiError(
      0,
      `Could not reach ${session.baseUrl}. Check URL and CORS. Error: ${(err as Error).message}`,
    );
  }

  const payload = await parseBody(res);
  if (!res.ok) {
    const { message, code, zitadelId } = extractMessage(res.status, payload);
    throw new ApiError(res.status, humanize(res.status, message, zitadelId), { code, zitadelId });
  }
  return payload;
}

export const api = {
  get: <T = unknown>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('POST', path, { ...opts, body }),
  put: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('PUT', path, { ...opts, body }),
  delete: <T = unknown>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
  upload: (path: string, file: File, opts?: Omit<RequestOptions, 'body'>) =>
    uploadFile(path, file, opts),
};
