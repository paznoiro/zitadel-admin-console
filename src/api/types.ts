/**
 * Lightweight typings for the slices of the ZITADEL v2/v2beta payloads this
 * console touches. They are intentionally permissive — ZITADEL returns more
 * fields than we model, and shapes shift slightly between minor versions.
 */

export interface ObjectDetails {
  sequence?: string;
  changeDate?: string;
  creationDate?: string;
  resourceOwner?: string;
}

export interface Organization {
  id: string;
  name: string;
  state?: string;
  primaryDomain?: string;
  details?: ObjectDetails;
}

export interface Project {
  id: string;
  name: string;
  state?: string;
  projectRoleAssertion?: boolean;
  projectRoleCheck?: boolean;
  hasProjectCheck?: boolean;
  privateLabelingSetting?: string;
  organizationId?: string;
  details?: ObjectDetails;
}

export interface ProjectRole {
  key: string;
  displayName?: string;
  group?: string;
  details?: ObjectDetails;
}

export type AppType = 'OIDC' | 'API' | 'SAML';

export interface Application {
  id: string;
  name: string;
  state?: string;
  type: AppType;
  /** Subset of config we surface; raw config kept under `raw`. */
  clientId?: string;
  redirectUris?: string[];
  raw?: unknown;
}

export interface UserProfile {
  givenName?: string;
  familyName?: string;
  nickName?: string;
  displayName?: string;
  preferredLanguage?: string;
  gender?: string;
}

export interface UserEmail {
  email?: string;
  isVerified?: boolean;
}

export interface User {
  userId: string;
  username?: string;
  state?: string;
  type?: 'TYPE_HUMAN' | 'TYPE_MACHINE' | string;
  loginNames?: string[];
  preferredLoginName?: string;
  human?: {
    profile?: UserProfile;
    email?: UserEmail;
    phone?: { phone?: string; isVerified?: boolean };
  };
  machine?: {
    name?: string;
    description?: string;
  };
  details?: ObjectDetails;
}

/** Standard list pagination block used across v2 search endpoints. */
export interface ListQuery {
  offset?: string | number;
  limit?: number;
  asc?: boolean;
}

export interface ListDetails {
  totalResult?: string;
  processedSequence?: string;
  timestamp?: string;
}
