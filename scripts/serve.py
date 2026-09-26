#!/usr/bin/env python3
"""Local development server; keeps wasm MIME and cross-origin policy explicit."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import argparse

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.js': 'text/javascript'}
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8436)
    args = parser.parse_args()
    os.chdir(Path(__file__).resolve().parents[1] / 'web')
    print(f'Blip & Blop browser: http://localhost:{args.port}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', args.port), Handler).serve_forever()
