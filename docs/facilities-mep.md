# Facilities & MEP — deployment and operation

Extends the medical-equipment system to cover the building it sits in:
mechanical, electrical, plumbing, vertical transport, medical gas, fire and
life safety. Medical equipment management is unchanged and runs alongside it.

---

## 1. What was added

**21 tables**, three migrations (`o0f1a2b3c4d5`, `p1a2b3c4d5e6`,
`q2b3c4d5e6f7`), and **one** alteration to an existing column.

| Area | Tables |
|---|---|
| Taxonomy | `disciplines`, `user_disciplines` |
| Space register | `locations`, `floor_plans` |
| Vendors | `vendors`, `vendor_contacts`, `vendor_credentials`, `vendor_contracts`, `vendor_contract_assets` |
| Dependency graph | `asset_serves_asset`, `asset_serves_location` |
| Space availability | `space_statuses`, `space_status_history` |
| Measurements | `reading_points`, `readings` |
| Permits to work | `work_permits`, `permit_approvals` |
| Compliance | `compliance_programs`, `compliance_tasks` |
| Planned maintenance | `maintenance_schedules` |
| Asset ledger | `asset_ledger_entries` |

Columns added to existing tables — all nullable or defaulted, so existing rows
are untouched:

- `equipment` — `discipline_id`, `location_id`, `parent_equipment_id`,
  `criticality`, `electrical_branch`, `service_vendor_id`
- `service_requests` — `location_id`, `work_order_type`, `discipline_id`,
  `assigned_vendor_id`, `vendor_contract_id`, `is_billable`, `cost_center`,
  `sla_response_hours`, `sla_due_at`, `responded_at`, `sla_breached`,
  `takes_space_out_of_service`
- `locations` — `plan_polygon` (traced room outline)
- `equipment` — `depreciation_method`, `salvage_value`, `useful_life_years`,
  `total_expected_units`

**The one alteration:** `service_requests.equipment_id` becomes nullable.
A nurse reporting a dead socket in an operating theatre knows the room and does
not know the receptacle's asset tag. The invariant the `NOT NULL` provided —
a work order has a subject — moved to `app.services.work_order.validate_subject`,
which requires equipment **or** location and refuses neither.

### Design decisions worth knowing before you extend this

- **`Facility` is the campus.** No table sits above it. `facility_id` is the
  scoping key on every table *and* on the RBAC data scope, so inserting a level
  above would re-plumb all of that for nothing. Health-system → hospital uses
  the existing `Facility.parent_facility_id`.
- **Plant assets live in `equipment`,** not a third asset table. There are
  already two near-identical ones (`equipment` and `inventory_parts`); a third
  would make every report choose which two of three to union.
- **`disciplines` is a table, not an enum.** `ModalityCategory` is a Postgres
  ENUM, so every new asset class would cost a migration. `Modality` keeps
  classifying biomedical equipment; `Discipline` answers a different question —
  which trade owns this, and who gets dispatched.
- **`locations` uses a materialised path** (`/3/41/612/`). Subtree reads are one
  indexed prefix match rather than a recursive CTE on every dashboard. It is
  maintained **only** by `app.services.location_tree` — never assign `path` or
  `depth` by hand.

---

## 2. Deploying

```bash
# 1. Migrate. Adds tables and nullable columns; no data is rewritten except a
#    backfill of discipline_id = 'biomedical' on existing equipment and
#    service requests, so reports do not show all history as unclassified.
cd backend
alembic upgrade head

# 2. Nothing else. Nine disciplines are seeded by the migration (ten once the
#    site categories migration adds HVAC), the frontend
#    routes and nav entries are already wired, and the permission matrix is
#    updated on both sides.
```

**Uploads.** Floor plans go to `backend/uploads/floor_plans/`, compliance
certificates to `backend/uploads/compliance_certificates/`, signed permits to
`backend/uploads/permit_documents/` — the same convention as facility
documents, persisting through the existing `./backend:/app` bind mount. No new
volume is needed.

**The scheduler.** `docker-compose.yml` gains a `facilities_scheduler` service
running `python -m app.jobs.facilities_scheduler`. It generates compliance
tasks, raises due maintenance work orders and expires stale permits every
`FACILITIES_SCHEDULER_INTERVAL_SECONDS` (default 1800). Every operation it
performs is idempotent, so a cycle overlapping with somebody pressing the
equivalent button in the UI cannot double anything, and a container restart
mid-cycle loses nothing.

