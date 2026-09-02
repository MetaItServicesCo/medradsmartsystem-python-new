#!/usr/bin/env bash
# Measure whether local inference is fast enough for this agent on this host.
#
# The question is not whether a model runs — it will — but whether a full answer
# arrives before the person gives up. One assistant question costs roughly three
# model calls: classify, choose a tool, then write the answer. This script times
# a single generation and multiplies, which is optimistic, so treat the result
# as a floor rather than a promise.
#
#   bash agent-service/scripts/benchmark_local_llm.sh [model]

set -euo pipefail

MODEL="${1:-qwen2.5:7b-instruct}"
PROMPT='List the three highest earning facilities and say which leads. Answer in two sentences.'

echo "Model : $MODEL"
echo "Host  : $(nproc) CPUs, $(free -g | awk '/^Mem:/{print $2}')GB RAM"
echo

if ! docker compose ps ollama --format '{{.Name}}' 2>/dev/null | grep -q .; then
  echo "Ollama is not running. Start it with:"
  echo "  docker compose --profile local-llm up -d ollama"
  exit 1
fi

echo "Pulling $MODEL (first run downloads several GB)..."
docker compose exec -T ollama ollama pull "$MODEL"
echo

echo "Timing one generation..."
RESULT="$(docker compose exec -T ollama ollama run --verbose "$MODEL" "$PROMPT" 2>&1 | tail -12)"
echo "$RESULT"
echo

EVAL_RATE="$(printf '%s\n' "$RESULT" | awk '/eval rate:/ && !/prompt/ {print $3; exit}')"
if [ -n "${EVAL_RATE:-}" ]; then
  echo "-------------------------------------------------------------"
  echo "Generation speed: ${EVAL_RATE} tokens/sec"
  awk -v r="$EVAL_RATE" 'BEGIN {
    # ~600 output tokens across the three calls one question makes.
    secs = 600 / r
    printf "Estimated time per assistant question: %.0f seconds\n", secs
    print ""
    if (secs < 15)      print "VERDICT: usable. Switch AGENT_BASE_URL to Ollama."
    else if (secs < 40) print "VERDICT: workable but slow. Try a smaller model, or keep a hosted endpoint for daily use."
    else                print "VERDICT: too slow for interactive use. A hosted endpoint costs about $0.60 a month by comparison."
  }'
  echo "-------------------------------------------------------------"
fi
