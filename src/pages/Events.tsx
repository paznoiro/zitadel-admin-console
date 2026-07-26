import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { searchEvents, listEventTypes } from '../api/events';
import type { ZitadelEvent } from '../api/events';
import { Button, EmptyState, ErrorBox, Field, Input, PageHeader, Select, Spinner } from '../components/ui';

// ---- constants -------------------------------------------------------------

const AGGREGATE_TYPES = [
  'action',
  'api_app',
  'auth_request',
  'execution',
  'flow',
  'idp',
  'idp_user',
  'instance',
  'label_policy',
  'login_policy',
  'member',
  'oidc_app',
  'oidc_session',
  'org',
  'org_member',
  'project',
  'project_grant',
  'project_grant_member',
  'project_member',
  'project_role',
  'saml_app',
  'saml_request',
  'session',
  'user',
  'user_grant',
];

const LIMITS = [25, 50, 100, 200];

// ---- helpers ---------------------------------------------------------------

function formatDate(iso?: string) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fromInputValue(val: string): string {
  if (!val) return '';
  return new Date(val).toISOString();
}

// ---- event type combobox ---------------------------------------------------

function EventTypeCombobox({
  value,
  onChange,
  types,
}: {
  value: string;
  onChange: (v: string) => void;
  types: Array<{ type: string; localizedMessage?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return types.slice(0, 50);
    return types.filter(
      (t) =>
        t.type.toLowerCase().includes(q) ||
        (t.localizedMessage ?? '').toLowerCase().includes(q),
    ).slice(0, 50);
  }, [query, types]);

  function select(type: string) {
    onChange(type);
    setQuery(type);
    setOpen(false);
  }

  function clear() {
    onChange('');
    setQuery('');
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={types.length ? `Filter from ${types.length} types…` : 'e.g. user.human.added'}
          className="glass-input w-full px-3.5 py-2.5 pr-8 text-sm"
          autoComplete="off"
        />
        {query && (
          <button
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-ink-dim)] hover:text-white"
            tabIndex={-1}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-white/15 bg-[#0d1127] p-1 shadow-2xl">
          {filtered.map((t) => (
            <button
              key={t.type}
              onMouseDown={() => select(t.type)}
              className="flex w-full flex-col rounded-lg px-3 py-2 text-left transition hover:bg-white/10"
            >
              <span className="font-mono text-xs text-white">{t.type}</span>
              {t.localizedMessage && (
                <span className="text-[11px] text-[var(--color-ink-dim)]">{t.localizedMessage}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- event row -------------------------------------------------------------

function EventRow({ event }: { event: ZitadelEvent }) {
  const [expanded, setExpanded] = useState(false);
  const typeStr = event.type?.type ?? '—';
  const localized = event.type?.localized?.localizedMessage;
  const hasPayload =
    event.payload != null &&
    typeof event.payload === 'object' &&
    Object.keys(event.payload as object).length > 0;
  const aggId = event.aggregate?.id;
  // aggregate.type is a nested object { type: string, localized: {...} }
  const aggType =
    typeof event.aggregate?.type === 'object'
      ? (event.aggregate?.type as { type?: string })?.type
      : String(event.aggregate?.type ?? '');
  const editorName = event.editor?.displayName || event.editor?.userId || event.editor?.service || '—';

  return (
    <>
      <div
        className={`group grid cursor-pointer grid-cols-[1fr_auto] items-start gap-2 px-4 py-3 transition hover:bg-white/4 sm:grid-cols-[2fr_1fr_1.5fr_1fr_1fr_auto] ${hasPayload ? '' : 'cursor-default'}`}
        onClick={() => hasPayload && setExpanded((v) => !v)}
      >
        {/* Event type */}
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 shrink-0">
            {hasPayload ? (
              expanded
                ? <ChevronDown className="size-3.5 text-[var(--color-accent-2)]" />
                : <ChevronRight className="size-3.5 text-[var(--color-ink-dim)]" />
            ) : (
              <span className="inline-block size-3.5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-white" title={typeStr}>{typeStr}</p>
            {localized && localized !== typeStr && (
              <p className="truncate text-[11px] text-[var(--color-ink-dim)]">{localized}</p>
            )}
          </div>
        </div>
        {/* Aggregate type */}
        <span className="hidden rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink-dim)] sm:inline-block self-start">
          {aggType ?? '—'}
        </span>
        {/* Aggregate ID */}
        <span
          className="hidden truncate font-mono text-[11px] text-[var(--color-ink-dim)] sm:block self-start"
          title={aggId}
        >
          {aggId ? `${aggId.slice(0, 20)}…` : '—'}
        </span>
        {/* Timestamp */}
        <span className="hidden whitespace-nowrap text-[11px] text-[var(--color-ink-dim)] sm:block self-start">
          {formatDate(event.creationDate)}
        </span>
        {/* Editor */}
        <span
          className="hidden truncate text-[11px] text-[var(--color-ink-dim)] sm:block self-start"
          title={event.editor?.userId}
        >
          {editorName}
        </span>
        {/* Sequence */}
        <span className="hidden font-mono text-[11px] text-[var(--color-ink-dim)]/50 sm:block self-start">
          {event.sequence ?? ''}
        </span>
      </div>
      {expanded && hasPayload && (
        <div className="border-t border-white/5 bg-black/20 px-8 py-3">
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-emerald-300/80">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}

// ---- page ------------------------------------------------------------------

export default function Events() {
  // filters — from is optional, no default (API returns all events without it)
  const [aggregateTypes, setAggregateTypes] = useState<string[]>([]);
  const [aggregateId, setAggregateId] = useState('');
  const [eventType, setEventType] = useState('');
  const [editorUserId, setEditorUserId] = useState('');
  const [resourceOwner, setResourceOwner] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [limit, setLimit] = useState(50);
  const [asc, setAsc] = useState(false);

  const [results, setResults] = useState<ZitadelEvent[] | null>(null);
  const [searchError, setSearchError] = useState<Error | null>(null);
  const [cursorSequence, setCursorSequence] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);

  // Fetch all event types once for the autocomplete
  const typesQ = useQuery({
    queryKey: ['event-types'],
    queryFn: listEventTypes,
    staleTime: Infinity,
  });

  const buildParams = useCallback((sequence?: string) => ({
    from: fromDate ? fromInputValue(fromDate) : undefined,
    to: toDate ? fromInputValue(toDate) : undefined,
    aggregateTypes: aggregateTypes.length ? aggregateTypes : undefined,
    aggregateId: aggregateId || undefined,
    eventTypes: eventType.trim() ? [eventType.trim()] : undefined,
    editorUserId: editorUserId || undefined,
    resourceOwner: resourceOwner || undefined,
    limit,
    asc,
    sequence,
  }), [fromDate, toDate, aggregateTypes, aggregateId, eventType, editorUserId, resourceOwner, limit, asc]);

  const searchM = useMutation({
    mutationFn: () => searchEvents(buildParams()),
    onSuccess: (data) => {
      setResults(data);
      setCursorSequence(data.length > 0 ? data[data.length - 1].sequence : undefined);
      setHasMore(data.length >= limit);
      setSearchError(null);
    },
    onError: (e: Error) => { setSearchError(e); setResults(null); setHasMore(false); },
  });

  const loadMoreM = useMutation({
    mutationFn: () => searchEvents(buildParams(cursorSequence)),
    onSuccess: (data) => {
      setResults((prev) => [...(prev ?? []), ...data]);
      setCursorSequence(data.length > 0 ? data[data.length - 1].sequence : undefined);
      setHasMore(data.length >= limit);
    },
    onError: (e: Error) => { setSearchError(e); },
  });

  function toggleAggType(t: string) {
    setAggregateTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  return (
    <>
      <PageHeader
        title="Event Log"
        subtitle="Search events recorded by this ZITADEL instance (admin/v1)."
        icon={<Activity className="size-5" />}
        actions={
          <Button
            icon={<Search className="size-4" />}
            onClick={() => searchM.mutate()}
            loading={searchM.isPending}
          >
            Search events
          </Button>
        }
      />

      {/* ---- Filter panel ---- */}
      <div className="glass mb-5 space-y-4 p-4">
        {/* Date range + resource owner */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="From" hint="Optional — omit to return all events">
            <input
              type="datetime-local"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="glass-input w-full px-3.5 py-2.5 text-sm"
            />
          </Field>
          <Field label="To" hint="Optional — leave empty for latest events">
            <input
              type="datetime-local"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="glass-input w-full px-3.5 py-2.5 text-sm"
            />
          </Field>
          <Field label="Resource owner (org ID)">
            <Input
              value={resourceOwner}
              onChange={(e) => setResourceOwner(e.target.value)}
              placeholder="270965492670…"
              onKeyDown={(e) => e.key === 'Enter' && searchM.mutate()}
            />
          </Field>
        </div>

        {/* Event type + secondary filters */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Event type" hint="Start typing to filter — fetched live from your instance">
            {typesQ.isLoading ? (
              <Input disabled placeholder="Loading event types…" />
            ) : (
              <EventTypeCombobox
                value={eventType}
                onChange={setEventType}
                types={typesQ.data ?? []}
              />
            )}
          </Field>
          <Field label="Aggregate ID">
            <Input
              value={aggregateId}
              onChange={(e) => setAggregateId(e.target.value)}
              placeholder="270965492670…"
              onKeyDown={(e) => e.key === 'Enter' && searchM.mutate()}
            />
          </Field>
          <Field label="Editor user ID">
            <Input
              value={editorUserId}
              onChange={(e) => setEditorUserId(e.target.value)}
              placeholder="270965492670…"
              onKeyDown={(e) => e.key === 'Enter' && searchM.mutate()}
            />
          </Field>
        </div>

        {/* Aggregate type multi-select chips */}
        <div>
          <p className="mb-2 text-[11px] font-medium text-[var(--color-ink-dim)]">
            Aggregate types
            {aggregateTypes.length > 0 && (
              <button
                onClick={() => setAggregateTypes([])}
                className="ml-2 text-[var(--color-accent-2)] hover:underline"
              >
                clear
              </button>
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {AGGREGATE_TYPES.map((t) => {
              const active = aggregateTypes.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleAggType(t)}
                  className={`rounded-full border px-3 py-1 font-mono text-[11px] transition ${
                    active
                      ? 'border-[var(--color-accent)]/60 bg-[var(--color-accent)]/15 text-white'
                      : 'border-white/10 bg-white/4 text-[var(--color-ink-dim)] hover:bg-white/8 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={asc}
              onChange={(e) => setAsc(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            Ascending order
          </label>
        </div>
      </div>

      {/* ---- Results ---- */}
      {searchM.isPending ? (
        <Spinner label="Searching events…" />
      ) : searchError ? (
        <ErrorBox error={searchError} />
      ) : results === null ? (
        <div className="glass">
          <EmptyState
            icon={<Activity className="size-6" />}
            title="No search run yet"
            description="Set filters above and press Search events."
          />
        </div>
      ) : results.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon={<Activity className="size-6" />}
            title="No events found"
            description="Try broadening your filters or extending the date range."
          />
        </div>
      ) : (
        <div className="glass overflow-hidden p-0">
          <div className="hidden grid-cols-[2fr_1fr_1.5fr_1fr_1fr_auto] gap-2 border-b border-white/10 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-dim)] sm:grid">
            <span>Event type</span>
            <span>Aggregate</span>
            <span>Aggregate ID</span>
            <span>Timestamp</span>
            <span>Editor</span>
            <span>Seq</span>
          </div>
          <div className="divide-y divide-white/8">
            {results.map((e, i) => (
              <EventRow key={`${e.sequence ?? i}-${i}`} event={e} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-ink-dim)]">
                {results.length} event{results.length !== 1 ? 's' : ''} — requires <code>IAM_OWNER</code> or <code>IAM_OWNER_VIEWER</code> role
              </span>
              <Field label="Page size">
                <Select
                  value={String(limit)}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-20"
                >
                  {LIMITS.map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
              </Field>
            </div>
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadMoreM.mutate()}
                loading={loadMoreM.isPending}
              >
                Load more
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
