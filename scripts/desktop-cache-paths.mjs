import { appendFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

// Match @electron/get's env-paths('electron', { suffix: '' }) and
// electron-builder's getCacheDirectory without requiring npm dependencies.
const home = homedir();
const local = process.env.LOCALAPPDATA?.trim();
const base = process.platform === 'darwin' ? join(home, 'Library', 'Caches')
  : process.platform === 'win32' ? local || join(home, 'AppData', 'Local')
  : process.env.XDG_CACHE_HOME || join(home, '.cache');
const electron = process.platform === 'win32' ? join(base, 'electron', 'Cache') : join(base, 'electron');
const builder = process.platform === 'win32'
  ? !local || process.env.USERNAME?.toLowerCase() === 'system' || local.toLowerCase().includes('\\windows\\system32\\')
    ? join(tmpdir(), 'electron-builder-cache') : join(local, 'electron-builder', 'Cache')
  : process.platform === 'darwin' ? join(base, 'electron-builder')
  : join(process.env.XDG_CACHE_HOME && isAbsolute(process.env.XDG_CACHE_HOME) ? process.env.XDG_CACHE_HOME : join(home, '.cache'), 'electron-builder');

const output = `electron=${electron}\nbuilder-downloads=${join(builder, 'downloads')}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
else process.stdout.write(output);
