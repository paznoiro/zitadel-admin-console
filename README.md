# ZITADEL Admin Console

A modern, **glassmorphic** single-page admin console for [ZITADEL](https://zitadel.com),
built entirely against the **v2 / v2beta resource APIs** (no v1 management API).

You point it at any ZITADEL instance, paste a Personal Access Token (PAT), and the
browser talks to that instance directly — there is no backend of our own.

![stack](https://img.shields.io/badge/React-18-61dafb) ![stack](https://img.shields.io/badge/Vite-6-646cff) ![stack](https://img.shields.io/badge/Tailwind-4-38bdf8)

---

## Features

| Area | What you can do |
|------|-----------------|
| **Connect** | Sign in with a server URL + PAT. Credentials live in `localStorage`, sent only to your instance. |
| **Dashboard** | Live counts of orgs, projects, users and applications with quick actions. |
| **Organizations** | Create, search, set-active, and delete organizations. |
| **Projects** | Create / delete projects (role-assertion & role-check flags), per-org scoped. |
| **Applications** | Register **OIDC** (Web / SPA / Native) and **API** apps; view fresh client credentials once; aggregated cross-project list. |
| **Roles** | Add / remove project roles (key, display name, group). |
| **Users** | List / search / create human users; activate / deactivate / delete. |
| **Bulk import** | Drag-and-drop a CSV to create many users with per-row live status. |
| **Duplicate organization** | Deep-clone an org → new org + all projects + roles + apps, with a real-time progress log. |

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Build for production:

```bash
npm run build      # outputs static files to dist/
npm run preview    # serve the build locally
```

`dist/` is fully static — host it on any CDN, S3 bucket, Nginx, Vercel, etc.

### Connecting

1. Open the app and enter:
   - **Server URL** — e.g. `https://my-instance.zitadel.cloud`
   - **Personal Access Token** — created for a service user (see below).
2. Press **Go**. The console validates the token by listing organizations.

#### Creating a PAT

In ZITADEL: create a **Service User** → give it the needed roles (e.g.
`IAM_OWNER` or `ORG_OWNER` for full management) → **Personal Access Tokens** →
*New*. Copy the token and paste it into the console.

### Or: Single Sign-On (OAuth2 + PKCE)

No PAT? Switch the login screen to **Single Sign-On**. You provide the **Server
URL** and a **Client ID**, and the console runs the standard OAuth2
**Authorization Code + PKCE** flow: it redirects to your instance's hosted login,
and on return exchanges the code for an access token. **That access token becomes
the Bearer token for every API call** — and is silently refreshed on expiry using
the refresh token (no re-login needed while the session lives).

One-time setup in ZITADEL — register an application to get the Client ID:

1. In a project → **Applications → New** → type **User Agent (SPA)**.
2. Auth method **PKCE** (public client, no secret).
3. Add the **redirect URI** the login screen shows you (it's
   `<this app's origin>/callback`, e.g. `http://localhost:5173/callback`).
4. For `http`/localhost URIs, enable **Development Mode** on the app.
5. Copy the **Client ID** into the SSO form.

Scopes requested: `openid profile email offline_access
urn:zitadel:iam:org:project:id:zitadel:aud` — the last grants the token the
ZITADEL API audience so management calls are accepted. What you can actually *do*
still depends on the signed-in user's roles (see the permissions table below).

---

## ⚠️ CORS — read this first

Because the browser calls your ZITADEL instance **directly**, the instance must
allow requests from the origin where this app is hosted. If the login fails with
a *"Could not reach …"* / network error while the URL is correct, it is almost
always CORS.

Options:

- **ZITADEL Cloud / self-hosted:** configure the instance's allowed origins /
  `ExternalDomain` and HTTP `CORS` settings to include this app's origin.
- **Local development:** run the app from a trusted origin, or place a small
  reverse proxy in front of ZITADEL that adds
  `Access-Control-Allow-Origin`.

PATs are long-lived bearer tokens — only run this console somewhere you trust.

---

## API surface & versioning

Every REST path is centralized in **`src/api/endpoints.ts`** — the single file to
adjust if your ZITADEL version moves a resource.

These paths were **verified live against ZITADEL Cloud**. The important reality:
current ZITADEL Cloud exposes **no v2 API for projects, applications or roles** —
`/v2beta/projects/*`, `/v2/projects/*` and `/resources/v3alpha/*` all return 404.
So the console uses **v2 where it exists and management v1 where it's the only
option**:

| Resource | Service used | Example path |
|----------|--------------|--------------|
| Organizations | `org.v2beta` | `POST /v2beta/organizations`, `…/search` |
| Users | `user.v2` (stable) | `POST /v2/users/human`, `POST /v2/users` |
| Projects | **management v1** | `POST /management/v1/projects`, `…/_search` |
| Project roles | **management v1** | `POST /management/v1/projects/{id}/roles` |
| Applications | **management v1** | `POST /management/v1/projects/{id}/apps/oidc` |

> The API client (`src/api/client.ts`) surfaces the instance's *own* error
> message and status on every failure, so a path/version mismatch is obvious and
> easy to correct in `endpoints.ts`.

### Org scoping & the `x-zitadel-orgid` header

All calls run in **the token's own organization**. The console deliberately does
**not** send `x-zitadel-orgid` for normal browsing — some token types (session
access tokens, the kind copied from the console) reject that header with
`Token.Invalid (AUTH-7fs1e)` even when it points at their own org. The only place
a different org id is sent is the **Duplicate organization** wizard (to target
the new org); that path needs a token that supports org switching.

### Token permissions matter

What you can do depends on the roles granted to your token's user:

| Action | Required role |
|--------|---------------|
| List / manage projects, apps, roles, users in the token's org | `ORG_OWNER` (or scoped org roles) |
| **Create / delete organizations**, **Duplicate organization** | `IAM_OWNER` (instance-level) |

A token without instance membership gets `membership not found (AUTHZ-cdgFk)` when
creating an org — that's a permissions limit, not a bug. Use a **service-user PAT
with `IAM_OWNER`** for full functionality including org duplication.

---

## What the "Duplicate organization" feature does

Given a source org it:

1. Creates a new organization.
2. Recreates every **project** (with its role-check flags).
3. Recreates each project's **roles**.
4. Recreates each project's **OIDC and API applications** (new client
   credentials are issued — secrets can't be read back from the source).

Not copied: users, user grants, and **SAML** apps (their metadata is
certificate-bound). The wizard streams a per-resource checklist and continues
past individual failures, reporting them inline.

---

## Project structure

```
src/
  api/            # Thin, centralized ZITADEL v2 client
    client.ts     #   fetch wrapper, auth, rich errors
    endpoints.ts  #   *** all REST paths live here ***
    session.ts    #   credential store (localStorage)
    orgs.ts projects.ts apps.ts users.ts duplicate.ts
  components/      # Glass UI kit: Modal, Toast, Confirm, Layout, ui.tsx
  context/         # AuthContext (connect / active org)
  pages/           # Login, Dashboard, Organizations, Projects,
                   # ProjectDetail, Applications, Users, BulkUsers, DuplicateOrg
```

## Bulk import CSV format

Required columns: `firstName`, `lastName`, `email`.
Optional: `username`, `password`, `phone`, `language`.
Header names are matched flexibly (e.g. `givenName`, `surname`, `mail` all work).
Download a ready-made template from the **Bulk Import** page.

---

## Tech

React 18 · TypeScript · Vite 6 · Tailwind CSS v4 · TanStack Query · React Router ·
lucide-react. No backend, no telemetry.
