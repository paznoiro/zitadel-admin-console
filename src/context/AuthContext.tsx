import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearSession,
  getSession,
  normalizeBaseUrl,
  patchSession,
  setSession,
  type ZitadelSession,
} from '../api/session';
import { listOrganizations } from '../api/orgs';
import type { Organization } from '../api/types';
import type { AuthKind } from '../api/session';

export interface ConnectExtras {
  kind?: AuthKind;
  refreshToken?: string;
  idToken?: string;
  tokenResponse?: Record<string, unknown>;
  clientId?: string;
  tokenEndpoint?: string;
  oauthScope?: string;
  expiresIn?: number;
}

interface AuthState {
  connected: boolean;
  session: ZitadelSession | null;
  /** Organizations visible to the token, loaded at connect time. */
  orgs: Organization[];
  /** Currently scoped organization id (used by project/user views). */
  activeOrgId: string | null;
  connect: (baseUrl: string, token: string, extras?: ConnectExtras) => Promise<void>;
  disconnect: () => void;
  setActiveOrg: (orgId: string) => void;
  refreshOrgs: () => Promise<Organization[]>;
}

const AuthContext = createContext<AuthState | null>(null);

const ACTIVE_ORG_KEY = 'zitadel-admin.activeOrg';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<ZitadelSession | null>(() => getSession());
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_ORG_KEY),
  );

  const loadOrgs = useCallback(async () => {
    const { organizations } = await listOrganizations({ limit: 300 });
    setOrgs(organizations);
    setActiveOrgId((prev) => {
      if (prev && organizations.some((o) => o.id === prev)) return prev;
      const next = organizations[0]?.id ?? null;
      if (next) localStorage.setItem(ACTIVE_ORG_KEY, next);
      return next;
    });
    return organizations;
  }, []);

  // On a hard refresh with a stored session, re-hydrate the org list.
  useEffect(() => {
    if (session && orgs.length === 0) {
      loadOrgs().catch(() => {
        /* token may have expired; the UI surfaces the next failing call */
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(
    async (baseUrlRaw: string, token: string, extras?: ConnectExtras) => {
      const baseUrl = normalizeBaseUrl(baseUrlRaw);
      const label = baseUrl.replace(/^https?:\/\//, '');
      const next: ZitadelSession = {
        baseUrl,
        token: token.trim(),
        label,
        kind: extras?.kind ?? 'pat',
        refreshToken: extras?.refreshToken,
        idToken: extras?.idToken,
        tokenResponse: extras?.tokenResponse,
        clientId: extras?.clientId,
        tokenEndpoint: extras?.tokenEndpoint,
        oauthScope: extras?.oauthScope,
        expiresAt: extras?.expiresIn ? Date.now() + extras.expiresIn * 1000 : undefined,
      };
      setSession(next); // client reads from here for the validation call below
      try {
        const organizations = await loadOrgs();
        setSessionState(next);
        if (!organizations.length) {
          // Connection works but no orgs visible — still a valid session.
          setSessionState(next);
        }
      } catch (err) {
        clearSession();
        setSessionState(null);
        throw err;
      }
    },
    [loadOrgs],
  );

  const disconnect = useCallback(() => {
    clearSession();
    localStorage.removeItem(ACTIVE_ORG_KEY);
    setSessionState(null);
    setOrgs([]);
    setActiveOrgId(null);
  }, []);

  const setActiveOrg = useCallback((orgId: string) => {
    localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    patchSession({ orgId });
    setActiveOrgId(orgId);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      connected: !!session,
      session,
      orgs,
      activeOrgId,
      connect,
      disconnect,
      setActiveOrg,
      refreshOrgs: loadOrgs,
    }),
    [session, orgs, activeOrgId, connect, disconnect, setActiveOrg, loadOrgs],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
