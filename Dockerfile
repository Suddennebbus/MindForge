# ---------- Stage 1: frontend build ----------
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: all-in-one runtime (nginx + uvicorn + SQLite) ----------
FROM python:3.12-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx curl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

WORKDIR /app
# Optionally point pip at a regional mirror: --build-arg PIP_INDEX_URL=...
ARG PIP_INDEX_URL=""
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir ${PIP_INDEX_URL:+-i "$PIP_INDEX_URL"} -r requirements.txt

COPY backend/ ./
COPY --from=frontend /build/dist ./static
COPY deploy/nginx.conf /etc/nginx/conf.d/mindforge.conf
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Fresh installs: secrets are auto-generated into /data/.secrets on first
# start; schema is created and stamped via alembic; admin/admin is seeded
# with must_change_password=true.
ENV DATA_DIR=/data \
    DATABASE_URL=sqlite:////data/mindforge.db
VOLUME ["/data"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
