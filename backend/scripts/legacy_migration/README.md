# Legacy database migration

This package migrates the legacy MariaDB application into Medrad PostgreSQL.
It is intentionally separate from application startup and never runs automatically.

## Safety policy

- Run `audit` before enabling any write phase.
- Use a disposable PostgreSQL staging database for development.
- Never commit source dumps, generated reports, or database credentials.
- Legacy HR and attendance records are excluded by project decision.
- Only legacy user ID `10` (`OmarAhmad`) may become a superadmin. Existing account
  `omarahmadmetait` remains a superadmin; other legacy superadmins map to admin.

## Audit

Set the connection URLs in the current shell:

```powershell
$env:LEGACY_DATABASE_URL="mysql+pymysql://root:<password>@127.0.0.1:3307/admin_medrad"
$env:TARGET_DATABASE_URL="postgresql://medrad_migrator:<password>@127.0.0.1:55432/medrad_migration"
```

Generate an anonymized report outside the repository:

```powershell
python -m scripts.legacy_migration.cli audit --output C:\tmp\medrad-migration\audit.json
```

Preview the foundational transformations without writing any records:

```powershell
python -m scripts.legacy_migration.cli plan-foundation --output C:\tmp\medrad-migration\foundation-plan.json
```

Apply the approved foundation plan to local staging only:

```powershell
python -m scripts.legacy_migration.cli migrate-foundation `
  --apply `
  --confirm-target medrad_migration `
  --output C:\tmp\medrad-migration\foundation-result.json
```

Apply operational and financial data after the foundation phase:

```powershell
python -m scripts.legacy_migration.cli migrate-operational `
  --apply `
  --confirm-target medrad_migration `
  --output C:\tmp\medrad-migration\operational-result.json
```

This phase migrates services and their report history, inspection batches and asset
reports, sales/rentals, invoices, payments, and account-ledger events. HR records and
legacy payment-gateway credentials are deliberately excluded. Rows that cannot be
linked safely are retained in `legacy_migration.quarantine` for review.

Reconcile source counts, report coverage, invoice totals, balances, and exclusions:

```powershell
python -m scripts.legacy_migration.cli validate-operational `
  --output ..\.migration-output\operational-validation.json
```
