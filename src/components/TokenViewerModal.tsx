import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, FileJson2, KeyRound, ShieldCheck, X } from 'lucide-react';
import { Badge, cn } from './ui';
import { useToast } from './Toast';
import type { ZitadelSession } from '../api/session';

type TokenKey = 'access_token' | 'id_token' | 'refresh_token';

const TOKEN_META: Record<TokenKey, { label: string; tone: string }> = {
  access_token: { label: 'Access', tone: 'from-sky-400/25 to-cyan-300/10 text-sky-200' },
  id_token: { label: 'ID', tone: 'from-violet-400/25 to-fuchsia-300/10 text-violet-200' },
  refresh_token: { label: 'Refresh', tone: 'from-emerald-400/25 to-teal-300/10 text-emerald-200' },
};

interface TokenEntry {
  key: TokenKey;
  label: string;
  value: string;
}

interface ParsedToken {
  header?: unknown;
  payload?: unknown;
  signature?: string;
  error?: string;
}

export function TokenViewerModal({
  open,
  onClose,
  session,
}: {
  open: boolean;
  onClose: () => void;
  session: ZitadelSession;
}) {
  const toast = useToast();
  const response = useMemo(() => buildTokenResponse(session), [session]);
  const tokens = useMemo(() => buildTokens(response), [response]);
  const [selectedKey, setSelectedKey] = useState<TokenKey>(tokens[0]?.key ?? 'access_token');
  const selected = tokens.find((token) => token.key === selectedKey) ?? tokens[0];
  const parsed = useMemo(() => parseJwt(selected?.value), [selected?.value]);
  const fullJson = useMemo(() => JSON.stringify(response, null, 2), [response]);

  function copy(value: string, label: string) {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-y-0 left-0 right-0 z-50 md:left-[260px]" data-testid="token-viewer-overlay">
      <div
        className="absolute inset-0 bg-[#04060f]/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="glass absolute inset-y-0 right-0 flex w-full flex-col rounded-none border-y-0 border-r-0 shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--color-ink)]">OIDC token response</h2>
            <p className="mt-0.5 text-xs text-[var(--color-ink-dim)]">
              Raw OAuth response, individual tokens, and decoded JWT details.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="token-viewer-close"
            className="rounded-lg p-1 text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-white"
            title="Close token viewer"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(520px,1fr)]" data-testid="token-viewer">
        <section className="min-w-0 space-y-3" data-testid="token-viewer-response-panel">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3" data-testid="token-viewer-full-json">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileJson2 className="size-4 text-[var(--color-accent-2)]" />
                <p className="text-sm font-semibold text-white">Full JSON</p>
              </div>
              <button
                type="button"
                data-testid="token-copy-full-json"
                onClick={() => copy(fullJson, 'Full token JSON')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-ink)] transition hover:bg-white/10"
              >
                <Copy className="size-3.5" />
                Copy JSON
              </button>
            </div>
            <JsonBlock value={response} className="max-h-56" dataId="token-full-json" />
          </div>

          <div className="grid gap-2" data-testid="token-list">
            {tokens.map((token) => {
              const isSelected = selected?.key === token.key;
              return (
                <div
                  role="button"
                  tabIndex={0}
                  key={token.key}
                  data-testid={`token-row-${token.key.replace(/_/g, '-')}`}
                  onClick={() => setSelectedKey(token.key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedKey(token.key);
                    }
                  }}
                  className={cn(
                    'min-w-0 cursor-pointer rounded-2xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-300/45',
                    isSelected
                      ? 'border-cyan-200/45 bg-cyan-300/12 shadow-[0_18px_46px_-24px_rgba(125,211,252,0.9)] ring-1 ring-cyan-200/25'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]',
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      data-testid={`token-select-${token.key.replace(/_/g, '-')}`}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r px-2.5 py-1 text-[11px] font-semibold',
                        TOKEN_META[token.key].tone,
                      )}
                    >
                      {isSelected ? <Check className="size-3" /> : <KeyRound className="size-3" />}
                      {token.label} token
                    </span>
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        data-testid={`token-copy-${token.key.replace(/_/g, '-')}-json`}
                        onClick={(event) => {
                          event.stopPropagation();
                          copy(JSON.stringify({ [token.key]: token.value }, null, 2), `${token.label} token JSON`);
                        }}
                        className="rounded-lg p-1.5 text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-white"
                        title={`Copy ${token.label} token as JSON`}
                      >
                        <FileJson2 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        data-testid={`token-copy-${token.key.replace(/_/g, '-')}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          copy(token.value, `${token.label} token`);
                        }}
                        className="rounded-lg p-1.5 text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-white"
                        title={`Copy ${token.label} token`}
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </span>
                  </div>
                  <code className="block max-h-20 overflow-auto break-all rounded-xl bg-black/30 p-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink)]" data-testid={`token-value-${token.key.replace(/_/g, '-')}`}>
                    {token.value}
                  </code>
                </div>
              );
            })}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_32%),rgba(255,255,255,0.035)] p-3" data-testid="token-details-panel">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {selected ? `${selected.label} token details` : 'Token details'}
              </p>
              <p className="text-[11px] text-[var(--color-ink-dim)]">
                {parsed.error ? 'Opaque or invalid JWT' : 'Decoded JWT JSON'}
              </p>
            </div>
            <Badge tone={parsed.error ? 'warn' : 'good'}>
              <ShieldCheck className="size-3" />
              {parsed.error ? 'Raw' : 'JWT'}
            </Badge>
          </div>

          {parsed.error ? (
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100" data-testid="token-details-error">
              {parsed.error}
            </div>
          ) : (
            <div className="space-y-3">
              <TokenPart title="Header" value={parsed.header} tone="sky" dataId="token-details-header" />
              <TokenPart
                title="Payload"
                value={parsed.payload}
                tone="violet"
                dataId="token-details-payload"
                className="max-h-[52vh] min-h-80"
              />
              {parsed.signature && (
                <TokenPart
                  title="Signature"
                  value={{ signature: parsed.signature }}
                  tone="emerald"
                  dataId="token-details-signature"
                />
              )}
            </div>
          )}
        </section>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function buildTokenResponse(session: ZitadelSession): Record<string, unknown> {
  const response = { ...(session.tokenResponse ?? {}) };
  response.access_token = session.token;
  if (session.idToken) response.id_token = session.idToken;
  if (session.refreshToken) response.refresh_token = session.refreshToken;
  if (session.oauthScope) response.scope = response.scope ?? session.oauthScope;
  if (session.expiresAt) {
    response.expires_at = new Date(session.expiresAt).toISOString();
  }
  return response;
}

function buildTokens(response: Record<string, unknown>): TokenEntry[] {
  return (Object.keys(TOKEN_META) as TokenKey[])
    .map((key) => {
      const value = response[key];
      if (typeof value !== 'string' || !value) return null;
      return { key, label: TOKEN_META[key].label, value };
    })
    .filter((token): token is TokenEntry => Boolean(token));
}

function parseJwt(token?: string): ParsedToken {
  if (!token) return { error: 'No token selected.' };
  const parts = token.split('.');
  if (parts.length !== 3) return { error: 'This token is opaque, so there are no JWT claims to decode.' };

  try {
    return {
      header: decodeJwtPart(parts[0]),
      payload: decodeJwtPart(parts[1]),
      signature: parts[2],
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { error: 'This token is not a JSON Web Token, so there are no JSON claims to decode.' };
    }
    return { error: `Could not decode this token as JWT JSON. ${(err as Error).message}` };
  }
}

function decodeJwtPart(part: string): unknown {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function TokenPart({
  title,
  value,
  tone,
  dataId,
  className,
}: {
  title: string;
  value: unknown;
  tone: 'sky' | 'violet' | 'emerald';
  dataId: string;
  className?: string;
}) {
  const toneClass =
    tone === 'sky'
      ? 'border-sky-300/20 bg-sky-300/10 text-sky-200'
      : tone === 'violet'
        ? 'border-violet-300/20 bg-violet-300/10 text-violet-200'
        : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200';

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20" data-testid={dataId}>
      <div className={cn('border-b px-3 py-2 text-xs font-semibold', toneClass)}>{title}</div>
      <JsonBlock
        value={value}
        className={cn('max-h-64 rounded-none border-0 bg-transparent', className)}
        dataId={`${dataId}-json`}
      />
    </div>
  );
}

function JsonBlock({
  value,
  className,
  dataId,
}: {
  value: unknown;
  className?: string;
  dataId: string;
}) {
  return (
    <pre
      data-testid={dataId}
      className={cn(
        'overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-[var(--color-ink)]',
        className,
      )}
    >
      <code>{JSON.stringify(value, null, 2)}</code>
    </pre>
  );
}
