import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.cwd());
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 4173);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${host}:${port}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const safePath = normalize(pathname).replace(/^([/\\])+/, '');
    let target = resolve(join(root, safePath || 'index.html'));

    if (!target.startsWith(root)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
    const file = await readFile(target);
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(file);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`LifeKernel OS UI prototype: http://${host}:${port}`);
});
