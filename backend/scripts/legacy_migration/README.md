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

## Re-importing a deployment that is already live

The instructions above describe a first import into an empty database. Doing
it again, to a system people are using, is a different job with different
hazards, and this is the sequence for it.

### Why it is a rebuild and not a top-up

Both write phases skip any legacy row already in `legacy_migration.id_map`,
so re-running them inserts only what is new. That sounds like the safer
option and is usually the wrong one: it **skips, it does not update**. A
service closed in the legacy system after the last import keeps its old
status here, an invoice paid keeps its balance, and nothing errors. The
numbers quietly stop agreeing with reality.

Rebuild when the legacy system has stayed the system of record. Top up only
when the legacy data is strictly append-only, which is rarer than it sounds.

### What a rebuild destroys

Everything in this database came from the import except three things:
inspection forms built in the canvas builder, user accounts created directly,
and saved permission matrices. A saved matrix overrides the role table
completely, so losing one raises no error at all — the person simply has
different access, and nothing says why.

`scripts/preserve_native.py` saves all three and puts them back. Run the
export before anything else and keep the file off this machine's repo
directory; it contains password hashes.

### Preconditions

- `legacy_migration.id_map` is present and populated. Without it the importer
  cannot tell what it already did, and a rebuild is the only option left.
- A `pg_dump` of production exists somewhere you would still have it tomorrow.
- The new legacy dump is restored into a disposable MariaDB the backend
  container can reach by hostname.

### Sequence

Steps 1–3 are read-only. Nothing is written until step 4, and nothing is
written to production until step 8.

```bash
# 1. What the rebuild would destroy
docker compose exec -T backend python scripts/preserve_native.py \
    export --output /tmp/native.json
docker compose cp backend:/tmp/native.json ~/native-$(date +%F).json

# 2. Back up production
docker compose exec -T postgres sh -lc \
    'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > ~/medrad-$(date +%F).sql.gz

# 3. Size the job
docker compose exec -T backend sh -lc '
  LEGACY_DATABASE_URL="mysql+pymysql://root:PASSWORD@legacy_src:3306/admin_medrad" \
  TARGET_DATABASE_URL="$DATABASE_URL" \
  python -m scripts.legacy_migration.cli audit --output /tmp/audit.json'
```

Steps 4–7 run against the local staging database, which is what
`migrate-foundation` and `migrate-operational` will accept — they refuse any
target that is not `medrad_migration` on localhost, and that guard is worth
keeping.

```bash
# 4. Build the new database in staging
python -m scripts.legacy_migration.cli migrate-foundation \
    --apply --confirm-target medrad_migration --output ./foundation.json
python -m scripts.legacy_migration.cli migrate-operational \
    --apply --confirm-target medrad_migration --output ./operational.json
python -m scripts.legacy_migration.cli apply-enrichment \
    --apply --confirm-target medrad_migration --output ./enrichment.json

# 5. Reconcile it against the legacy source
python -m scripts.legacy_migration.cli validate-foundation  --output ./vf.json
python -m scripts.legacy_migration.cli validate-operational --output ./vo.json

# 6. Compare it against the database already in production
BASELINE_DATABASE_URL=postgresql://...production... \
CANDIDATE_DATABASE_URL=postgresql://...staging... \
python scripts/compare_imports.py --output ./compare.json
```

Read step 6 before going further. `new` rows are expected — they are the
legacy activity since the last import, and should be close to what the audit
predicted. `missing` and `drifted` are not expected and mean the import did
something differently this time; neither should be waved through.

```bash
# 7. Rehearse the restore, in staging
python scripts/preserve_native.py restore --input ~/native-DATE.json \
    --apply --confirm-target medrad_migration
```

Only now does production change.

```bash
# 8. Cut over: dump staging, restore it over production
# 9. Put back what the rebuild destroyed
docker compose exec -T backend python scripts/preserve_native.py \
    restore --input /tmp/native.json --apply --confirm-target "$POSTGRES_DB"
```

`restore` exits non-zero if any saved matrix had no account to land on. That
is not a warning to skim: those people are on their role's default access
until somebody fixes it.

### After

Sign in as one of the accounts whose matrix was restored and confirm it
behaves as it did before. Count the inspection forms. Then delete the
preservation file — it holds password hashes and has done its job.

### What is still not checked

`validate-operational` reconciles counts, report coverage and invoice totals.
`validate-foundation` reconciles counts, equipment distribution and
referential invariants. Between them almost nothing compares **field
contents** — `compare_imports` is the only check that does, and only for the
columns listed in its `SUBJECTS`. A column nobody named can change without
anything noticing.

One check in `validate-operational` is `"gateway_credentials_excluded": True`,
a literal. It cannot fail and proves nothing.
