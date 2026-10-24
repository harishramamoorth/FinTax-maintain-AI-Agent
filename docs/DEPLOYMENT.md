# FinTax deployment status

## Important: not ready for live client data

The current repository is an MVP foundation, not the commissioned production system. Do not publish it to the App Store/Google Play or use it with real financial records, payroll data, passports, or identity documents yet.

The current implementation does not provide staff email one-time codes, email password-reset delivery, OCR/classification/extraction, review/approval workflows, Agenda exports, payroll, correspondence/task automation, retention enforcement, dual-administrator deletion approval, encrypted file storage, malware scanning, backup/restore automation, or production monitoring. Mobile clients and the separate `app.tl-fc.com` / `office.tl-fc.com` portals have not been built or deployed. The local file store is not encrypted at rest.

## Local development

Use the Windows setup steps in the repository [README](../README.md). Migrations run automatically when the API starts. For a fresh local database, create an administrator with:

```powershell
npm run admin:create -- --username admin --email admin@example.com
```

The password is entered interactively and must be at least 12 characters. The app uses SQLite and stores uploaded files under `data/documents` by default. Do not use real client documents locally.

## Intended production baseline (not yet deployed or certified)

- Host the application, PostgreSQL database, uploaded files, backups, and OCR runtime in an approved German data centre.
- Use a TLS-terminating reverse proxy; set `APP_ENV=production` so authentication cookies are marked `Secure`.
- Set `DATABASE_URL` and `DOCUMENT_STORAGE_DIR` as private deployment variables/volumes. Keep uploaded files on persistent encrypted storage; a database backup does not include those files.
- Configure portal origins and secure cross-origin session handling before splitting the client and staff portals across hostnames. Separate-domain cookie/CORS deployment has not been verified.
- Configure and test email delivery and the required staff one-time codes before allowing staff to access production.
- Define encryption, malware scanning, retention, legal holds, two-person deletion approval, backup schedules, restore drills, incident response, and audit-log protection with FinTax.
- Run the PostgreSQL migrations against a disposable staging database and verify migration, backup, restore, access isolation, and file recovery before production.

No production PostgreSQL connection string is required to work on the local MVP. When the German deployment is provisioned, put its connection string directly into the server's secret settings (or an untracked local `.env` for staging); do not paste credentials into chat or commit them.
