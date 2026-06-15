/**
 * Every ZITADEL REST path the console uses lives here, in one place.
 *
 * IMPORTANT — what this targets and why:
 *   - Organizations  → org service **v2beta**  (verified on ZITADEL Cloud)
 *   - Users          → user service **v2** (stable)
 *   - Projects / Roles → **management v1**
 *   - Applications list → **application.v2 Connect RPC** (`ListApplications`)
 *   - Application CRUD (create/get/update/delete) → **management v1**
 *
 * Project and role resources do NOT yet have a v2 API on ZITADEL Cloud.
 * The application list now uses the v2 Connect RPC service; write operations
 * still use management v1 until a full v2 CRUD surface ships.
 *
 * Org scoping: calls run in the *token's own org*. We never attach
 * x-zitadel-orgid for normal browsing — some token types (e.g. session access
 * tokens) reject it outright. The only place a different org is targeted is the
 * "Duplicate organization" wizard, which passes the new org id explicitly.
 */
export const EP = {
  // ---- Organization service (zitadel.org.v2beta) ----
  orgCreate: () => `/v2beta/organizations`,
  orgSearch: () => `/v2beta/organizations/search`,
  orgUpdate: (orgId: string) => `/v2beta/organizations/${orgId}`, // POST (rename)
  orgDelete: (orgId: string) => `/v2beta/organizations/${orgId}`,

  // ---- Project service ----
  // v2 Connect RPC — POST { organizationId, name, ... }
  projectCreate: () => `/zitadel.project.v2.ProjectService/CreateProject`,
  projectSearch: () => `/management/v1/projects/_search`,
  // v2 Connect RPC — org-filtered list (supersedes projectSearch for reads)
  projectList: () => `/zitadel.project.v2.ProjectService/ListProjects`,
  projectGet: (projectId: string) => `/management/v1/projects/${projectId}`,
  projectUpdate: (projectId: string) => `/management/v1/projects/${projectId}`, // PUT
  // v2 Connect RPC — POST { projectId }
  projectDelete: () => `/zitadel.project.v2.ProjectService/DeleteProject`,

  // Project roles (zitadel.project.v2 Connect RPC)
  roleList: () => `/zitadel.project.v2.ProjectService/ListProjectRoles`,
  roleAdd: () => `/zitadel.project.v2.ProjectService/AddProjectRole`,
  roleUpdate: () => `/zitadel.project.v2.ProjectService/UpdateProjectRole`,
  roleRemove: () => `/zitadel.project.v2.ProjectService/RemoveProjectRole`,

  // ---- Applications ----
  // v2 Connect RPC — project-filtered list (supersedes appSearch for reads)
  appList: () => `/zitadel.application.v2.ApplicationService/ListApplications`,
  appSearch: (projectId: string) => `/management/v1/projects/${projectId}/apps/_search`,
  // v2 Connect RPC CRUD — verified live 2026-06-15
  // CreateApplication: needs projectId + name + oidcConfiguration|apiConfiguration
  // GetApplication: only needs applicationId (no projectId)
  // UpdateApplication: needs projectId + applicationId + name (rename only; OIDC config update still v1)
  // DeleteApplication: needs projectId + applicationId
  appV2Create: () => `/zitadel.application.v2.ApplicationService/CreateApplication`,
  appV2Get: () => `/zitadel.application.v2.ApplicationService/GetApplication`,
  appV2UpdateName: () => `/zitadel.application.v2.ApplicationService/UpdateApplication`,
  appV2Delete: () => `/zitadel.application.v2.ApplicationService/DeleteApplication`,
  // management v1 fallbacks (still needed for OIDC/API config updates — no v2 equivalent)
  appCreateOIDC: (projectId: string) => `/management/v1/projects/${projectId}/apps/oidc`,
  appCreateAPI: (projectId: string) => `/management/v1/projects/${projectId}/apps/api`,
  appDelete: (projectId: string, appId: string) =>
    `/management/v1/projects/${projectId}/apps/${appId}`,

  // ---- Org policy settings (management v1) ----
  // GET/POST/PUT/DELETE scoped to an org via x-zitadel-orgid header.
  // Correct paths from management.swagger.json (basePath /management/v1):
  //   POST = AddCustomPolicy (when org is currently on instance default)
  //   PUT  = UpdateCustomPolicy (when org already has a custom override)
  //   DELETE = ResetToDefault
  orgLoginPolicy: () => `/management/v1/policies/login`,
  orgPasswordComplexityPolicy: () => `/management/v1/policies/password/complexity`,
  orgLockoutPolicy: () => `/management/v1/policies/lockout`,
  orgPasswordAgePolicy: () => `/management/v1/policies/password/age`,
  orgPrivacyPolicy: () => `/management/v1/policies/privacy`,
  orgNotificationPolicy: () => `/management/v1/policies/notification`,

  // ---- Domain policy (replaces "security policy") ----
  // GET via management v1 (x-zitadel-orgid scopes to org).
  // Writes go through admin v1 with orgId in path (requires iam.policy.write).
  orgDomainPolicyGet: () => `/management/v1/policies/domain`,
  orgDomainPolicyCreate: (orgId: string) => `/admin/v1/orgs/${orgId}/policies/domain`,
  orgDomainPolicyUpdate: (orgId: string) => `/admin/v1/orgs/${orgId}/policies/domain`,
  orgDomainPolicyReset: (orgId: string) => `/admin/v1/orgs/${orgId}/policies/domain`,

  // ---- Org branding / label policy (management v1) ----
  orgLabelPolicy: () => `/management/v1/policies/label`,
  orgLabelPolicyActivate: () => `/management/v1/policies/label/_activate`,
  // Deletes use management v1 (underscore suffix for dark variants).
  orgLabelPolicyLogoDelete: () => `/management/v1/policies/label/logo`,
  orgLabelPolicyLogoDarkDelete: () => `/management/v1/policies/label/logo_dark`,
  orgLabelPolicyIconDelete: () => `/management/v1/policies/label/icon`,
  orgLabelPolicyIconDarkDelete: () => `/management/v1/policies/label/icon_dark`,
  // Uploads use the assets API (slash-separated, org-scoped via x-zitadel-orgid).
  orgLabelPolicyLogoUpload: () => `/assets/v1/org/policy/label/logo`,
  orgLabelPolicyLogoDarkUpload: () => `/assets/v1/org/policy/label/logo/dark`,
  orgLabelPolicyIconUpload: () => `/assets/v1/org/policy/label/icon`,
  orgLabelPolicyIconDarkUpload: () => `/assets/v1/org/policy/label/icon/dark`,

  // ---- Application config updates (management v1 — no v2 equivalent yet) ----
  appGet: (projectId: string, appId: string) =>
    `/management/v1/projects/${projectId}/apps/${appId}`,
  appUpdate: (projectId: string, appId: string) =>
    `/management/v1/projects/${projectId}/apps/${appId}`, // PUT {name} — superseded by appV2UpdateName
  appUpdateOIDC: (projectId: string, appId: string) =>
    `/management/v1/projects/${projectId}/apps/${appId}/oidc`, // PUT
  appUpdateAPI: (projectId: string, appId: string) =>
    `/management/v1/projects/${projectId}/apps/${appId}/api`, // PUT

  // ---- Identity providers ----
  // List: v2beta settings API — returns all IDPs linked for login in an org.
  //   ctx.orgId query param scopes to a specific org.
  idpList: (orgId?: string) =>
    orgId
      ? `/v2beta/settings/login/idps?ctx.orgId=${encodeURIComponent(orgId)}`
      : `/v2beta/settings/login/idps`,
  // Create / update / delete remain on management v1 (no v2 CRUD yet on Cloud).
  idpSearch: () => `/management/v1/idps/_search`,
  idpGet: (id: string) => `/management/v1/idps/${id}`,
  idpDelete: (id: string) => `/management/v1/idps/${id}`,
  idpActivate: (id: string) => `/management/v1/idps/${id}/activate`,
  idpDeactivate: (id: string) => `/management/v1/idps/${id}/deactivate`,
  idpCreateOIDC: () => `/management/v1/idps/oidc`,
  idpCreateOAuth: () => `/management/v1/idps/oauth`,
  idpCreateJWT: () => `/management/v1/idps/jwt`,
  idpUpdateOIDC: (id: string) => `/management/v1/idps/${id}/oidc`,
  idpUpdateOAuth: (id: string) => `/management/v1/idps/${id}/oauth`,
  idpUpdateJWT: (id: string) => `/management/v1/idps/${id}/jwt`,

  // ---- Audit log / events (admin v1 — instance-level) ----
  eventsSearch: () => `/admin/v1/events/_search`,
  eventsTypesList: () => `/admin/v1/events/types/_search`,

  // ---- User service (zitadel.user.v2 — stable) ----
  userAddHuman: () => `/v2/users/human`,
  userUpdateHuman: (userId: string) => `/v2/users/human/${userId}`, // PUT
  userAddMachine: () => `/v2/users/machine`,
  userUpdateMachine: (userId: string) => `/v2/users/machine/${userId}`, // PUT
  userSearch: () => `/v2/users`,
  userGet: (userId: string) => `/v2/users/${userId}`,
  userSetPassword: (userId: string) => `/v2/users/${userId}/password`,
  userDelete: (userId: string) => `/v2/users/${userId}`,
  userDeactivate: (userId: string) => `/v2/users/${userId}/deactivate`,
  userReactivate: (userId: string) => `/v2/users/${userId}/reactivate`,

  // ---- Authorization service (zitadel.authorization.v2 Connect RPC) ----
  authorizationList: () => `/zitadel.authorization.v2.AuthorizationService/ListAuthorizations`,
  authorizationCreate: () => `/zitadel.authorization.v2.AuthorizationService/CreateAuthorization`,

  // ---- User grants — update/delete still on management v1 ----
  userGrantUpdate: (userId: string, grantId: string) =>
    `/management/v1/users/${userId}/grants/${grantId}`,
  userGrantDelete: (userId: string, grantId: string) =>
    `/management/v1/users/${userId}/grants/${grantId}`,
} as const;
