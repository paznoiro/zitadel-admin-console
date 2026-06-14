import { api, ApiError } from './client';
import { EP } from './endpoints';

// Proto Duration strings like "604800s"; we convert to/from whole days or hours.
export function parseDurationDays(s?: string): number {
  if (!s) return 0;
  const m = s.match(/^(\d+(?:\.\d+)?)s$/);
  return m ? Math.round(Number(m[1]) / 86400) : 0;
}
export function formatDurationDays(days: number): string {
  return `${Math.round(days * 86400)}s`;
}
export function parseDurationHours(s?: string): number {
  if (!s) return 0;
  const m = s.match(/^(\d+(?:\.\d+)?)s$/);
  return m ? Math.round(Number(m[1]) / 3600) : 0;
}
export function formatDurationHours(hours: number): string {
  return `${Math.round(hours * 3600)}s`;
}

// The management v1 GET response wraps the policy under a "policy" key.
// isDefault lives inside the policy object itself.
function extractPolicy(res: Record<string, unknown>): Record<string, unknown> {
  return (res.policy ?? res) as Record<string, unknown>;
}

// ---- Login Policy -----------------------------------------------------------

export interface LoginPolicy {
  isDefault?: boolean;
  allowUsernamePassword?: boolean;
  allowRegister?: boolean;
  allowExternalIdp?: boolean;
  forceMfa?: boolean;
  forceMfaLocalOnly?: boolean;
  hidePasswordReset?: boolean;
  ignoreUnknownUsernames?: boolean;
  allowDomainDiscovery?: boolean;
  disableLoginWithEmail?: boolean;
  disableLoginWithPhone?: boolean;
  defaultRedirectUri?: string;
  passwordCheckLifetime?: string;
  externalLoginCheckLifetime?: string;
  mfaInitSkipLifetime?: string;
  secondFactorCheckLifetime?: string;
  multiFactorCheckLifetime?: string;
}

export async function getLoginPolicy(orgId: string): Promise<LoginPolicy> {
  const res = await api.get<Record<string, unknown>>(EP.orgLoginPolicy(), { orgId });
  const p = extractPolicy(res);
  return {
    isDefault: (p.isDefault ?? (res as Record<string, unknown>).isDefault) as boolean | undefined,
    allowUsernamePassword: p.allowUsernamePassword as boolean | undefined,
    allowRegister: p.allowRegister as boolean | undefined,
    allowExternalIdp: p.allowExternalIdp as boolean | undefined,
    forceMfa: p.forceMfa as boolean | undefined,
    forceMfaLocalOnly: p.forceMfaLocalOnly as boolean | undefined,
    hidePasswordReset: p.hidePasswordReset as boolean | undefined,
    ignoreUnknownUsernames: p.ignoreUnknownUsernames as boolean | undefined,
    allowDomainDiscovery: p.allowDomainDiscovery as boolean | undefined,
    disableLoginWithEmail: p.disableLoginWithEmail as boolean | undefined,
    disableLoginWithPhone: p.disableLoginWithPhone as boolean | undefined,
    defaultRedirectUri: p.defaultRedirectUri as string | undefined,
    passwordCheckLifetime: p.passwordCheckLifetime as string | undefined,
    externalLoginCheckLifetime: p.externalLoginCheckLifetime as string | undefined,
    mfaInitSkipLifetime: p.mfaInitSkipLifetime as string | undefined,
    secondFactorCheckLifetime: p.secondFactorCheckLifetime as string | undefined,
    multiFactorCheckLifetime: p.multiFactorCheckLifetime as string | undefined,
  };
}

export async function saveLoginPolicy(orgId: string, policy: LoginPolicy): Promise<void> {
  const { isDefault, ...body } = policy;
  if (isDefault !== false) {
    try {
      await api.post(EP.orgLoginPolicy(), body, { orgId });
      return;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) throw e;
    }
  }
  await api.put(EP.orgLoginPolicy(), body, { orgId });
}

