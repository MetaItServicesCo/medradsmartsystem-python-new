#!/usr/bin/env bash
# Measure whether local inference is fast enough for this agent on this host.
#
# The question is not whether a model runs — it will — but whether an answer
# arrives before the person gives up. One assistant question costs roughly three
# model calls: classify, choose a tool, then write the answer.
#
# Timings come from Ollama's HTTP API rather than the `ollama run` CLI. The CLI
# reads stdin, so without a terminal it waits for input that never arrives and
# appears to hang forever.
#
#   bash agent-service/scripts/benchmark_local_llm.sh [model]

set -euo pipefail

MODEL="${1:-qwen2.5:7b-instruct}"
PROMPT='List three facilities and say which earns the most. Answer in two sentences.'
# Roughly what one question generates across its three model calls.
TOKENS_PER_QUESTION=600

echo "Model : $MODEL"
echo "Host  : $(nproc) CPUs, $(free -g | awk '/^Mem:/{print $2}')GB RAM"
echo

if ! docker compose ps ollama --format '{{.Name}}' 2>/dev/null | grep -q .; then
  echo "Ollama is not running. Start it with:"
  echo "  docker compose --profile local-llm up -d ollama"
  exit 1
fi

echo "Pulling $MODEL (skipped if already present)..."
docker compose exec -T ollama ollama pull "$MODEL" </dev/null
echo

echo "Generating (the first run also loads several GB into memory)..."
REQUEST="$(printf '{"model":%s,"prompt":%s,"stream":false}' \
  "\"$MODEL\"" "\"$PROMPT\"")"

RESPONSE="$(docker compose exec -T ollama \
  curl -s --max-time 900 http://127.0.0.1:11434/api/generate -d "$REQUEST" </dev/null)"

printf '%s' "$RESPONSE" | python3 -c '
import json, sys

try:
    data = json.load(sys.stdin)
except ValueError:
    print("Could not parse the response; is the model name correct?")
    sys.exit(1)

generated = data.get("eval_count") or 0
gen_secs = (data.get("eval_duration") or 0) / 1e9
prompt_tokens = data.get("prompt_eval_count") or 0
prompt_secs = (data.get("prompt_eval_duration") or 0) / 1e9

if not generated or not gen_secs:
    print("No timing returned:", str(data)[:300])
    sys.exit(1)

rate = generated / gen_secs
print("generation : %d tokens in %.1fs  ->  %.1f tokens/sec" % (generated, gen_secs, rate))
if prompt_tokens and prompt_secs:
    print("prompt     : %d tokens in %.1fs  ->  %.1f tokens/sec"
          % (prompt_tokens, prompt_secs, prompt_tokens / prompt_secs))
print()

# Generation dominates, but each question also re-reads a large prompt of tools
# and evidence, so this remains a floor rather than a promise.
secs = 600 / rate
print("-------------------------------------------------------------")
print("Estimated time per assistant question: %.0f seconds" % secs)
print()
if secs < 15:
    print("VERDICT: usable. Point AGENT_BASE_URL at Ollama.")
elif secs < 40:
    print("VERDICT: workable but slow. Consider a smaller model, or keep a")
    print("         hosted endpoint for daily use.")
else:
    print("VERDICT: too slow for interactive use. A hosted endpoint costs")
    print("         about $0.60 a month by comparison.")
print("-------------------------------------------------------------")
'
