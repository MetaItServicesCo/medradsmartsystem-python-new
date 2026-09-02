FROM python:3.11-slim

# Any Piper voice can be baked in by name, e.g. en_US-lessac-high,
# en_GB-alan-medium. Browse them at https://rhasspy.github.io/piper-samples/.
# "high" variants are noticeably more natural than "medium" and cost little on
# CPU, so they are the default here.
ARG PIPER_VOICE=en_US-lessac-high

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIPER_VOICE=${PIPER_VOICE} \
    PIPER_VOICE_DIR=/voices \
    WHISPER_MODEL=base.en \
    HF_HOME=/models

WORKDIR /app

# ffmpeg lets faster-whisper read what browsers actually record (webm/opus),
# not only wav. curl is used once at build time to fetch the voice.
RUN apt-get update \
 && apt-get install --no-install-recommends -y ffmpeg curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the voice into the image so a container restart never depends on a
# third-party host being reachable. The download path is derived from the voice
# name (en_US-lessac-high -> en/en_US/lessac/high) so switching voices is a
# build argument rather than an edit here.
RUN mkdir -p /voices \
 && LOCALE="$(echo "$PIPER_VOICE" | cut -d- -f1)" \
 && NAME="$(echo "$PIPER_VOICE" | cut -d- -f2)" \
 && QUALITY="$(echo "$PIPER_VOICE" | cut -d- -f3)" \
 && FAMILY="$(echo "$LOCALE" | cut -d_ -f1)" \
 && BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/${FAMILY}/${LOCALE}/${NAME}/${QUALITY}" \
 && curl -fsSL -o "/voices/${PIPER_VOICE}.onnx"      "${BASE}/${PIPER_VOICE}.onnx" \
 && curl -fsSL -o "/voices/${PIPER_VOICE}.onnx.json" "${BASE}/${PIPER_VOICE}.onnx.json"

# Bake the recogniser in as well. Fetching weights on first use would make the
# first spoken question slow, and would fail outright if HuggingFace were
# unreachable from the host.
RUN mkdir -p /models \
 && python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8')"

COPY app ./app

RUN useradd --create-home --uid 10002 speech \
 && chown -R speech:speech /app /models /voices
USER speech

EXPOSE 8200

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8200/health',timeout=4).status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8200"]
