"""The test page's small desk: the frame around the app, the session's minutes and credits, and the Stop button.

Runs on the demo box beside the app, behind the same password door (nginx). It reads nothing from the app or the model:
only the clock, the hourly price, and the time of the last model call (the translator's log file's last change).

  python3 control.py --boot <epoch the box started> --rate 120 --idle-min 10 --max-min 60 \
      --shim-log /root/job/demo-logs/shim.jsonl --stop-file /workspace/ownmodel/demo-stop

  GET  /__skyling/         the frame page (frame.html): label, minutes, credits, Stop, and the app inside
  GET  /__skyling/status   {"state", "minutes", "credits", "quiet_minutes", "stops_in_minutes"}
  POST /__skyling/stop     asks the box script to stop everything now (it watches the stop file) and returns the final count
"""
import argparse, json, os, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=8200)
ap.add_argument("--boot", type=float, required=True, help="when the box started billing (epoch seconds)")
ap.add_argument("--ready", type=float, default=None, help="when the link became ready (the idle and time limits count from here)")
ap.add_argument("--rate", type=float, default=120, help="credits an hour for this box")
ap.add_argument("--idle-min", type=float, default=10)
ap.add_argument("--max-min", type=float, default=60)
ap.add_argument("--shim-log", required=True)
ap.add_argument("--stop-file", required=True)
A = ap.parse_args()
READY = A.ready or time.time()
HERE = os.path.dirname(os.path.abspath(__file__))


def status():
    now = time.time()
    try:
        last = max(os.path.getmtime(A.shim_log), READY)
    except OSError:
        last = READY
    minutes = (now - A.boot) / 60
    left = min(A.idle_min - (now - last) / 60, A.max_min - (now - READY) / 60)
    return {"state": "stopping" if os.path.exists(A.stop_file) else "running", "minutes": round(minutes, 1), "credits": round(minutes * A.rate / 60),
            "rate": A.rate, "quiet_minutes": round((now - last) / 60, 1), "stops_in_minutes": max(0, round(left, 1)), "idle_minutes": A.idle_min}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, kind="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/__skyling", "/__skyling/"):
            self.send(200, open(os.path.join(HERE, "frame.html"), "rb").read(), "text/html; charset=utf-8")
        elif path == "/__skyling/status":
            self.send(200, status())
        else:
            self.send(404, {"error": "not found"})

    def do_POST(self):
        if self.path.split("?")[0] != "/__skyling/stop":
            return self.send(404, {"error": "not found"})
        final = {**status(), "state": "stopped"}
        with open(A.stop_file, "w") as f:
            f.write("the Stop button\n")
        self.send(200, final)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", A.port), H).serve_forever()
