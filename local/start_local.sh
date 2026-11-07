#!/bin/bash
# Runs a safe local copy of the clinic app and opens it in the browser.
#
# Safe means: it uses a local SQLite database (backend/clinic.db), never the real
# Neon database from .env, and it cannot send WhatsApp messages.
#
# Usage:
#   start_local.sh               start in the background (if needed) and open the browser
#   start_local.sh --foreground  run in the foreground (used by .claude/launch.json)
#   start_local.sh --stop        stop the local copy

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/local/logs"
VENV="$ROOT/.venv"
URL="http://localhost:5173"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# --- Safety: override anything that would touch real systems ---
# Empty DATABASE_URL makes the backend use local SQLite (python-dotenv won't override it)
export DATABASE_URL=""
# Point outgoing integrations at a closed local port so every call fails harmlessly
export WHATSAPP_SERVICE_URL="http://127.0.0.1:9"
export WHATSAPP_TOKEN=""
export PHONE_NUMBER_ID=""

notify() {
    osascript -e "display notification \"$1\" with title \"Clinic (local)\"" >/dev/null 2>&1
}

stop_all() {
    for port in 8000 5173; do
        pids=$(lsof -ti tcp:$port 2>/dev/null)
        [ -n "$pids" ] && kill $pids 2>/dev/null
    done
}

wait_for() {
    for _ in $(seq 1 60); do
        curl -s -o /dev/null "$1" && return 0
        sleep 1
    done
    return 1
}

setup_python() {
    if [ ! -x "$VENV/bin/uvicorn" ]; then
        notify "First run: installing Python packages (about a minute)..."
        python3 -m venv "$VENV" && "$VENV/bin/pip" install -q -r "$ROOT/requirements.txt" "httpx<0.28" \
            || { notify "Python setup failed. See local/logs/setup.log"; exit 1; }
    fi
    if [ ! -d "$ROOT/frontend/node_modules" ]; then
        notify "First run: installing frontend packages..."
        (cd "$ROOT/frontend" && npm install --silent) || { notify "npm install failed"; exit 1; }
    fi
}

start_servers() {
    mkdir -p "$LOGS"
    cd "$ROOT"
    # nohup keeps the servers alive after the launcher app exits
    nohup "$VENV/bin/uvicorn" backend.main:app --port 8000 >"$LOGS/backend.log" 2>&1 &
    (cd "$ROOT/frontend" && nohup npx vite --port 5173 --strictPort >"$LOGS/frontend.log" 2>&1) &
}

case "$1" in
    --stop)
        stop_all
        notify "Local copy stopped."
        exit 0
        ;;
    --foreground)
        setup_python
        stop_all
        start_servers
        trap 'stop_all; exit 0' INT TERM
        wait
        ;;
    *)
        mkdir -p "$LOGS"
        setup_python >>"$LOGS/setup.log" 2>&1
        if ! curl -s -o /dev/null "$URL" || ! curl -s -o /dev/null "http://127.0.0.1:8000/api/rooms"; then
            stop_all
            notify "Starting the local copy..."
            start_servers
            if ! wait_for "http://127.0.0.1:8000/api/rooms" || ! wait_for "$URL"; then
                notify "Could not start. See local/logs."
                exit 1
            fi
        fi
        open "$URL"
        ;;
esac
