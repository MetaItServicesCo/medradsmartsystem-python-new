# MedRad scalability runbook

## What the application now supports

- Multiple Uvicorn workers behind one reverse proxy.
- Multiple application nodes sharing PostgreSQL and Redis.
- Redis-backed WebSocket fan-out and presence across workers/nodes.
- Permission-scoped, short-lived caching for safe read-heavy endpoints.
- Version-based cache invalidation after successful mutations; no Redis key scans.
- Cache stampede protection with bounded lock waits and PostgreSQL failover.
- PostgreSQL query observation through `pg_stat_statements` and I/O timing.

Payments, invoice balances, stock availability/reservations, permission checks,
and service/inspection state are not served from the generic read cache.

## Current single-node production

The default Compose deployment runs two API workers. Keep nginx pointed at
`127.0.0.1:8000`. Redis accelerates eligible reads, but an outage falls through
to PostgreSQL. Client/API JSON remains `Cache-Control: no-store`; React Query
provides the existing short in-browser reuse without placing private data in a
shared proxy cache.

After deployment, verify:

```bash
docker compose exec -T backend alembic upgrade head
docker compose up -d --force-recreate postgres redis backend frontend
curl -fsS http://127.0.0.1:8000/ready
docker compose exec -T postgres psql -U medrad -d medrad_db -c \
  "SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','pg_stat_statements');"
```

Use this query to find database bottlenecks by total time:

```sql
SELECT calls,
       round(total_exec_time::numeric, 2) AS total_ms,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       rows,
       left(query, 180) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

## Horizontal rollout

1. Put PostgreSQL on a managed/private database or a dedicated private node.
2. Use one shared Redis service reachable only on the private network.
3. Move every user-uploaded file needed by more than one node to a private
   DigitalOcean Space. Payment proofs already support an S3-compatible backend;
   do not add a second node while other required uploads are local-only.
4. Build two identical stateless application nodes from the same Git commit and
   environment contract. Run migrations once as a release job, not on every node.
5. Put a DigitalOcean Load Balancer in front of the nodes. Health-check `/ready`
   and use the private node port. The nginx upstream example in
   `deploy/nginx/medrad-load-balanced.conf.example` is available when host nginx
   rather than the managed load balancer performs balancing.
6. Add PgBouncer in transaction-pooling mode before raising worker/node counts.
   Size the database pool from the total across every worker and background job,
   not per container in isolation.
7. Load-test the most common list/search endpoints and payment callbacks before
   adding capacity. Scale application nodes on p95 latency/CPU; scale PostgreSQL
   based on connection pressure, I/O, locks, and slow-query evidence.

Do not cache authenticated JSON in a CDN. A CDN is appropriate for versioned
frontend assets and public landing-page media only.
