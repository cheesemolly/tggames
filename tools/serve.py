"""Локальный сервер для разработки: как `python -m http.server`, но запрещает браузеру кэшировать файлы.

Без этого Safari на айфоне (и туннель) показывали старые JS/CSS после правок.
Запуск: python tools/serve.py [порт]  (по умолчанию 8000) — или npm start.
"""
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    http.server.ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
