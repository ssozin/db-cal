# AGENTS.md

## Cursor Cloud specific instructions

This repo is a Next.js 16 app ("2026 Daily Tear-off Calendar", a.k.a. `db-cal`)
that also carries the generic `vinext` (Cloudflare Sites) starter scaffolding.
The standard commands live in `README.md` (Diagnostic Commands) and
`package.json` scripts — read those first. Notes below are only the non-obvious
gotchas.

### Two run/build paths
- `npm run dev` → vinext/Vite dev server on `http://localhost:5173` (this is the
  README-documented dev command; serves the app with a `codex-preview` meta tag).
- `npm run build:pages` → `next build` static export to `out/` (basePath
  `/db-cal`). This is the path the GitHub Pages workflow actually deploys; use it
  as the production build for this app. Plain `next dev` also works if you want a
  Next-native dev server.

### Non-obvious setup gotchas (fixed in-repo, but re-apply if reverted)
- `vite.config.ts` statically imports `./.openai/hosting.json`. That file is
  optional per the README but MUST exist or `npm run dev`, `npm run build`, and
  `npm test` all fail with `Could not resolve './.openai/hosting.json'`. A minimal
  `{}` is sufficient (declares no D1/R2 bindings, which matches this app).
- The `scripts/*.sh` helpers must be executable (`chmod +x scripts/*.sh`).
  `npm run build`/`npm test` invoke `scripts/sites-env.sh` via `exec`, so a
  missing execute bit fails with "Permission denied".
- Both of the above are committed. If a future run is missing them (e.g. this
  change was not merged), recreate `.openai/hosting.json` with `{}` and re-run
  `chmod +x scripts/*.sh`.

### Testing / lint
- `npm run lint` works but reports 2 pre-existing `react-hooks` errors + a few
  warnings in `app/page.tsx`. These are existing code issues, not env problems.
- `npm test` runs `npm run build` (vinext) then a Node test that imports the
  built `dist/server/index.js` and asserts the rendered HTML — it needs the two
  setup gotchas above satisfied.

### Runtime data
- The calendar fetches event photos at runtime from the public GitHub API
  (`repos/ssozin/db-cal/contents/df_img`). Network is required for photos to
  appear; without it the photo count shows "—" but tearing pages still works.
