FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /service
COPY pyproject.toml README.md ./
# Resolve the CPU wheel explicitly. The default Linux index may otherwise pull
# CUDA and NVIDIA runtime packages that this local CPU-only service never uses.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu "torch==2.8.0" \
    && pip install --no-cache-dir "fastapi>=0.115,<1" "numpy>=2,<3" "pydantic>=2.10,<3" "safetensors>=0.5,<1" "uvicorn>=0.34,<1"
COPY freewill_brain ./freewill_brain
RUN pip install --no-cache-dir --no-deps .

RUN useradd --create-home --uid 10001 brain && mkdir -p /data/brains && chown -R brain:brain /data
USER brain

ENV FREEWILL_BRAIN_DATA=/data/brains \
    FREEWILL_BRAIN_HOST=0.0.0.0 \
    FREEWILL_BRAIN_PORT=8008

EXPOSE 8008
CMD ["python", "-m", "freewill_brain.api"]

