#!/usr/bin/env python3
"""Local-only Apps Script include builder and server; Python standard library only."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import threading

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / '.local'
INCLUDE = re.compile(r"<\?!=\s*include\(\s*(['\"])([^'\"]+)\1\s*\)\s*;?\s*\?>")


class BuildError(Exception):
    pass


def resolve(name, root=ROOT, stack=()):
    path = (root / name).resolve()
    if root.resolve() not in path.parents:
        raise BuildError('Include must stay inside the project: ' + name)
    if path in stack:
        raise BuildError('Circular include: ' + ' → '.join(p.name for p in stack + (path,)))
    source = path.read_text(encoding='utf-8')

    def expand(match):
        target = match.group(2) + '.html'
        if not (root / target).is_file():
            raise BuildError(f"{path.name} references include('{match.group(2)}') but {target} does not exist.")
        return resolve(target, root, stack + (path,))

    result = INCLUDE.sub(expand, source)
    if '<?' in result:
        raise BuildError(f'{path.name}: unsupported or unresolved Apps Script scriptlet. Only literal include(...) calls are supported locally.')
    return result


def build(root=ROOT, output=OUTPUT):
    page = resolve('Index.html', root)
    shim = resolve('LocalDevShim.html', root)
    head = re.search(r'<head\b[^>]*>', page, re.I)
    if not head:
        raise BuildError('Index.html is missing <head>.')
    # Code.gs supplies these metadata values through HtmlService in production.
    additions = '\n' + shim + '\n'
    if not re.search(r'<meta\b[^>]*name=[\"\']viewport[\"\']', page, re.I):
        additions += '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    if not re.search(r'<title\b', page, re.I):
        additions += '<title>Novare Nexus 2026</title>\n'
    page = page[:head.end()] + additions + page[head.end():]
    output.mkdir(parents=True, exist_ok=True)
    temporary = output / 'index.html.tmp'
    temporary.write_text(page, encoding='utf-8')
    temporary.replace(output / 'index.html')


class DevelopmentBuild:
    def __init__(self):
        self.lock = threading.Lock()
        self.fingerprint = None
        self.error = None

    def refresh(self):
        with self.lock:
            try:
                fingerprint = tuple((str(p), p.stat().st_mtime_ns, p.stat().st_size)
                                    for p in sorted(ROOT.rglob('*.html'))
                                    if not any(part.startswith('.') for part in p.relative_to(ROOT).parts))
                if fingerprint == self.fingerprint and (OUTPUT / 'index.html').exists():
                    return self.error
                self.fingerprint = fingerprint
                build()
                self.error = None
                print('Build completed.', flush=True)
            except (BuildError, OSError, UnicodeError) as error:
                self.error = str(error)
                print('ERROR: ' + self.error, flush=True)
            return self.error


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(OUTPUT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_head(self):
        error = self.server.development.refresh()
        if error:
            self.send_error(500, 'Local build failed', explain=error)
            return None
        for header in ('If-Modified-Since', 'If-None-Match'):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--build-only', action='store_true')
    args = parser.parse_args()
    print('Novare Nexus Local Development\n--------------------------------', flush=True)
    development = DevelopmentBuild()
    if development.refresh():
        return 1
    if args.build_only:
        return 0
    try:
        server = ThreadingHTTPServer(('localhost', args.port), Handler)
    except OSError as error:
        print(f'ERROR: Cannot start server: {error}. Try --port 5500.', flush=True)
        return 1
    server.development = development
    stop = threading.Event()

    def watch():
        while not stop.wait(0.5):
            development.refresh()

    watcher = threading.Thread(target=watch, daemon=True)
    watcher.start()
    print(f'Serving at:\nhttp://localhost:{server.server_port}\n\nPress Ctrl+C to stop.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
    finally:
        stop.set()
        watcher.join()
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
