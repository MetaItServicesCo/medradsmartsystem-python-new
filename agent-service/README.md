# MedRad Super Admin Assistant

A read-only agent that answers operational questions from live data and from a
knowledge base generated out of the codebase.

## Architecture

```
Browser (Super Admin only)
  │  POST /api/v1/assistant/ask        (SSE)
  ▼
MedRad backend
  ├─ authenticates, confirms Super Admin, rate limits, audits the question
  └─ relays to the agent over the private Docker network
        │
        ▼
   Agent service  (no database credentials, no published port)
   ├─ LangGraph: classify → tools / knowledge / both → synthesize
   └─ Claude (Haiku 4.5) for routing, tool selection and wording
        │  X-Internal-Key + the user's own bearer token
        ▼
MedRad backend  /internal/v1/tools/*  ·  /internal/v1/knowledge/search
   └─ PostgreSQL     ← only the backend ever touches the database
```

The agent has no identity of its own. It forwards the end user's bearer token,
so every tool runs under that user through the existing `get_current_user`,
`has_module_permission` and facility-scoping helpers. Authorization is never
reimplemented across the service boundary.

## Guarantees

- **Read-only.** No tool writes. The agent cannot create, edit, approve or delete.
- **No invented numbers.** Counts and sums are computed by PostgreSQL. Tools
  return `total_count` from a SQL `COUNT` independent of the rows returned, so
  the model reports totals it was given rather than rows it can see.
- **No invented statuses.** Enum values are inlined into the tool JSON Schema;
  an invalid value is rejected with the valid set so the model self-corrects.
- **No invented policy.** Every procedural claim must come from a retrieved
  passage. With no supporting passage the assistant says so.
- **Prompt-injection resistant.** Tool output is wrapped in `<tool_result_data>`
  and the system prompt states that user-authored text inside records is data,
  never instructions.
- **Auditable.** The question and every tool call are written to `audit_logs`.
- **Secrets unreachable.** Columns matching credential patterns are excluded
  from the knowledge base and from every tool response.
- **Private messaging excluded.** Chat and workspace tables are out of scope.

## Deploying

1. **Generate a strong internal key** (32+ characters; production enforces this):

   ```bash
   openssl rand -hex 32
   ```

2. **Add to the project `.env`:**

   ```ini
   ASSISTANT_ENABLED=true
   ASSISTANT_INTERNAL_KEY=<the generated key>
   ANTHROPIC_API_KEY=<your key>
   AGENT_MODEL=claude-haiku-4-5
   ```

3. **Create the knowledge-base tables:**

   ```bash
   docker compose exec backend alembic upgrade head
   ```

4. **Populate the knowledge base** (safe to re-run; unchanged documents write
   nothing):

   ```bash
   docker compose exec backend python -m scripts.generate_kb --write
   ```

5. **Start the agent:**

   ```bash
   docker compose build agent && docker compose up -d agent
   docker compose exec agent python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8100/health').read())"
   ```

6. **Ensure the edge proxy does not expose `/internal`.** It is authenticated,
   but it should never be reachable from the internet. For nginx:

   ```nginx
   location /internal/ { deny all; }
   ```

Re-run step 4 on every deploy that changes models, schemas or routes — that is
what keeps the knowledge base and the code from disagreeing.

## Choosing a model

The agent needs three things from a model: choose one of 13 tools with valid
typed arguments, follow a structured schema, and write prose from supplied
evidence. Tool calling is the demanding one — chat quality is not the
constraint, and models below roughly 7B are unreliable at it whoever hosts them.

| Option | Cost | Notes |
|---|---|---|
| Groq | free tier | Fast, generous limits for one user |
| DeepSeek via OpenRouter | free tier | Rate limited, can be busy at peak |
| DeepSeek direct | ~4x cheaper than Haiku | Paid, but steadier than a free tier |
| Claude Haiku | ~$0.01 a question | Best tool selection |
| Local Ollama | none | 30-90s an answer on CPU, and no third party |

Every hosted option sends question text and tool results to a third party. Only
the local option avoids that.

## Retrieval

Two legs fused with Reciprocal Rank Fusion:

- **Lexical** — PostgreSQL full-text search over a GIN-indexed weighted
  tsvector. Finds exact identifiers (`INV-SERVICE-004560`) reliably. ~8ms.
- **Semantic** — optional pgvector cosine search, skipped automatically when the
  extension is absent.

Lexical alone has a known ceiling: it cannot match a question against wording
that does not appear in the corpus (asking "who can *approve* billing" when the
permission matrix only lists `add`/`edit`/`delete`). Installing pgvector
(`pgvector/pgvector:pg15`) and enabling the semantic leg is the fix.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `MEDRAD_INTERNAL_URL` | `http://backend:8000/internal/v1` | Tool API |
| `MEDRAD_INTERNAL_KEY` | — | Shared key, must match the backend |
| `AGENT_PROVIDER` | `anthropic` | `anthropic`, or `openai` for any compatible endpoint |
| `AGENT_BASE_URL` | — | Endpoint when provider is `openai` |
| `AGENT_API_KEY` | — | Falls back to `ANTHROPIC_API_KEY`; blank is fine for a local endpoint |
| `ANTHROPIC_API_KEY` | — | Required when provider is `anthropic` |
| `AGENT_MODEL` | `claude-haiku-4-5` | Swap without code changes |
| `MAX_TOOL_ITERATIONS` | `5` | Tool-loop rounds per question |
| `MAX_TOOL_CALLS` | `8` | Total tool calls per question |
