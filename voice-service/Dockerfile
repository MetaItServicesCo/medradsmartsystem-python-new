FROM python:3.11-slim

# The recogniser is baked so a container restart never waits on HuggingFace,
# and so the first person to speak is not the one who pays for the download.
ARG WHISPER_MODEL=base.en

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WHISPER_MODEL=${WHISPER_MODEL} \
    HF_HOME=/models

WORKDIR /app

# ffmpeg is not needed for the streaming path, which carries raw PCM the whole
# way, but faster-whisper reaches for it when handed anything else and the
# failure would only show up on a request rather than at build time.
RUN apt-get update \
 && apt-get install --no-install-recommends -y ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /models \
 && python -c "import os; from faster_whisper import WhisperModel; WhisperModel(os.environ['WHISPER_MODEL'], device='cpu', compute_type='int8')"

# Silero is small and fetched by pipecat on first use; warming it here keeps
# that off the first conversation too.
RUN python -c "from pipecat.audio.vad.silero import SileroVADAnalyzer; SileroVADAnalyzer(sample_rate=16000)" || true

COPY app ./app

# Not "voice": Debian ships a system group by that name, and useradd refuses
# to create a user whose implicit group already exists. The name is arbitrary;
# the point is only that this does not run as root.
RUN groupadd --gid 10003 voiceapp \
 && useradd --create-home --uid 10003 --gid 10003 voiceapp \
 && chown -R voiceapp:voiceapp /app /models
USER voiceapp

EXPOSE 8300

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8300/health',timeout=4).status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8300"]
