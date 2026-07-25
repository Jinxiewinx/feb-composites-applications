#!/usr/bin/env python3
"""Static server that sends Cache-Control: no-store.

`python3 -m http.server` sends no cache headers at all, so the browser happily
serves a stale core.js or slicer.js after an edit and you spend twenty minutes
debugging code that isn't running. That already cost this project once (see
SESSION-STATE.md), and firebase.json sets no-cache on html/js/json/css in
production for the same reason — this matches prod locally.

    python3 tools/nocache_server.py [port]        # default 8126

Then open  http://localhost:8126/03%20Work%20Orders/app/
Serves from the repo root, so the standards and datasheets resolve too.
"""
import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter; errors still surface
        if not str(args[1] if len(args) > 1 else "").startswith("2"):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8126
    handler = partial(NoCacheHandler, directory=str(ROOT))
    print(f"serving {ROOT} on http://localhost:{port}/  (no-store)")
    print(f"app: http://localhost:{port}/03%20Work%20Orders/app/")
    HTTPServer(("127.0.0.1", port), handler).serve_forever()


if __name__ == "__main__":
    main()
