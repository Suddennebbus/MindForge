#!/bin/bash
# MindForge all-in-one entrypoint: uvicorn (backend) + nginx (static + proxy)
set -e

cd /app
uvicorn app.main:app --host 127.0.0.1 --port 8000 &
UVICORN_PID=$!

nginx -g 'daemon off;' &
NGINX_PID=$!

_term() {
    kill -TERM "$NGINX_PID" "$UVICORN_PID" 2>/dev/null || true
}
trap _term TERM INT

# Exit when either process exits
wait -n "$UVICORN_PID" "$NGINX_PID"
EXIT_CODE=$?
_term
exit $EXIT_CODE
