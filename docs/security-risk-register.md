# Security risk register

## React Router unstable-RSC advisory

- **Advisory:** [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2)
- **Recorded:** 2026-07-24
- **Installed version:** `react-router-dom@7.18.1`
- **Upstream patched version:** `8.3.0` (not published to npm when this
  assessment was recorded)
- **Applicability:** Not applicable to the deployed ResumePreps architecture.
  The advisory affects only React Router's unstable RSC APIs. ResumePreps is a
  Vite client-side application using declarative `BrowserRouter`, `Routes`, and
  `Route`; it does not import or enable React Server Components, Framework Mode,
  server actions, or unstable RSC handlers.
- **Why this version is retained:** `7.18.1` contains the upstream fix for the
  client navigation/open-redirect and SSR hydration advisories affecting the
  previous 6.x dependency. Downgrading to avoid an RSC-only advisory would
  restore a vulnerability in code paths this application actually uses.
- **Controls:** CI type-checks and builds the declarative client; the repository
  is scanned for RSC/React-server imports; no Vercel server or RSC route is part
  of this project.
- **Exit condition:** Upgrade to the first stable React Router release at or
  above `8.3.0`, rerun the full browser suite, and remove this exception.
- **Review deadline:** Before any production promotion and no later than
  2026-08-07.