// ---- Password Complexity Policy ---------------------------------------------

export interface PasswordComplexityPolicy {
  isDefault?: boolean;
  minLength?: number;
  hasUppercase?: boolean;
  hasLowercase?: boolean;
  hasNumber?: boolean;
  hasSymbol?: boolean;
}

export async function getPasswordComplexityPolicy(orgId: string): Promise<PasswordComplexityPolicy> {
  const res = await api.get<Record<string, unknown>>(EP.orgPasswordComplexityPolicy(), { orgId });
  const p = extractPolicy(res);
  return {
    isDefault: (p.isDefault ?? (res as Record<string, unknown>).isDefault) as boolean | undefined,
    minLength: p.minLength !== undefined ? Number(p.minLength) : undefined,
    hasUppercase: p.hasUppercase as boolean | undefined,
    hasLowercase: p.hasLowercase as boolean | undefined,
    hasNumber: p.hasNumber as boolean | undefined,
    hasSymbol: p.hasSymbol as boolean | undefined,
  };
}

export async function savePasswordComplexityPolicy(orgId: string, policy: PasswordComplexityPolicy): Promise<void> {
  const { isDefault, ...body } = policy;
  if (isDefault !== false) {
    try {
      await api.post(EP.orgPasswordComplexityPolicy(), body, { orgId });
      return;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) throw e;
    }
  }
  await api.put(EP.orgPasswordComplexityPolicy(), body, { orgId });
}

// ---- Lockout Policy ---------------------------------------------------------

export interface LockoutPolicy {
  isDefault?: boolean;
  maxPasswordAttempts?: number;
  maxOtpAttempts?: number;
}

export async function getLockoutPolicy(orgId: string): Promise<LockoutPolicy> {
  const res = await api.get<Record<string, unknown>>(EP.orgLockoutPolicy(), { orgId });
  const p = extractPolicy(res);
  return {
    isDefault: (p.isDefault ?? (res as Record<string, unknown>).isDefault) as boolean | undefined,
    maxPasswordAttempts: p.maxPasswordAttempts !== undefined ? Number(p.maxPasswordAttempts) : undefined,
    maxOtpAttempts: p.maxOtpAttempts !== undefined ? Number(p.maxOtpAttempts) : undefined,
  };
}

export async function saveLockoutPolicy(orgId: string, policy: LockoutPolicy): Promise<void> {
  const { isDefault, ...body } = policy;
  if (isDefault !== false) {
    try {
      await api.post(EP.orgLockoutPolicy(), body, { orgId });
      return;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) throw e;
    }
  }
  await api.put(EP.orgLockoutPolicy(), body, { orgId });
}

// ---- Password Age / Expiry Policy -------------------------------------------

export interface PasswordAgePolicy {
  isDefault?: boolean;
  maxAgeDays?: number;
  expireWarnDays?: number;
}

export async function getPasswordAgePolicy(orgId: string): Promise<PasswordAgePolicy> {
  const res = await api.get<Record<string, unknown>>(EP.orgPasswordAgePolicy(), { orgId });
  const p = extractPolicy(res);
  return {
    isDefault: (p.isDefault ?? (res as Record<string, unknown>).isDefault) as boolean | undefined,
    maxAgeDays: p.maxAgeDays !== undefined ? Number(p.maxAgeDays) : undefined,
    expireWarnDays: p.expireWarnDays !== undefined ? Number(p.expireWarnDays) : undefined,
  };
}

export async function savePasswordAgePolicy(orgId: string, policy: PasswordAgePolicy): Promise<void> {
  const { isDefault, ...body } = policy;
  if (isDefault !== false) {
    try {
      await api.post(EP.orgPasswordAgePolicy(), body, { orgId });
      return;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) throw e;
    }
  }
  await api.put(EP.orgPasswordAgePolicy(), body, { orgId });
}

// ---- Privacy / Legal & Support Policy ---------------------------------------

