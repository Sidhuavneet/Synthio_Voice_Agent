# syntax=docker/dockerfile:1

# LiveKit agent worker image (synthio-agent), built by LiveKit Cloud on `lk agent create` /
# `lk agent deploy` from this directory. Based on livekit-examples/agent-starter-python.
# The REST API is not part of this image; it runs on Render (see ../render.yaml).
#
# LiveKit Cloud injects LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET and the agent
# secrets as environment variables at runtime: never copy .env files or set those here.

# Matches backend/.python-version. glibc (Debian) base: Alpine/musl is not supported.
ARG PYTHON_VERSION=3.13
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS base

# Unbuffered output so a crash still reaches `lk agent logs`.
ENV PYTHONUNBUFFERED=1
# Compile bytecode at install time to cut cold-start import time.
ENV UV_COMPILE_BYTECODE=1
# Use the image's interpreter; never download another one.
ENV UV_PYTHON_DOWNLOADS=never
# Model caches live under /app so they are copied into the final stage with the app.
ENV HF_HOME=/app/.cache/huggingface
ENV TORCH_HOME=/app/.cache/torch

# --- Build stage ---
FROM base AS build

# Compilers for any dependency without a prebuilt wheel; not shipped in the final image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    python3-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first (from uv.lock, without the dev group) so code-only changes reuse this
# layer. --no-install-project: the package itself needs src/, which is copied below.
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --locked --no-dev --no-install-project

# Bake plugin model files into the image so nothing downloads at session start. This is the
# non-deprecated form of `synthio-agent download-files` (it runs every installed
# livekit-plugins-* download step without importing the agent code, so it stays cached across
# code changes). The local turn-detector-v1-mini model ships inside the livekit-local-inference
# wheel installed above, so it is already in the image.
RUN uv run --no-sync --module livekit.agents download-files

# Application code (filtered by .dockerignore), then install the project itself.
COPY . .
RUN uv sync --locked --no-dev

# --- Production stage ---
FROM base

# Run as an unprivileged user (LiveKit Cloud requirement).
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

COPY --from=build --chown=appuser:appuser /app /app

WORKDIR /app
USER appuser

# Connect to LiveKit Cloud and wait for explicit dispatches to agent_name "synthio-presenter"
# (AGENT_NAME, default in core/config.py). No wrapper script or backgrounding.
CMD ["uv", "run", "--no-sync", "synthio-agent", "start"]