**Rollback.** `alembic downgrade -1` is clean with one exception it will not hide
from you: work orders created with a location and no equipment cannot satisfy
the restored `NOT NULL`, so the downgrade deletes them. Run it deliberately.

### Verifying before you migrate production

```bash
# Generate the exact Postgres DDL without touching a database.
DATABASE_URL=postgresql://user:pass@host/db \
  python -c "from alembic.config import Config; from alembic import command; \
             command.upgrade(Config('alembic.ini'), 'n9e0f1a2b3c4:o0f1a2b3c4d5', sql=True)"
```

Produces 15 `CREATE TABLE`, 123 `CREATE INDEX`, 29 `ALTER TABLE`, 9 seed
`INSERT`s.

---

## 3. Bootstrapping a customer

The tables ship empty. Nothing back-fills them — the existing
`Equipment.location` free-text string is left alone and remains the fallback
display for an asset not yet placed in the tree.

### The minimum is two rows

A `room` may hang directly off a `building`; no floor is required. One building
plus your critical rooms and the system is live for the work that hurts:

```
Building "MAIN"
  └── OR-3          space_use = operating_room   → criticality seeds to critical
  └── ICU-1         space_use = icu
  └── MECH-4        space_use = mechanical
```

Space use drives everything downstream — criticality, the SLA clock, which
status values are legal, and whether an out-of-band reading takes the room out
of service. Set it.

### Filling in the rest

| Path | When to use it |
|---|---|
| **Floor plan tracing** (Locations → a floor → Floor plan tab) | The default when no room list exists. Upload the life safety drawing, calibrate, click-and-name. |
| **Bulk import** (`POST /locations/bulk-import`) | When the customer has a room register in Excel. Defaults to a dry run; a row-level error aborts the whole import rather than landing half a register. |
| **Provisional locations** | Field staff who cannot find a room create one flagged `is_provisional`. An admin reconciles later. This is what stops a 40%-complete survey from being a dead end. |

Be honest with the customer about scale: a 300-bed hospital is a few thousand
discrete spaces once you count toilets, closets and mechanical rooms. That is
customer-side labour measured in weeks. The system is designed to be useful at
20% coverage — survey by priority, not by completeness.

---

## 4. How the moving parts fit

### The SLA clock

`Tier.response_time_hours` had been stored and displayed since tiers shipped and
never computed against anything. It does now, and the **space leads**:

```
1. the vendor contract's own promised response, when dispatched out
2. the response matrix — space criticality × work order priority
3. the facility tier's flat response_time_hours
4. 24 hours
```

A critical-priority fault in a critical space is 1 hour; the same fault in a
store room is 24. Breach is measured against `responded_at` — first technician
contact — not completion, because grading on completion punishes long repairs
that were answered immediately.

Planned work (`preventive`, `rounds`, `project`, `utility_shutdown`) carries no
response clock. It has a scheduled date; a countdown on it would be noise that
devalues every real one.

### Billing

In-house plant work is not dragged through the quotation → authorisation →
payment flow built for billing medical equipment service. `is_billable`
defaults from the work order type and an explicit choice always wins — a
contractor's chargeable visit on a PM work order is still billable.

### Space status and the capacity number

Every transition closes the open history interval and opens a new one, and
`duration_minutes` is banked at close rather than computed at read. This is the
discipline the whole module rests on: if a transition ever writes the current
row without closing the one behind it, the capacity report silently
under-counts and nobody finds out for a quarter.

What it produces:

> "We lost 34 bed-days and 11 OR-hours to facility failures this quarter,
> broken down by root cause."

Defaults to **facilities-attributable** causes only — maintenance, equipment
failure, utility outage, environmental excursion. Capacity lost to staffing or
infection control is tracked but excluded, because charging plant operations
for a nursing shortage makes the number worthless to the people who answer for
it. There is a toggle.

Automatic write paths:

| Trigger | Effect |
|---|---|
| Work order created with `takes_space_out_of_service` | Opens the downtime interval |
| Work order completed | Closes it; the space returns **dirty**, not clean |
| Out-of-band reading on a `gates_space_availability` point | Takes the space out of service |
| Manual change on the Space Status page | Any legal transition |

### ⚠️ PHI boundary

`space_statuses` records the **state** of a space and must never record the
**identity** of anyone in it. No name, no medical record number, no admission or
discharge date, no diagnosis. `notes` is for facilities notes; a patient detail
appearing there is a defect.

This system holds no protected health information anywhere, which keeps it
outside HIPAA's covered-data scope and keeps the audit, encryption and breach
burden proportionate to a maintenance tool. `occupied` is an operational fact
about a bed; `occupied by Mr Patel since Tuesday` would reclassify the entire
application.

