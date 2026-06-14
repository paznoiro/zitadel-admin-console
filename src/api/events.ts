import { api } from './client';
import { EP } from './endpoints';

// ---- Types -----------------------------------------------------------------

export interface ZitadelEvent {
  type?: { type?: string; localized?: { localizedMessage?: string } };
  sequence?: string;
  creationDate?: string;
  /** Nested aggregate object (admin v1 response shape). */
  aggregate?: {
    id?: string;
    type?: { type?: string; localized?: { localizedMessage?: string } };
    resourceOwner?: string;
  };
  editor?: { userId?: string; displayName?: string; service?: string };
  payload?: unknown;
}

export interface EventType {
  type: string;
  localizedMessage?: string;
}

// ---- Search events ---------------------------------------------------------

export interface SearchEventsParams {
  /** ISO-8601 lower bound → sent as range.since (events newer than this). */
  from?: string;
  /** ISO-8601 upper bound → sent as range.until (events older than this). */
  to?: string;
  aggregateTypes?: string[];
  aggregateId?: string;
  eventTypes?: string[];
  editorUserId?: string;
  resourceOwner?: string;
  sequence?: string;
  limit?: number;
  asc?: boolean;
}

export async function searchEvents(params: SearchEventsParams = {}): Promise<ZitadelEvent[]> {
  const body: Record<string, unknown> = {
    limit: params.limit ?? 50,
    asc: params.asc ?? false,
  };

  // Proto oneof creation_date_filter — only one of `range` | `from` may be set.
  // range uses `since` (lower bound) and `until` (upper bound), both optional.
  if (params.from || params.to) {
    body.range = {
      ...(params.from ? { since: params.from } : {}),
      ...(params.to ? { until: params.to } : {}),
    };
  }
  if (params.aggregateTypes?.length) body.aggregateTypes = params.aggregateTypes;
  if (params.aggregateId?.trim()) body.aggregateId = params.aggregateId.trim();
  if (params.eventTypes?.length) body.eventTypes = params.eventTypes;
  if (params.editorUserId?.trim()) body.editorUserId = params.editorUserId.trim();
  if (params.resourceOwner?.trim()) body.resourceOwner = params.resourceOwner.trim();
  if (params.sequence?.trim()) body.sequence = params.sequence.trim();

  const res = await api.post<Record<string, unknown>>(EP.eventsSearch(), body);
  return (res.events ?? []) as ZitadelEvent[];
}

// ---- Event types -----------------------------------------------------------

export async function listEventTypes(): Promise<EventType[]> {
  const res = await api.post<Record<string, unknown>>(EP.eventsTypesList(), {});
  const raw = (res.eventTypes ?? []) as Array<{ type?: string; localized?: { localizedMessage?: string } }>;
  return raw.map((e) => ({
    type: e.type ?? '',
    localizedMessage: e.localized?.localizedMessage,
  })).filter((e) => e.type);
}
