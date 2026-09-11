# Deploying phealth to a server

A clean install on a fresh Linux host, running the whole stack under Docker
Compose behind nginx. The database is created empty and built entirely by
Alembic, which is the path that produces a schema you can trust.

Everything below assumes a non-root user with `sudo` and membership of the
`docker` group.

---

## 1. Prerequisites

Docker Engine with the Compose plugin, and git:

```bash
sudo apt update
sudo apt install -y git ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker            # or log out and back in
docker compose version   # expect v2.x
```

Roughly 4 GB of RAM and 20 GB of disk is enough for the core services. The
`speech`, `voice` and `agent` containers add more; §6 covers leaving them out.

---

## 2. Create the folder and clone

```bash
sudo mkdir -p /opt/phealth
sudo chown "$USER:$USER" /opt/phealth
git clone https://github.com/omarahmad2326/phealth.git /opt/phealth
cd /opt/phealth
```

Anywhere writable works; `/opt/phealth` is used throughout.

---

## 3. Write the environment file

Compose refuses to start without `POSTGRES_PASSWORD` and `SECRET_KEY` — they
are declared `${VAR:?...}`, with no default, deliberately. Everything else has
a working default.

```bash
cp .env.example .env
```

Generate real secrets rather than inventing them:

```bash
python3 - <<'PY'
import secrets
print("POSTGRES_PASSWORD=" + secrets.token_urlsafe(32))
print("SECRET_KEY="       + secrets.token_urlsafe(48))
print("TURN_PASSWORD="    + secrets.token_urlsafe(24))
PY
```

Then edit `.env` and set at least these:

```ini
# ── Database ──────────────────────────────────────────────────────────────
POSTGRES_USER=phealth
POSTGRES_PASSWORD=<the generated value>
POSTGRES_DB=phealth_db

# Used only by commands you run outside Compose. Inside Compose the backend
# builds its own URL from the three values above and reaches the database at
# the hostname `postgres`, not localhost.
DATABASE_URL=postgresql://phealth:<the generated value>@localhost:5432/phealth_db

# ── Security ──────────────────────────────────────────────────────────────
APP_ENV=production
ENABLE_API_DOCS=false
SECRET_KEY=<the generated value>

# Leave this false. See §5 — it is the single most important line in the file.
RUN_STARTUP_MIGRATIONS=false

# ── Public addresses ──────────────────────────────────────────────────────
# VITE_API_URL is baked into the frontend bundle at *build* time, so it must be
# correct before you build, and changing it later means rebuilding.
VITE_API_URL=https://your-domain.example/api/v1
BACKEND_CORS_ORIGINS=["https://your-domain.example"]
TRUSTED_HOSTS=["your-domain.example","localhost","127.0.0.1"]

TURN_PASSWORD=<the generated value>
```

Lock it down — it holds the database password and the JWT signing key:

```bash
chmod 600 .env
```

`.env` is in `.gitignore` and must stay untracked.

### Namespace the Compose project

Optional, but it keeps volumes and networks from colliding with anything else
on the host:

```bash
echo "COMPOSE_PROJECT_NAME=phealth" >> .env
```

The `container_name:` values in `docker-compose.yml` are still `medrad_*`. They
are cosmetic. To rename them:

```bash
sed -i 's/container_name: medrad_/container_name: phealth_/' docker-compose.yml
```

---

## 4. Start the database and cache

Bring these up first and let them become healthy before anything tries to
connect:

```bash
docker compose up -d postgres redis
docker compose ps            # wait for both to read "healthy"
```

Postgres creates `phealth_db` on first start, owned by `phealth`, from the
values in `.env`. It only does this when the data volume is empty — if you
later change `POSTGRES_DB`, an existing volume will not be renamed.

---

## 5. Run the migrations

**Nothing runs Alembic for you.** No container, no entrypoint. This is a
deliberate manual step, and on a fresh database it is also the only correct
one.

```bash
docker compose run --rm backend alembic upgrade head
```

Expect a long run — the chain is 56 migrations from empty to head, finishing at
`q2b3c4d5e6f7`. Confirm:

```bash
docker compose run --rm backend alembic current
```

### Why `RUN_STARTUP_MIGRATIONS` must stay false

The application also carries `app/auto_migrate.py`, a `Base.metadata.
create_all()` followed by a long list of best-effort `ALTER TABLE ADD COLUMN`
statements wrapped in `try/except: pass`. It runs at startup when
`RUN_STARTUP_MIGRATIONS=true`.

If it runs, it builds tables behind Alembic's back. `alembic_version` then
records a revision that does not describe the schema, and the next
`alembic upgrade head` dies on the first table `create_all` already made. The
development database this feature was built against had drifted exactly that
way — 79 tables against a version marker 46 revisions old, unrecoverable
without stamping past migrations that had never actually been verified.

