# FinTax MVP testing

## Automated checks

The following checks were run in the Windows development workspace:

| Check | Command | Result |
|---|---|---|
| Backend tests | `npm run test:backend` | 94 passed |
| Frontend unit tests | `npm run test:frontend` | 10 passed |
| TypeScript and production frontend build | `npm --prefix frontend run build` | passed |

Backend tests cover login/session replacement, password hashing, temporary-password enforcement, account creation, staff assignment scoping, upload access, origin checks, rate limiting, migrations, API validation, and the retained development-only NEXUS APIs. Frontend tests cover the existing stream parser and execution-state reducer; they do not constitute end-to-end tests of the new FinTax screens.

The frontend dependency install reported 15 npm advisories (7 moderate, 6 high, 2 critical). These advisories have not been investigated or remediated in this work.

## Not verified

- Browser-based end-to-end testing of sign-in, account administration, uploads, downloads, and mobile navigation.
- Live PostgreSQL migration and runtime behavior.
- Docker image or Compose startup.
- OCR, document classification/extraction, Agenda exports, email delivery, staff one-time codes, production Germany hosting, or real client data handling.

Passing automated tests and a frontend build do not make this MVP safe for live tax, payroll, financial, or identity documents. See [deployment status](./DEPLOYMENT.md) before considering any live use.
