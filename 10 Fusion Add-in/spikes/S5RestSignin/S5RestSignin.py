"""Spike S5: Python urllib HTTPS off the main thread, marshalled back with a
CustomEvent, the way architecture B would sign in and read Firestore.

No credentials are baked in. Without a password the sign-in leg posts a
bogus account and expects the 400 error JSON, which proves the endpoint,
TLS and JSON path; with EMAIL and PASSWORD set it does the real sign-in and
reads /molds with the bearer token. Results go to s5.log beside this file.

The worker sleeps first so a second script can prove the main thread is
free while it runs. Throwaway spike, not product code."""
import adsk.core, traceback, os, json, time, threading, urllib.request, urllib.error, ssl

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "s5.log")
EVENT_ID = "feb-s5-result"
API_KEY = "AIzaSyDQgUkUQhueh-nFJcTF8OxIq_J2XQi6DWU"   # public web config, by design
PROJECT = "feb-composites"
EMAIL = os.environ.get("FEB_S5_EMAIL", "")
PASSWORD = os.environ.get("FEB_S5_PASSWORD", "")
SLEEP_FIRST = 8

_handlers = []
_event = None


def log(*parts):
    with open(LOG, "a") as f:
        f.write(time.strftime("%H:%M:%S ") + " ".join(str(p) for p in parts) + "\n")


def http(method, url, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def worker():
    out = {"thread": threading.current_thread().name, "ssl": ssl.OPENSSL_VERSION}
    try:
        time.sleep(SLEEP_FIRST)
        t = time.time()
        email, pw = (EMAIL, PASSWORD) if EMAIL else ("s5-probe@example.invalid", "x")
        st, j = http("POST", f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
                     {"email": email, "password": pw, "returnSecureToken": True})
        out["signIn"] = {"status": st, "error": (j.get("error") or {}).get("message"), "hasIdToken": "idToken" in j,
                         "real": bool(EMAIL), "ms": int((time.time() - t) * 1000)}
        token = j.get("idToken")
        t = time.time()
        st, j = http("GET", f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/molds?pageSize=3", token=token)
        docs = j.get("documents") or []
        out["molds"] = {"status": st, "error": (j.get("error") or {}).get("status"), "count": len(docs),
                        "ids": [d["name"].rsplit("/", 1)[-1] for d in docs], "ms": int((time.time() - t) * 1000)}
    except Exception:
        out["error"] = traceback.format_exc()
    adsk.core.Application.get().fireCustomEvent(EVENT_ID, json.dumps(out))


class Result(adsk.core.CustomEventHandler):
    def notify(self, args):
        try:
            a = adsk.core.CustomEventArgs.cast(args)
            log("main thread got result:", a.additionalInfo)
        except Exception:
            log("handler error", traceback.format_exc())


def run(context):
    global _event
    try:
        app = adsk.core.Application.get()
        if os.path.exists(LOG):
            os.remove(LOG)
        log("S5 start; Fusion", app.version, "real credentials:", bool(EMAIL))
        app.unregisterCustomEvent(EVENT_ID)
        _event = app.registerCustomEvent(EVENT_ID)
        h = Result(); _event.add(h); _handlers.append(h)
        th = threading.Thread(target=worker, name="feb-s5-worker", daemon=True)
        th.start()
        log("worker started; run() returning")
    except Exception:
        log("run error", traceback.format_exc())


def stop(context):
    try:
        adsk.core.Application.get().unregisterCustomEvent(EVENT_ID)
    except Exception:
        pass