**Bed-days lost does not require occupancy data.** It measures time spent
`out_of_service`, which comes from the work order. If real occupancy is ever
needed, the path is HL7 v2 ADT or FHIR `Encounter` + `Location`, status only,
identity discarded at the boundary — which is what `SpaceStatus.source` exists
for. Design for it; do not build it casually.

### Readings and the unit rule

`unit` is `NOT NULL` on both the point and every reading, and copied onto the
reading at write time. It would be cheaper to name a column `pressure_in_wc` and
imply the unit — and eventually a vendor's report arrives in pascals.

ASHRAE 170 asks an operating room to hold at least **0.01 in. w.c.** positive.
The same requirement in pascals is about **2.5**. A `0.01` typed while a gauge
read pascals is a quarter of one percent of the requirement, and stored without
its unit it looks exactly like compliance. `POST /readings/points/{id}/readings`
accepts a foreign unit, converts it, and reports what it converted from; an
unconvertible pair is refused rather than guessed at.

`in_spec` is evaluated against the band in force at that moment, so a limit
tightened in March cannot turn February's compliant readings into violations.

### Impact analysis

`GET /disciplines/equipment/{id}/impact` answers what goes dark if an asset
stops. Breadth-first with a visited set, because ring mains and cross-ties make
real distribution cyclic and a naive recursive walk hangs on the first one.

Redundant feeds are excluded by default: an asset on a second source does not go
down, and reporting it as impacted trains people to ignore the report.

The walk crosses from plant into clinical assets — switchgear → panel →
receptacle → anaesthesia machine. That hop is the reason both domains live in
one database.

---

## 5. Permissions

Three new modules, mirrored in `backend/app/utils/permissions.py` and
`frontend/src/config/permissions.ts`. **Edit both together.**

| Module | Covers |
|---|---|
| `locations` | Space register, floor plans, disciplines, reading points |
| `spaces` | Availability and the capacity report |
| `vendors` | Contractors, contracts, credentials |

`locations` and `spaces` are separate on purpose: a housekeeping supervisor
should be able to flip a bed to clean without also being able to re-plan the
building. Technicians get `locations: view` / `spaces: write`.

---

## 6. Tests

```bash
cd backend
DATABASE_URL=sqlite:// python tests/test_mep_foundation.py            # 24 checks
DATABASE_URL=sqlite:// python tests/test_mep_operations.py            # 10 checks
DATABASE_URL=sqlite:// python tests/test_permits_compliance_pm.py     # 25 checks
DATABASE_URL=sqlite:// python tests/test_asset_ledger.py              # 17 checks
DATABASE_URL=sqlite:// python tests/test_mep_migration_matches_models.py  # 6 checks
```

The last is the one that earns its keep: `create_all` is never run against the
real database, so nothing else here would catch a model column that never made
it into the migration.

Note that the **full** alembic chain cannot run on SQLite — a pre-existing
migration uses `ALTER` on constraints, which SQLite does not support. Use
Postgres, or the offline SQL generation above.

---

## 7. Permits to work

The part with no equivalent in medical equipment service, and the part most
CMMS retrofits miss. You cannot open a ceiling, isolate a panel, strike an arc
or shut a valve in an occupied hospital on a technician's judgement alone.

**The gate is the point.** `app.services.permit.assert_work_permitted` runs on
the work order's transition into progress and raises if any attached permit is
missing, unsigned, rejected, expired, or outside its validity window. A permit
system that cannot refuse anything is a filing cabinet.

| Permit | Notes |
|---|---|
| ICRA | Class derived from the published activity x risk-group matrix. Patient risk group is inferred from `space_use`, so the assessment starts from the truth rather than from what the requester felt like selecting. |
| ILSM | Triggered by any life-safety impairment flag; interim measures are generated from which feature is impaired. |
| Hot work | Fire watch defaults to 60 minutes after work stops, where codes commonly say 30-60. |
| LOTO | Isolation points as a list - one job routinely isolates several sources. |
| Confined space, penetration, energised electrical | Standard approval routing. |
| Utility shutdown | Populates affected spaces from the **asset dependency graph** rather than asking. The person isolating a panel usually does not know it also feeds two theatres. |

Who must sign depends on the assessment, not just the type: an ICRA Class I is
a courtesy notification; a Class IV needs Infection Prevention, the nurse
manager losing the space, and Facilities. Routing everything to everyone is how
approvals become rubber stamps.

