FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIPER_VOICE=en_US-ryan-medium \
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
# third-party host being reachable.
RUN mkdir -p /voices \
 && BASE=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium \
 && curl -fsSL -o /voices/en_US-ryan-medium.onnx      "$BASE/en_US-ryan-medium.onnx" \
 && curl -fsSL -o /voices/en_US-ryan-medium.onnx.json "$BASE/en_US-ryan-medium.onnx.json"

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
