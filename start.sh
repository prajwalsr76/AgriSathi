#!/bin/sh
cd "$(dirname "$0")"
echo "AgriSathi is running at http://localhost:8080"
(sleep 1; (xdg-open http://localhost:8080 || open http://localhost:8080) >/dev/null 2>&1) &
python3 -m http.server 8080