Closing requires confirming `controls_removed` - barriers down, locks off,
impaired systems restored. Closing a Class IV without that is precisely the
paperwork-shaped hole permits exist to close.

`GET /permits/icra-preview` returns the class, precautions and required
signatures **before** the permit is raised, so choosing Type C work in an ICU
shows "Class IV, three signatures, anteroom required" while the requester is
still choosing.

---

## 8. Compliance programs

Regulatory schedules and the certificates that prove they were met. A defib
gets a PM because the manufacturer says so; a generator gets a 30-minute load
test every month because NFPA 110 says so, and that produces a certificate
somebody will eventually ask to see.

`ComplianceTask` is deliberately **not** a `ServiceRequest`: an obligation
exists whether or not anybody has been assigned, must be reportable across
years, and carries evidence a work order has nowhere to put.

```bash
POST /compliance/programs/seed?facility_id=1   # 15 standard programs
POST /compliance/generate                      # idempotent; nightly job
```

Seeded programs cover generator monthly and annual testing, transfer switches,
fire pump churn and annual flow, fire alarm, elevator state inspection and
Firefighters' Service and the five-year test, backflow, medical gas
verification, OR and isolation-room pressure, eyewash, and water management
sampling. Every field is editable - the seeds encode common intervals, and the
**authority having jurisdiction is always the authority**. Confirm the set
against your AHJ and state rules before relying on it.

Two things worth knowing:

- **Generation is idempotent.** One open task per program per subject. A second
  run while the first is still open creates nothing - otherwise the overdue
  list fills with duplicates of work nobody has done, and stops being read.
- **Grace separates late from unrecoverable.** `overdue` is a phone call;
  `past_grace` is a gap in the record that cannot be filled retroactively. The
  summary reports them separately and the UI leads with the second.

A program with `requires_certificate` cannot be closed by ticking "pass" - the
certificate number is required, and the inspector's licence too where the
program demands a licensed provider. A **failure** is exempt, because a failed
inspection does not produce a certificate and demanding one would block
recording the failure.

---

## 9. Planned maintenance

`Equipment.pm_scheduling` (a string) and `next_generated_pm_date` are untouched
and keep working for the biomedical side. `maintenance_schedules` sits
alongside: one asset can carry several, each with its own trade and duration.

**Runtime scheduling** is why this exists separately. A standby generator that
never runs does not need its 200-hour service; one that ran all week through a
storm needs it early. `basis` is `calendar`, `runtime_hours`, or
`calendar_or_runtime` - whichever arrives first, which is the honest reading of
an engine's service interval.

```bash
POST /maintenance/generate    # idempotent; nightly job
GET  /maintenance/forecast    # work count and estimated hours by month
```

`open_work_order_id` is what makes generation idempotent - a schedule with work
already open generates nothing. Completing that work order advances the
schedule automatically, measured **from completion** rather than from the
previous due date: for plant, when the filter was actually changed is the date
that matches reality.

`lead_time_days` raises the work *before* it falls due, so it reaches a planner
with time to schedule rather than already late.

---

## 10. Traced room outlines

`POST /locations/{id}/trace` records a polygon in the same 0..1 fractions as a
pin. With the plan calibrated, area falls out of the trace - and area times
ceiling height is the volume an air-changes-per-hour check needs. Without it,
somebody measures several thousand rooms by hand or the ventilation number
cannot be computed at all.

Area is derived **server-side** from the plan's calibration. A client-computed
figure would quietly disagree the moment anybody re-calibrated the drawing.
Where the plan has no scale the outline is still stored, and the response says
why no area was computed rather than returning a blank that looks like a bug.

The pin moves to the polygon's **area-weighted** centroid, so a room traced with
ten points along one wall and two along another does not put its marker against
the detailed wall.

---

## 11. Scheduled execution

```bash
docker compose up -d facilities_scheduler
```

| Job | What it does |
|---|---|
| Compliance generation | Creates tasks falling due inside the horizon, then flips past-due ones to overdue |
| Maintenance generation | Raises a work order per due schedule |
| Permit expiry | Expires approved permits whose validity window has passed unused |

All three are also exposed as endpoints (`POST /compliance/generate`,
`POST /maintenance/generate`, `POST /permits/expire-stale`) and as buttons in
the UI, because a planner wants to see what a run produced rather than wait
half an hour to find out.

The worker checks that every table it touches exists before its first cycle, so
a container started against an unmigrated database fails loudly once rather
than logging an exception every interval forever. A quiet estate logs nothing —
the run line is only written when something actually happened.

---

## 12. One clock

