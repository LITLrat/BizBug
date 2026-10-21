#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 -m pip install -r requirements.txt
DEMO_MODE=${DEMO_MODE:-true} python3 -m uvicorn app:app --host 127.0.0.1 --port 8000
