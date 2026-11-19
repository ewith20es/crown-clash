// Serves the game files and the shared multiplayer API.
//   node tools/serve.mjs            → http://localhost:5173
//   PORT=8080 HOST=0.0.0.0 node tools/serve.mjs   (HOST=0.0.0.0 lets a phone on your LAN connect)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MatchService, serveMatch } from './multiplayer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const matches = new MatchService();
const ticker = setInterval(() => matches.maintain(), 1000 / 30);
ticker.unref();
const server = http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/match') return await serveMatch(req, res, matches);
    if (pathname.endsWith('/')) pathname += 'index.html';
    if (!/^\/(?:index\.html$|multiplayer-config\.js$|(?:assets|js|css)\/)/.test(pathname) || /(?:^|\/)\.|[\\:]/.test(pathname)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Crown Clash dev server → http://localhost:${port}`);
});