On a new server you get to avoid that entirely. Leave the flag false and let
Alembic own the schema.

---

## 6. Build and start the application

```bash
docker compose build
docker compose up -d
```

That starts: `postgres`, `redis`, `coturn`, `backend`, `frontend`,
`rental_scheduler`, `facilities_scheduler`, `payment_proof_ocr_worker`,
`agent`, `speech`, `voice`. (`ollama` sits behind the `local-llm` profile and
stays down unless you ask for it.)

To leave out the heavier optional services:

```bash
docker compose up -d postgres redis backend frontend \
                     rental_scheduler facilities_scheduler
```

`facilities_scheduler` is what generates compliance tasks, raises preventive
maintenance work orders and expires stale permits, every 30 minutes. Without
it every page and endpoint still works, but nothing falls due on its own.

It checks that its tables exist before the first cycle and exits loudly if they
do not, so a clean start is itself confirmation that §5 succeeded.

---

## 7. Create the first administrator

```bash
docker compose exec backend python create_admin.py
```

This creates `admin` / `password`. **Change it at first login.** The script is a
bootstrap, not a provisioning tool — the credentials are hardcoded and the
account is a superadmin.

---

## 8. Put nginx in front

Every published port binds to `127.0.0.1` only — the backend on 8000, the
frontend on 3000 — so nothing is reachable from outside until you terminate TLS
in front of it. `deploy/nginx/medrad-load-balanced.conf.example` is a worked
starting point.

```bash
sudo apt install -y nginx
sudo cp deploy/nginx/medrad-load-balanced.conf.example \
        /etc/nginx/sites-available/phealth
sudo ln -s /etc/nginx/sites-available/phealth /etc/nginx/sites-enabled/
sudo nano /etc/nginx/sites-available/phealth   # set your domain and upstreams
sudo nginx -t && sudo systemctl reload nginx
```

Then TLS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

Open only what you need:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw allow 3478          # TURN, only if you use voice or video calling
sudo ufw enable
```

---

## 9. Verify

```bash
docker compose ps                               # every service healthy
curl -fsS http://127.0.0.1:8000/health          # backend
curl -fsSI http://127.0.0.1:3000/ | head -1     # frontend
curl -fsSI https://your-domain.example/ | head -1

docker compose logs --tail=40 facilities_scheduler
```

The scheduler logs a line on start and then stays quiet unless a run actually
did something — a silent log means a healthy estate with nothing due, not a
stalled worker.

A quick look at the schema:

```bash
docker compose exec postgres psql -U phealth -d phealth_db -c \
  "select count(*) from information_schema.tables where table_schema='public';"
docker compose exec postgres psql -U phealth -d phealth_db -c \
  "select code, name from disciplines order by sort_order;"
```

Nine disciplines are seeded by the facilities migration. Their presence
confirms the migration chain reached the end.

---

## 10. Running it day to day

**Deploying a change:**

```bash
cd /opt/phealth
git pull
docker compose build
docker compose run --rm backend alembic upgrade head
docker compose up -d
```

Run the migration before `up -d`, not after, so the new code never starts
against an old schema. If a release changes `VITE_API_URL`, the frontend must
be rebuilt — it is compiled in, not read at runtime.

**Backups.** Take one before every deploy that carries a migration:

```bash
docker compose exec -T postgres pg_dump -U phealth -Fc phealth_db \
  > "backup-$(date +%F-%H%M).dump"
```

Restoring:

```bash
docker compose exec -T postgres pg_restore -U phealth -d phealth_db --clean \
  < backup-2026-09-11-1430.dump
```

**Logs:**

```bash
docker compose logs -f backend
docker compose logs -f facilities_scheduler
```

**Uploads** live in the `uploads/` bind mount, outside the database. Back them
up alongside it.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `POSTGRES_PASSWORD must be configured` | `.env` missing or not in the directory you ran `docker compose` from. |
| `relation "..." already exists` during migration | `create_all` has run against this database. See §5. Do not stamp past it on a server without first establishing what the schema actually contains. |
| Frontend loads, every API call fails | `VITE_API_URL` was wrong at build time. Fix `.env`, then `docker compose build frontend && docker compose up -d frontend`. |
| Login works, later requests 401 | `SECRET_KEY` changed. Every issued token is invalidated by that; users need to log in again. |
| CORS errors in the browser console | The origin is not in `BACKEND_CORS_ORIGINS`. It must match scheme and host exactly. |
| `facilities_scheduler` exits immediately | Its startup check found missing tables. Migrations have not been run. |
| Compliance tasks never appear | `facilities_scheduler` is not running, or the estate genuinely has nothing due. |
