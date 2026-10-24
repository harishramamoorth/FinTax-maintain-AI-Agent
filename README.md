# FinTax Portal (MVP foundation)

This repository is being adapted into the FinTax client and staff platform. The current code provides a working local foundation for account access, client records, staff-to-client assignments, and private document intake. It is **not a production-ready tax document processing service**.

## Interactive client demo (no database)

The frontend is currently a standalone website demo. Run it and open <http://localhost:5173> to choose Admin, Staff, or Client, review the selected demo user, then click **Continue as Demo User** to open that dashboard. No password or account details are required. Logout returns to role selection and clears the selected demo session. Files stay in browser memory, are not uploaded to the API/database/storage, and are cleared when the page is refreshed. Use fictional sample data only.

To run only the no-database demo on Windows, use `npm --prefix frontend run dev` from the repository root. The root page opens the demo directly; no backend is needed. The normal `npm run dev` command also starts the API and local SQLite development database.

The client demo accepts multiple PDF, photo, scan and screenshot files up to 50 MB each, including PDFs up to 200 pages. Selectable PDF text is extracted locally and used for basic heuristic field matching; scans and images are not OCR'd. Language detection, confidence estimates, and checks are illustrative heuristics, not AI analysis or accounting validation. The staff review queue, client requests/replies, approvals, and client document summaries share in-memory demo state in the current browser session. Password-protected PDFs require an unlocked copy. No document, extracted text, or client data is saved to localStorage or uploaded to a server. Do not upload real client records or identity documents.

The client dashboard also includes a deterministic, context-based assistant demo with fictional records for three client previews, including invoices, bank statements, payroll, tax letters, missing documents, and tasks. It calculates totals from the selected client's available demo records, cites its source documents, and can send a question to the staff correspondence queue; staff replies appear in that client's chat. English, German, and basic Arabic response templates are provided. This is not a connected or trained AI model, and the client selector only switches among fictional preview data. Demo conversations and files exist in browser memory only and are not server communications.

## Currently implemented

- Administrator, staff, and client account records; public registration is not provided.
- Passwords are stored as salted PBKDF2 hashes. Sign-in uses an HTTP-only, same-site cookie with an eight-hour expiry and one active session per account.
- Administrators can create staff or client accounts; staff can create client accounts. The creator sets and confirms a temporary password, which the account owner must replace at first sign-in. Administrators can deactivate accounts, reset passwords, and assign clients to staff.
- Staff client lists and document access are restricted to assigned clients. Clients can see their own portal summary and documents.
- PDF, JPEG, PNG, and WebP uploads are stored unchanged on the configured server filesystem. Uploads have a 50 MB limit; unencrypted PDFs are limited to 200 pages. Exact duplicate file hashes are flagged. Password-protected PDFs are stored with a `password_required` status.
- Uploads, downloads, account changes, and sign-ins create audit records.
- An English sign-in screen has a German/English language toggle. Most authenticated screens are currently English only.
- SQLite is used for local development; Alembic migrations and the SQLAlchemy models are PostgreSQL-compatible.
- Legacy NEXUS task/workflow APIs remain available only outside production. They are not part of the FinTax portal and are not mounted when `APP_ENV=production`.
- Sign-in detects the account role and opens the matching workspace automatically; users cannot switch roles from the login screen. Email one-time codes for staff are not implemented yet.
- In local development only (`APP_ENV=development` with SQLite), the app creates demo accounts: `demo-admin` / `admin@2026`, `demo-staff` / `staff@2026`, and client number `FT-DEMO-2024` / `client@2024`. Click **Fill demo login** on a role card to fill the form. These fixed demo credentials are never seeded in production; do not expose the development server or upload real client data.

## Not implemented yet

This MVP foundation does **not** include staff email one-time codes, email password-reset delivery, OCR, AI document classification or extraction, production human-review workflows, bookkeeping checks, bank statement reconciliation, Agenda SKR03 export, production payroll workflows, correspondence actions/deadlines, recurring tasks, push notifications, Google Drive, mobile apps, retention automation, backup/restore controls, or dual-administrator deletion approval. The browser-only review and notification flow is illustrative and is cleared when the page is refreshed. Only common PDF/photo/scan formats accepted by the frontend demo can be previewed; HEIC and other formats may require a compatible viewer.

The upload API stores and serves files but does not encrypt them at rest, scan for malware, or process them with OCR. **Do not upload real client records or identity documents to this local development app.** Production use requires a German-hosted environment, encrypted storage and backups, email/MFA setup, privacy and retention review, security testing, and operational monitoring.

## Run locally on Windows

Requirements: Node.js 18.18+ and Python 3.11+.

```powershell
cd C:\path\to\nexus-ai
npm run dev
```

Open <http://localhost:5173>. The development database is SQLite and migrations run automatically. On a new database, create the first administrator from a second terminal:

```powershell
npm run admin:create -- --username admin --email admin@example.com
```

Enter and confirm an administrator password of at least 12 characters when prompted. The command applies database migrations before creating the account. Sign in with that username. In **Clients**, admins can create staff or client accounts and staff can create client accounts. Set a temporary password of at least 12 characters; it is shown once after account creation and must be changed at first sign-in.

The local original-file store defaults to `data/documents`. Use a private local folder by setting `DOCUMENT_STORAGE_DIR` in `.env`. Never add real credentials to source control or send them in chat.

## Database and hosting

SQLite is intended for local development only. For deployment, use PostgreSQL hosted in Germany and set `DATABASE_URL` privately in the server environment, for example:

```ini
DATABASE_URL=postgresql://user:password@host:5432/fintax
APP_ENV=production
```

Do not put database URLs or passwords in a committed file. The app's document filesystem must be on protected, persistent storage in the same German-hosted environment; a database connection alone does not relocate uploaded files. The separate client/staff domains are not implemented or validated yet; setting CORS alone is not enough to support them. Current local defaults are for development.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Prepare local dependencies and start API + frontend |
| `npm run admin:create -- --username admin --email admin@example.com` | Apply migrations and create the initial administrator |
| `npm test` | Run backend and frontend tests |
| `npm run typecheck` | Type-check the frontend |
| `npm run build` | Build the frontend |
| `npm run migrate` | Apply database migrations |

The API documentation is available at <http://127.0.0.1:8000/api/docs> while the backend is running.
