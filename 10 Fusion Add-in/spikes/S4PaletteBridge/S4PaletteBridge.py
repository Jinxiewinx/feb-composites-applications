"""Spike S4: the palette bridge.

Opens two palettes: one on a local probe page (probe.html) that measures the
embedded browser and round-trips a 6 MB string in both directions, and one
on the live app at https://feb-composites.web.app so a person can see it
render and sign in. Everything the Python side learns goes to s4.log beside
this file, because an add-in has no console once run() returns.

Install: copy this folder to the per-user AddIns folder and run it from
Utilities > Add-Ins, or import it from a script and call run(None).
Throwaway spike, not product code."""
import adsk.core, adsk.fusion, traceback, os, json, time

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "s4.log")
APP_URL = "https://feb-composites.web.app"
PROBE_ID, APP_ID = "feb-s4-probe", "feb-s4-app"
PAYLOAD = 6 * 1024 * 1024   # bytes of ASCII; the app's own STL storage budget

_handlers = []   # keep handler objects alive for the life of the add-in


def log(*parts):
    with open(LOG, "a") as f:
        f.write(time.strftime("%H:%M:%S ") + " ".join(str(p) for p in parts) + "\n")


class Incoming(adsk.core.HTMLEventHandler):
    def __init__(self, tag):
        super().__init__()
        self.tag = tag

    def notify(self, args):
        try:
            a = adsk.core.HTMLEventArgs.cast(args)
            data = a.data or ""
            if a.action == "probe":
                log(self.tag, "probe:", data)
                a.returnData = "ok"
            elif a.action == "big-in":
                # JS -> Python: measure what arrived, echo the same size back.
                ok = len(data) == PAYLOAD and data[:3] == "abc" and data[-3:] == "xyz"
                log(self.tag, "big-in: received", len(data), "chars, intact", ok)
                a.returnData = "q" * PAYLOAD
            elif a.action == "big-in-echo":
                log(self.tag, "big-in-echo (JS saw returnData):", data)
                a.returnData = "ok"
            elif a.action == "big-out-ack":
                log(self.tag, "big-out-ack (JS received sendInfoToHTML payload):", data)
                a.returnData = "ok"
            elif a.action == "response":
                # Async reply to sendInfoToHTML when useNewWebBrowser is on.
                log(self.tag, "response:", data[:200])
            else:
                log(self.tag, "other action", a.action, data[:200])
                a.returnData = "ok"
        except Exception:
            log("handler error", traceback.format_exc())


class Nav(adsk.core.NavigationEventHandler):
    def __init__(self, tag):
        super().__init__()
        self.tag = tag

    def notify(self, args):
        try:
            a = adsk.core.NavigationEventArgs.cast(args)
            log(self.tag, "navigating:", a.navigationURL)
        except Exception:
            log("nav handler error", traceback.format_exc())


def open_palette(ui, pid, name, url, w, h):
    old = ui.palettes.itemById(pid)
    if old:
        old.deleteMe()
    p = ui.palettes.add(pid, name, url, True, True, True, w, h, True)
    p.dockingState = adsk.core.PaletteDockingStates.PaletteDockStateRight
    h1 = Incoming(pid); p.incomingFromHTML.add(h1); _handlers.append(h1)
    h2 = Nav(pid); p.navigatingURL.add(h2); _handlers.append(h2)
    return p


def run(context):
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        if os.path.exists(LOG):
            os.remove(LOG)
        log("S4 start; Fusion", app.version)
        probe = open_palette(ui, PROBE_ID, "S4 probe", "file://" + os.path.join(HERE, "probe.html"), 480, 640)
        log("probe palette:", probe.htmlFileURL)
        open_palette(ui, APP_ID, "FEB Composites (S4)", APP_URL, 480, 800)
        log("app palette opened on", APP_URL)
    except Exception:
        log("run error", traceback.format_exc())


def send_big(ui):
    """Python -> JS leg: called from a script after the page is up."""
    p = ui.palettes.itemById(PROBE_ID)
    t = time.time()
    r = p.sendInfoToHTML("big-out", "m" * PAYLOAD)
    log("big-out sent", PAYLOAD, "chars in", round(time.time() - t, 3), "s; sync return:", repr(r[:60]))


def stop(context):
    try:
        ui = adsk.core.Application.get().userInterface
        for pid in (PROBE_ID, APP_ID):
            p = ui.palettes.itemById(pid)
            if p:
                p.deleteMe()
    except Exception:
        log("stop error", traceback.format_exc())
