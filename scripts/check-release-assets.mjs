import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { desktopTargets, installerNames, sha256 } from './desktop-artifacts.mjs';

export async function verifyReleaseAssets(folder, version, productName = 'LifeKernelOS') {
  const expectedFolders = desktopTargets.map(target => `${productName}-${target.name}`).sort();
  const entries = await readdir(folder, { withFileTypes: true });
  assert.deepEqual(entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort(), expectedFolders,
    'Release must contain every supported desktop architecture.');
  assert.ok(entries.every(entry => entry.isDirectory()), 'Unexpected file outside installer artifacts.');
  let count = 0;
  for (const target of desktopTargets) {
    const artifactFolder = join(folder, `${productName}-${target.name}`);
    const installers = installerNames(target, version, productName);
    const expectedFiles = installers.flatMap(name => [name, `${name}.sha256`]).sort();
    const files = await readdir(artifactFolder, { withFileTypes: true });
    assert.ok(files.every(entry => entry.isFile()), 'Installer artifacts may only contain regular files.');
    assert.deepEqual(files.map(entry => entry.name).sort(), expectedFiles,
      `Incomplete or unexpected installer files for ${target.name}.`);
    for (const name of installers) {
      const file = join(artifactFolder, name);
      assert.ok((await stat(file)).size > 0, `Empty installer: ${name}`);
      const expected = `${await sha256(file)}  ${name}\n`;
      assert.equal(await readFile(`${file}.sha256`, 'utf8'), expected, `Invalid checksum: ${name}`);
      count++;
    }
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const count = await verifyReleaseAssets(process.argv[2] ?? 'release-assets', pkg.version, pkg.build.productName);
  console.log(`Release assets verified: ${count} installers with matching SHA-256 across ${desktopTargets.length} targets.`);
}
