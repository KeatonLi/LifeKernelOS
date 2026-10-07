import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { binaryArchitecture, installerNames, targetFor } from './desktop-artifacts.mjs';

const [platform, arch, output = 'release'] = process.argv.slice(2);
const target = targetFor(platform, arch);
const nodePlatform = { mac: 'darwin', win: 'win32', linux: 'linux' }[platform];
assert.equal(process.platform, nodePlatform, 'Package validation must run on the target OS.');
assert.equal(process.arch, arch, 'Package validation must run on the target CPU architecture.');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const suffix = arch === 'x64' ? '' : `-${arch}`;
const appDir = resolve(output, `${platform}${suffix}${platform === 'mac' ? '' : '-unpacked'}`);
const contents = platform === 'mac' ? join(appDir, `${pkg.build.productName}.app`, 'Contents') : appDir;
const binary = platform === 'mac' ? join(contents, 'MacOS', pkg.build.productName)
  : join(contents, platform === 'win' ? `${pkg.build.productName}.exe` : pkg.name);
const archive = join(contents, platform === 'mac' ? 'Resources' : 'resources', 'app.asar');

const file = await open(binary, 'r');
try {
  const header = Buffer.alloc(4096);
  const { bytesRead } = await file.read(header, 0, header.length, 0);
  assert.equal(binaryArchitecture(header.subarray(0, bytesRead), platform), arch,
    'Packaged Electron binary has the wrong architecture.');
} finally { await file.close(); }

// Use the ASAR implementation owned by the installed electron-builder toolchain.
const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
const asar = builderRequire('@electron/asar');
const electronVersion = require('electron/package.json').version;
const embedded = JSON.parse(execFileSync(binary, ['-e', `
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const value = db.prepare('SELECT 1 AS value').get().value;
  db.close();
  console.log(JSON.stringify({ electron: process.versions.electron, arch: process.arch, sqlite: value }));
`], {
  encoding: 'utf8', timeout: 10000, windowsHide: true, cwd: tmpdir(),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
}));
assert.equal(embedded.electron, electronVersion, 'Packaged Electron version differs from the tested runtime.');
assert.equal(embedded.arch, arch);
assert.equal(embedded.sqlite, 1, 'Packaged runtime cannot use built-in SQLite.');
const files = new Set(asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, '')));
const forbidden = [...files].filter(name => /(^|\/)(node_modules|backups)(\/|$)|\.(sqlite|sqlite-wal|sqlite-shm)$/.test(name));
assert.deepEqual(forbidden, [], 'Package contains dependencies or user data.');

async function verifyTree(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    const name = `${folder}/${entry.name}`;
    if (entry.isDirectory()) await verifyTree(name);
    else if (entry.isFile()) {
      assert.ok(files.has(name), `Missing packaged resource: ${name}`);
      assert.deepEqual(asar.extractFile(archive, name), await readFile(name), `Stale packaged resource: ${name}`);
    }
  }
}
for (const folder of ['dist', 'dist-desktop', 'db/migrations', 'public/brand']) await verifyTree(folder);
for (const name of ['dist/index.html', 'dist-desktop/main.cjs', 'dist-desktop/preload.cjs', 'dist-desktop/worker.cjs'])
  assert.ok(files.has(name), `Missing required application entry: ${name}`);
const packedPkg = JSON.parse(asar.extractFile(archive, 'package.json').toString());
assert.equal(packedPkg.version, pkg.version);
assert.equal(packedPkg.main, pkg.main);
const expected = installerNames(target, pkg.version, pkg.build.productName);
const actual = (await readdir(output, { withFileTypes: true }))
  .filter(entry => entry.isFile() && /\.(exe|dmg|zip|AppImage|tar\.gz)$/.test(entry.name))
  .map(entry => entry.name).sort();
assert.deepEqual(actual, [...expected].sort(), 'Missing, incorrectly named or unexpected installer.');
for (const name of expected) assert.ok((await stat(join(output, name))).size > 0, `Empty installer: ${name}`);
console.log(`Package verified: ${target.name}; binary architecture/runtime/SQLite, ASAR resources and ${expected.length} installers.`);
