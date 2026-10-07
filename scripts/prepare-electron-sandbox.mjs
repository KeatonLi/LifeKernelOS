import electron from 'electron';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

if (process.platform === 'linux') {
  const helper = join(dirname(electron), 'chrome-sandbox');
  execFileSync('sudo', ['chown', 'root:root', helper], { stdio: 'inherit' });
  execFileSync('sudo', ['chmod', '4755', helper], { stdio: 'inherit' });
}