export interface PrivacyPolicy {
  isDefault?: boolean;
  tosLink?: string;
  privacyLink?: string;
  helpLink?: string;
  supportEmail?: string;
  docsLink?: string;
  customLink?: string;
  customLinkText?: string;
}

export async function getPrivacyPolicy(orgId: string): Promise<PrivacyPolicy> {
  const res = await api.get<Record<string, unknown>>(EP.orgPrivacyPolicy(), { orgId });
  const p = extractPolicy(res);
  return {
    isDefault: (p.isDefault ?? (res as Record<string, unknown>).isDefault) as boolean | undefined,
    tosLink: p.tosLink as string | undefined,
    privacyLink: p.privacyLink as string | undefined,
    helpLink: p.helpLink as string | undefined,
    supportEmail: p.supportEmail as string | undefined,
    docsLink: p.docsLink as string | undefined,
    customLink: p.customLink as string | undefined,
    customLinkText: p.customLinkText as string | undefined,
  };
}

export async function savePrivacyPolicy(orgId: string, policy: PrivacyPolicy): Promise<void> {
  const { isDefault, ...body } = policy;
  if (isDefault !== false) {
    try {
      await api.post(EP.orgPrivacyPolicy(), body, { orgId });
      return;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) throw e;
    }
  }
  await api.put(EP.orgPrivacyPolicy(), body, { orgId });
}

// ---- Notification Policy ----------------------------------------------------
// Management v1 notification policy only has a single boolean: passwordChange.
// (The link fields like tosLink / privacyLink belong to PrivacyPolicy, not here.)

export interface NotificationPolicy {
  isDefault?: boolean;
  passwordChange?: boolean;
}

export async function getNotificationPolicy(orgId: string): Promise<NotificationPolicy> {
  const res = await api.get<Record<string, unknown>>(EP.orgNotificationPolicy(), { orgId });
  const p = extractPolicy(res);
  return {
    isDefault: (p.isDefault ?? (res as Record<string, unknown>).isDefault) as boolean | undefined,
    passwordChange: p.passwordChange as boolean | undefined,
  };
}

export async function saveNotificationPolicy(orgId: string, policy: NotificationPolicy): Promise<void> {
  const { isDefault, ...body } = policy;
  if (isDefault !== false) {
    try {
      await api.post(EP.orgNotificationPolicy(), body, { orgId });
      return;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) throw e;
    }
  }
  await api.put(EP.orgNotificationPolicy(), body, { orgId });
}

export async function resetNotificationPolicy(orgId: string): Promise<void> {
  await api.delete(EP.orgNotificationPolicy(), { orgId });
}

// ---- Domain Policy (formerly "Security Policy") -----------------------------
// GET via management v1 (x-zitadel-orgid scoped).
// Writes use admin v1 with orgId in the URL path (requires iam.policy.write).

export interface DomainPolicy {
  isDefault?: boolean;
  userLoginMustBeDomain?: boolean;
  validateOrgDomains?: boolean;
}

export async function getDomainPolicy(orgId: string): Promise<DomainPolicy> {
  const res = await api.get<Record<string, unknown>>(EP.orgDomainPolicyGet(), { orgId });
  const p = extractPolicy(res);
  return {
    isDefault: (p.isDefault ?? (res as Record<string, unknown>).isDefault) as boolean | undefined,
    userLoginMustBeDomain: p.userLoginMustBeDomain as boolean | undefined,
    validateOrgDomains: p.validateOrgDomains as boolean | undefined,
  };
}

export async function saveDomainPolicy(orgId: string, policy: DomainPolicy): Promise<void> {
  const { isDefault, ...body } = policy;
  if (isDefault) {
    await api.post(EP.orgDomainPolicyCreate(orgId), body);
  } else {
    await api.put(EP.orgDomainPolicyUpdate(orgId), body);
  }
}

export async function resetDomainPolicy(orgId: string): Promise<void> {
  await api.delete(EP.orgDomainPolicyReset(orgId));
}
