import { api, ApiError } from './client';
import { EP } from './endpoints';
import type { ListDetails, Organization } from './types';

interface OrgSearchResponse {
  details?: ListDetails;
  pagination?: { totalResult?: string };
  organizations?: Array<Record<string, unknown>>;
  result?: Array<Record<string, unknown>>;
}

function normalizeOrg(raw: Record<string, unknown>): Organization {
  return {
    id: String(raw.id ?? raw.organizationId ?? ''),
    name: String(raw.name ?? ''),
    state: raw.state as string | undefined,
    primaryDomain: raw.primaryDomain as string | undefined,
    details: raw.details as Organization['details'],
  };
}

export interface ListOrgsParams {
  query?: string;
  limit?: number;
  offset?: number;
}

export async function listOrganizations(params: ListOrgsParams = {}): Promise<{
  total: number;
  organizations: Organization[];
}> {
  const queries: unknown[] = [];
  if (params.query?.trim()) {
    queries.push({ nameQuery: { name: params.query.trim(), method: 'TEXT_QUERY_METHOD_CONTAINS_IGNORE_CASE' } });
  }
  const body = {
    query: { offset: String(params.offset ?? 0), limit: params.limit ?? 100, asc: true },
    queries,
  };
  const res = await api.post<OrgSearchResponse>(EP.orgSearch(), body);
  const rows = res.organizations ?? res.result ?? [];
  return {
    total: Number(res.pagination?.totalResult ?? res.details?.totalResult ?? rows.length),
    organizations: rows.map(normalizeOrg),
  };
}

export interface CreateOrgInput {
  name: string;
  /** Optionally seed the org with an admin (existing user id or a new human). */
  adminUserId?: string;
}

export interface CreateOrgResult {
  organizationId: string;
}

export async function createOrganization(input: CreateOrgInput): Promise<CreateOrgResult> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.adminUserId) {
    body.admins = [{ userId: input.adminUserId }];
  }
  const res = await api.post<Record<string, unknown>>(EP.orgCreate(), body);
  return { organizationId: String(res.organizationId ?? res.id ?? '') };
}

export async function updateOrganization(orgId: string, name: string): Promise<void> {
  // org rename is a POST to /v2beta/organizations/{id} with { name }
  await api.post(EP.orgUpdate(orgId), { name });
}

export async function deleteOrganization(orgId: string): Promise<void> {
  // org id is in the path; no x-zitadel-orgid header (this token type rejects it)
  await api.delete(EP.orgDelete(orgId));
}

// ---- Label policy (branding) -----------------------------------------------

export interface LabelPolicy {
  isDefault?: boolean;
  primaryColor?: string;
  backgroundColor?: string;
  warnColor?: string;
  fontColor?: string;
  primaryColorDark?: string;
  backgroundColorDark?: string;
  warnColorDark?: string;
  fontColorDark?: string;
  hideLoginNameSuffix?: boolean;
  disableWatermark?: boolean;
  logoUrl?: string;
  logoDarkUrl?: string;
  iconUrl?: string;
  iconDarkUrl?: string;
}

export async function getLabelPolicy(orgId: string): Promise<LabelPolicy> {
  const res = await api.get<Record<string, unknown>>(EP.orgLabelPolicy(), { orgId });
  const p = (res.policy ?? res) as Record<string, unknown>;
  return {
    isDefault: (p.isDefault ?? res.isDefault) as boolean | undefined,
    primaryColor: p.primaryColor as string | undefined,
    backgroundColor: p.backgroundColor as string | undefined,
    warnColor: p.warnColor as string | undefined,
    fontColor: p.fontColor as string | undefined,
    primaryColorDark: p.primaryColorDark as string | undefined,
    backgroundColorDark: p.backgroundColorDark as string | undefined,
    warnColorDark: p.warnColorDark as string | undefined,
    fontColorDark: p.fontColorDark as string | undefined,
    hideLoginNameSuffix: p.hideLoginNameSuffix as boolean | undefined,
    disableWatermark: p.disableWatermark as boolean | undefined,
    logoUrl: p.logoUrl as string | undefined,
    logoDarkUrl: (p.logoUrlDark ?? p.logoDarkUrl) as string | undefined,
    iconUrl: p.iconUrl as string | undefined,
    iconDarkUrl: (p.iconUrlDark ?? p.iconDarkUrl) as string | undefined,
  };
}

// Ensures a custom label policy exists for the org before uploading assets or saving colours.
// Uses POST (AddCustom) when on instance default, PUT (UpdateCustom) when already custom.
export async function saveLabelPolicy(
  orgId: string,
  isDefault: boolean,
  policy: Omit<LabelPolicy, 'isDefault' | 'logoUrl' | 'logoDarkUrl' | 'iconUrl' | 'iconDarkUrl'>,
): Promise<void> {
  if (isDefault) {
    try {
      await api.post(EP.orgLabelPolicy(), policy, { orgId });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await api.put(EP.orgLabelPolicy(), policy, { orgId });
        return;
      }
      throw e;
    }
  } else {
    await api.put(EP.orgLabelPolicy(), policy, { orgId });
  }
}

export async function activateLabelPolicy(orgId: string): Promise<void> {
  await api.post(EP.orgLabelPolicyActivate(), {}, { orgId });
}

async function createCustomLabelPolicy(orgId: string): Promise<void> {
  try {
    await api.post(EP.orgLabelPolicy(), {}, { orgId });
  } catch (e) {
    // "already exists" conflict is fine — policy was already custom, carry on.
    if (!(e instanceof ApiError && e.status === 409)) throw e;
  }
}

// The assets API returns 404 if no custom policy has been created for the org.
// Try the upload first so existing custom policies don't trigger a noisy 409.
async function uploadLabelAsset(orgId: string, path: string, file: File): Promise<void> {
  try {
    await api.upload(path, file, { orgId });
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
    await createCustomLabelPolicy(orgId);
    await api.upload(path, file, { orgId });
  }
}

export async function uploadOrgLogo(orgId: string, file: File, dark = false): Promise<void> {
  await uploadLabelAsset(orgId, dark ? EP.orgLabelPolicyLogoDarkUpload() : EP.orgLabelPolicyLogoUpload(), file);
}

export async function deleteOrgLogo(orgId: string, dark = false): Promise<void> {
  await api.delete(dark ? EP.orgLabelPolicyLogoDarkDelete() : EP.orgLabelPolicyLogoDelete(), { orgId });
}

export async function uploadOrgIcon(orgId: string, file: File, dark = false): Promise<void> {
  await uploadLabelAsset(orgId, dark ? EP.orgLabelPolicyIconDarkUpload() : EP.orgLabelPolicyIconUpload(), file);
}

export async function deleteOrgIcon(orgId: string, dark = false): Promise<void> {
  await api.delete(dark ? EP.orgLabelPolicyIconDarkDelete() : EP.orgLabelPolicyIconDelete(), { orgId });
}
