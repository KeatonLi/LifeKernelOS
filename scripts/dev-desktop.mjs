import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';
const server = await createServer({
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
});
await server.listen();
const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, LK_DEV_URL: 'http://127.0.0.1:4173/' },
});
child.once('exit', async (code) => {
  await server.close();
  process.exitCode = code ?? 0;
});
process.on('SIGINT', () => child.kill('SIGINT'));
