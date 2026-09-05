#!/usr/bin/env python3
"""Find the port Fusion's built-in MCP server is listening on and check it.
Prints 'PORT <n>' on success. Read-only: /health GET and an MCP initialize."""
import json, subprocess, sys, urllib.request, urllib.error
pids = subprocess.run(["pgrep", "-f", "Autodesk Fusion.app/Contents/MacOS/Autodesk Fusion"], capture_output=True, text=True).stdout.split()
if not pids:
    sys.exit("Fusion is not running")
ports = set()
for pid in pids:
    out = subprocess.run(["lsof", "-nP", "-a", "-p", pid, "-iTCP", "-sTCP:LISTEN"], capture_output=True, text=True).stdout
    for line in out.splitlines()[1:]:
        ports.add(int(line.split()[-2].rsplit(":", 1)[1]))
def get(url, data=None, hdr=None):
    r = urllib.request.Request(url, data=data, headers=hdr or {}, method="POST" if data else "GET")
    with urllib.request.urlopen(r, timeout=2) as resp:
        return resp.status, resp.read(3000).decode("utf-8", "replace")
for p in sorted(ports):
    try:
        s, b = get(f"http://127.0.0.1:{p}/health")
    except Exception:
        continue
    if s != 200:
        continue
    init = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "probe", "version": "0"}}}).encode()
    try:
        s2, b2 = get(f"http://127.0.0.1:{p}/mcp", init, {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"})
        print(f"health={b.strip()[:120]}\ninitialize={s2} {b2[:600]}")
    except Exception as e:
        print("initialize failed:", e)
    print("PORT", p)
    sys.exit(0)
sys.exit(f"no MCP server among Fusion's listening ports: {sorted(ports)}")
