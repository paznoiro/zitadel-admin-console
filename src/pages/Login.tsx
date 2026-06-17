import { useState, type ClipboardEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  KeyRound,
  Globe,
  ShieldCheck,
  Eye,
  EyeOff,
  Fingerprint,
  Copy,
  Info,
  Github,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Field, Input, cn } from '../components/ui';
import { ApiError } from '../api/client';
import { beginLogin, buildLoginScope, redirectUri } from '../api/oauth';
import { useToast } from '../components/Toast';
import { normalizeBaseUrl } from '../api/session';

type Mode = 'pat' | 'sso';

export default function Login() {
  const { connect } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('pat');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function normalizeServerUrlInput(value = baseUrl) {
    const normalized = normalizeBaseUrl(value);
    setBaseUrl(normalized);
    return normalized;
  }

  function onPasteServerUrl(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text');
    if (!pasted.trim()) return;
    e.preventDefault();
    setBaseUrl(normalizeBaseUrl(pasted));
  }

  async function onSubmitPat(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const normalizedBaseUrl = normalizeServerUrlInput();
      await connect(normalizedBaseUrl, token);
      navigate('/', { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 401 || err.status === 403
            ? 'Authentication failed — check the token has the right permissions.'
            : err.message
          : (err as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitSso(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const normalizedBaseUrl = normalizeServerUrlInput();
      // Redirects away to the instance's hosted login; returns via /callback.
      await beginLogin(normalizedBaseUrl, clientId, orgId);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center p-6" data-testid="login-page">
      <div className="w-full max-w-md fade-up" data-testid="login-card">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] shadow-[0_12px_40px_-10px_rgba(124,92,255,0.8)]">
            <svg viewBox="0 0 32 32" className="size-9">
              <path d="M9 22 L16 8 L23 22 Z" fill="white" fillOpacity="0.95" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">ZITADEL Admin Console</h1>
          <p className="mt-1.5 text-sm text-[var(--color-ink-dim)]">
            Connect to your instance to manage it.
          </p>
        </div>

        <div className="glass p-6">
          {/* Mode toggle */}
          <div className="mb-5 flex gap-1 rounded-xl border border-white/10 bg-white/4 p-1" data-testid="login-mode-tabs">
            {(
              [
                ['pat', 'Access Token', KeyRound],
                ['sso', 'Single Sign-On', Fingerprint],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                data-testid={`login-mode-${m}`}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                  mode === m
                    ? 'bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                    : 'text-[var(--color-ink-dim)] hover:text-white',
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>

          <Field label="Server URL" required hint="e.g. https://my-instance.zitadel.cloud">
            <div className="relative">
              <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-dim)]" />
              <Input
                data-testid="login-server-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                onBlur={() => normalizeServerUrlInput()}
                onPaste={onPasteServerUrl}
                placeholder="https://your-instance.zitadel.cloud"
                className="pl-9"
                autoComplete="url"
                autoFocus
              />
            </div>
          </Field>

          {mode === 'pat' ? (
            <form onSubmit={onSubmitPat} className="mt-4 space-y-4" data-testid="login-pat-form">
              <Field
                label="Personal Access Token (PAT)"
                required
                hint="Used as a Bearer token for every request."
              >
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-dim)]" />
                  <Input
                    data-testid="login-pat-token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="paste token…"
                    className="px-9"
                    type={showToken ? 'text' : 'password'}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    data-testid="login-toggle-pat-token-visibility"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-ink-dim)] hover:text-white"
                    tabIndex={-1}
                  >
                    {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              {error && <ErrorNote text={error} />}

              <Button
                type="submit"
                data-testid="login-pat-submit"
                loading={loading}
                disabled={!baseUrl.trim() || !token.trim()}
                className="w-full"
                icon={<ArrowRight className="size-4" />}
              >
                {loading ? 'Connecting…' : 'Go'}
              </Button>
            </form>
          ) : (
            <form onSubmit={onSubmitSso} className="mt-4 space-y-4" data-testid="login-sso-form">
              <Field
                label="Client ID"
                required
                hint="From a PKCE-enabled application in your instance."
              >
                <div className="relative">
                  <Fingerprint className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-dim)]" />
                  <Input
                    data-testid="login-sso-client-id"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="1234567890@project"
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
              </Field>

              <Field
                label="Organization ID"
                hint="Optional. Adds the ZITADEL org scope for this login."
              >
                <div className="relative">
                  <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-dim)]" />
                  <Input
                    data-testid="login-sso-org-id"
                    value={orgId}
                    onChange={(e) => setOrgId(e.target.value)}
                    placeholder="377588840665194465"
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
              </Field>

              <ScopeHint orgId={orgId} />

              <RedirectHint />

              {error && <ErrorNote text={error} />}

              <Button
                type="submit"
                data-testid="login-sso-submit"
                loading={loading}
                disabled={!baseUrl.trim() || !clientId.trim()}
                className="w-full"
                icon={<Fingerprint className="size-4" />}
              >
                {loading ? 'Redirecting…' : 'Login with ZITADEL'}
              </Button>
            </form>
          )}

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-white/4 px-3 py-2.5 text-[11px] text-[var(--color-ink-dim)]">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--color-good)]" />
            <span>
              Credentials stay in your browser and are sent only to the instance you specify. SSO uses
              the OAuth2 Authorization Code + PKCE flow — no client secret is stored.
            </span>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-[var(--color-ink-dim)]">
          <a
            data-testid="login-github-link"
            href="https://github.com/paznoiro/zitadel-admin-console"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition hover:text-white"
          >
            <Github className="size-3.5" />
            Open source on GitHub
          </a>
        </p>
      </div>
    </div>
  );

  function RedirectHint() {
    const uri = redirectUri();
    return (
      <div className="rounded-xl border border-white/10 bg-white/4 px-3 py-2.5 text-[11px] text-[var(--color-ink-dim)]" data-testid="login-redirect-hint">
        <p className="mb-1.5 flex items-center gap-1.5 font-medium text-[var(--color-ink)]">
          <Info className="size-3.5" /> Register this redirect URI on your app
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-black/30 px-2 py-1 font-mono text-[11px] text-[var(--color-ink)]">
            {uri}
          </code>
          <button
            type="button"
            data-testid="login-copy-redirect-uri"
            onClick={() => {
              navigator.clipboard.writeText(uri);
              toast.success('Redirect URI copied');
            }}
            className="rounded-md p-1.5 text-[var(--color-ink-dim)] hover:bg-white/10 hover:text-white"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
        <p className="mt-1.5">
          Use an app of type <strong>User Agent (SPA)</strong> with auth method{' '}
          <strong>PKCE / None</strong>. Enable development mode for http/localhost URIs.
        </p>
      </div>
    );
  }
}

function ScopeHint({ orgId }: { orgId: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/4 px-3 py-2.5 text-[11px] text-[var(--color-ink-dim)]" data-testid="login-sso-scope-hint">
      <p className="mb-1.5 font-medium text-[var(--color-ink)]">OAuth scopes</p>
      <code className="block overflow-x-auto whitespace-nowrap rounded-md bg-black/30 px-2 py-1 font-mono text-[11px] text-[var(--color-ink)]" data-testid="login-sso-scope-value">
        {buildLoginScope(orgId)}
      </code>
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200" data-testid="login-error">
      {text}
    </div>
  );
}
