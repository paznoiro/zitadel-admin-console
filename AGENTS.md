# AGENTS.md — ZITADEL Admin Console

## What this is

A single-page React admin console for ZITADEL. No backend — the browser calls your ZITADEL instance directly using PATs or OAuth2+PKCE. Static build output (`dist/`).

## Commands

```bash
npm install          # install deps
npm run dev          # dev server at localhost:5173
npm run build        # tsc -b && vite build → dist/
npm run typecheck    # tsc -b --noEmit (no lint or test scripts)
```

There is no linter, formatter, or test suite configured.

## Key architecture

- **API endpoints**: All ZITADEL REST paths live in `src/api/endpoints.ts`. This is the single file to edit when a ZITADEL version changes a resource path.
- **API client**: `src/api/client.ts` — fetch wrapper that surfaces ZITADEL's own error messages. `ApiError` carries `status`, `zitadelId`, and `serverMessage`.
- **Auth/session**: `src/api/session.ts` stores credentials in `localStorage`. `src/context/AuthContext.tsx` manages connect/disconnect/active org.
- **No org header by default**: The app does NOT send `x-zitadel-orgid` during normal browsing. Some token types reject it. Only the Duplicate Org wizard targets a different org.
- **Mixed API versions**: Orgs use `v2beta`, users use `v2`, projects/roles/apps use `management v1`. This reflects ZITADEL Cloud's actual API surface, not an oversight.

## Vite config

- Path alias: `@` → `./src`
- Tailwind via `@tailwindcss/vite` plugin (v4)

## Gotchas

- CORS errors ("Could not reach…") are the most common issue — the ZITADEL instance must allow the app's origin.
- PATs are stored in `localStorage` in plain text. Only use this console against trusted instances.
- `npm run build` runs TypeScript before Vite; type errors will fail the build.
- No test runner — verify changes with `npm run typecheck` and manual browser testing.
