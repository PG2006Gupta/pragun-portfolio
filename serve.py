#!/usr/bin/env python3
"""
Dev/preview static server for the Pragun Gupta portfolio.

Why this exists: `python3 -m http.server` sends no Cache-Control header, so
browsers apply their own heuristic caching and can keep showing an old copy of
a page after the file changed. Every response here is explicitly no-store, so
a reload always shows the current files.

    python3 serve.py [port]        # default 8000
"""
import sys
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(SimpleHTTPRequestHandler):
    # never let the browser (or an intermediate proxy) keep a stale copy
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_head(self):
        # drop conditional-request handling so a changed file is never 304'd
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        if "If-None-Match" in self.headers:
            del self.headers["If-None-Match"]
        return super().send_head()

    def log_message(self, fmt, *args):
        # log the User-Agent too: makes it obvious whether a request came from
        # a real browser or from an automated check
        ua = (self.headers.get("User-Agent") or "-")[:60]
        sys.stderr.write("%s [%s] %s\n" % (self.address_string(), ua, fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=ROOT)
    httpd = ThreadingHTTPServer(("0.0.0.0", port), handler)
    print(f"serving {ROOT} on http://0.0.0.0:{port}  (Cache-Control: no-store)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
