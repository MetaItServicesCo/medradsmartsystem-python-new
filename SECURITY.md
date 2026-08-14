# MedRad security and production runtime

This repository keeps security controls outside the domain workflows. Rental,
sales, service, inspection, billing, inventory, facility, and user-management
data contracts remain unchanged.

## Controls enforced by the application

- HTTPS is required by production configuration and HSTS is terminated by the
  public Nginx proxy.
- Production hosts and CORS origins must be explicit HTTPS values.
- Browser responses include a restrictive CSP, anti-framing, MIME-sniffing,
  referrer, permissions, and cross-origin resource headers.
- API documentation and the OpenAPI document are disabled in production.
- Access tokens are signed, issuer/audience scoped, short lived, uniquely
  identified, password-version bound, and revoked in Redis on logout.
- Public registration always creates an employee; privileged roles are assigned
  only through protected user-management endpoints.
- Failed sign-in attempts are throttled by both source and account. General API
  limits complement the stricter payment limits.
- Unexpected errors return a generic message and request ID. Validation errors
  retain field feedback but never echo submitted values.
- Request logs include request IDs and latency without query/body secrets.
  Public portal tokens are redacted and Uvicorn's raw access log is disabled.
- Payment provider references are encrypted with the configured Fernet key ring;
  raw card numbers and CVVs are never stored by MedRad.
- Database pooling, readiness checks, service health checks, and explicit
  migrations provide bounded, observable startup behavior.

## CSRF decision

The current API authenticates with an explicit `Authorization: Bearer` header,
not an automatically attached browser cookie. A third-party site cannot cause a
browser to attach that header, so synchronizer CSRF tokens do not protect this
authentication model. CORS, CSP, short token expiry, and logout revocation are
the applicable controls. If authentication is moved to cookies, use `Secure`,
`HttpOnly`, `SameSite` cookies and add CSRF tokens in the same release.

## Required production environment

Do not commit `.env`. At minimum, production must define:

```dotenv
APP_ENV=production
ENABLE_API_DOCS=false
RUN_STARTUP_MIGRATIONS=false
POSTGRES_USER=medrad
POSTGRES_PASSWORD=<unique database password>
POSTGRES_DB=medrad_db
SECRET_KEY=<unique random value of at least 32 characters>
PAYMENT_DATA_ENCRYPTION_KEYS=<current Fernet key,older rotation keys>
BACKEND_CORS_ORIGINS=["https://medcodesolution.com","https://www.medcodesolution.com"]
TRUSTED_HOSTS=["medcodesolution.com","www.medcodesolution.com","api.medcodesolution.com","localhost","127.0.0.1"]
PUBLIC_APP_URL=https://medcodesolution.com
ENABLE_TEST_PAYMENTS=false
```

Keep Square, SMTP, TURN, database, JWT, and encryption secrets in the server's
secret environment or a secret manager. They must never appear in source,
container images, frontend build arguments, logs, or support screenshots.

Run migrations once as an explicit deployment step before replacing the
application containers:

On an existing installation, set `POSTGRES_PASSWORD` to the password already
used by the `medrad` database role before running any Compose command. Merely
changing the environment value does not rotate a password inside an existing
PostgreSQL volume. Rotate it separately with `ALTER ROLE`, then update the
environment atomically.

```shell
docker compose run --rm backend alembic upgrade head
docker compose up -d backend rental_scheduler frontend
```

## Infrastructure responsibilities

Application encryption protects reusable payment references. Full database,
backup, snapshot, and object-storage encryption at rest must also be enabled at
the infrastructure provider. Backups need retention, restore tests, restricted
access, and a separate encrypted location.

The current single-host deployment is hardened but is not a claim of 100,000
concurrent-user capacity. Horizontal scaling additionally requires shared object
storage for uploads, Redis-backed WebSocket fan-out/presence, a load balancer,
managed PostgreSQL/Redis, queue workers, monitoring, and measured load tests.
