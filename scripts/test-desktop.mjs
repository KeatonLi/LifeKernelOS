import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import electron from 'electron';
const folder = await mkdtemp(join(tmpdir(), 'lifekernel-electron-test-'));
const appRoot = process.argv[2] ? resolve(process.argv[2]) : undefined;
async function run(reopen) {
  const args = [fileURLToPath(new URL('./electron-smoke.cjs', import.meta.url))];
  if (process.platform === 'linux' && process.getuid?.() === 0)
    args.unshift('--no-sandbox'); // CI test process only; never a product default.
  await new Promise((resolve, reject) => {
    const child = spawn(electron, args, {
      stdio: 'inherit',
      cwd: folder,
      env: {
        ...process.env,
        LK_DATA_DIR: folder,
        LK_SMOKE_REOPEN: reopen ? '1' : '0',
        LK_SMOKE_APP_ROOT: appRoot ?? '',
      },
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Electron smoke exited with ${code}`)),
    );
  });
}
try {
  await run(false);
  await run(true);
} finally {
  await rm(folder, { recursive: true, force: true });
}