Every timestamp in this codebase is written with `datetime.utcnow()`. Comparing
a due date derived from one of those against `date.today()` — the *local* date —
disagrees with itself for part of every day on any server not set to UTC.

The symptoms are small and genuinely confusing: a maintenance schedule judged
due a day early, a compliance task flipped overdue a day late, a certificate
reported expired before it is. They appear only during the offset window, so
they look like flakiness rather than a bug.

`app.utils.clock.utc_today()` is the single answer, used by every part of the
facilities module. **Do not reach for `date.today()` here.** This was found by a
test that started failing when the machine's local date rolled past UTC
midnight — which is exactly how the bug would have reached production.

---

## 13. Asset ledger and depreciation

An asset register that cannot say what a thing is worth, or show what has been
done to it since installation, is a list rather than a register.

### The timeline is derived, not stored

The obvious build is one big event table everything writes to. That is wrong
here, because most of an asset's history is *already* recorded: every service
visit is a `ServiceRequest`, every inspection an `Inspection`, every regulatory
test a `ComplianceTask`, every measurement a `Reading`. Copying those means two
records of the same fact, and the copy goes stale the first time somebody edits
the original.

So `GET /asset-ledger/equipment/{id}` assembles the chronology at read time
from the tables that already own it. `asset_ledger_entries` holds only what
nothing else does — **the money and the custody**:

| Entry type | Effect |
|---|---|
| Acquisition, capitalisation | Establishes cost and the in-service date |
| Improvement, revaluation, impairment | Moves the depreciable basis; an improvement can extend the life it improves |
| Transfer | Moves the asset, and updates `equipment.location_id` so register and ledger agree |
| Disposal, write-off | Banks the realised gain or loss, retires the asset, stops depreciation |
| Reversal | Corrects an earlier entry |

**Corrections are posted, never edited.** A financial row somebody can see was
rewritten is a row an auditor cannot rely on, so the original stays and a
reversing entry is posted against it.

Out-of-spec readings appear on the timeline; in-spec ones do not. A daily
isolation-room check produces 365 rows a year that say "fine", and they would
bury everything else.

### Depreciation is computed, never stored

A schedule is a pure function of cost, salvage, life, method and in-service
date, plus any posted basis changes. Persisting the derived rows would mean a
table that silently disagrees with its inputs the moment somebody corrects a
useful life.

Five methods: straight line, 150% and 200% declining balance, sum-of-years
digits, and units-of-production. Declining balance switches to straight line
once that charges more, or it never reaches salvage and the asset never
finishes.

**Units-of-production is why runtime readings exist.** A standby generator six
years old that has run forty hours is not six years' worth of worn out, and a
calendar schedule says it is. The method reuses the same runtime reading point
that drives runtime-based maintenance, so nobody keeps a second number in step.

Two deliberate omissions:

- **Tax depreciation.** MACRS is finance's schedule on finance's terms. A
  maintenance system offering a tax figure would be offering an opinion it is
  not qualified to have.
- **Day pro-rating.** Book depreciation runs on monthly close: an asset in
  service on 15 January has January charged in full, and that charge lands on
  1 February.

A missing input returns a **message**, not a zero — "no acquisition cost
recorded" and "worth nothing" look identical as a figure, and only one of them
should stop a replacement forecast.

Useful life is seeded from the asset's trade on create — a lift is 20 years, a
clinical monitor 7 — so nobody types one four hundred times. Always overridable,
and finance will have opinions about some of them.

### The two numbers worth watching

`GET /asset-ledger/valuation` reports **fully depreciated count**: kit still in
service with no book value left is a replacement nobody has budgeted for.

The per-asset view reports **service cost as a percent of original cost**.
Cumulative repair spend approaching replacement cost is a replacement argument
the depreciation schedule cannot make on its own.

`GET /asset-ledger/equipment/{id}/depreciation` accepts `method` and
`useful_life_years` overrides that model a different basis **without writing
anything** — finance asks "what would fifteen years look like" often enough to
be worth two query parameters.

---

## 14. Remaining gaps

- **Bulk certificate import.** Certificates upload one at a time.
- **Permit templates.** Recurring shutdowns are raised from scratch each time.
- **Notification routing.** Permit approvals create the outstanding list but
  nobody is emailed. The `create_notification` helper the service-request
  module uses is the pattern to copy.
- **`InventoryPart` has no ledger.** It carries the same acquisition and
  warranty columns as `equipment` and is used as a parallel asset table, so
  capital items recorded there are invisible to the valuation. Converging the
  two tables is the real fix; a second ledger would entrench the duplication.
