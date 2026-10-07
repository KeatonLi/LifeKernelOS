import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { binaryArchitecture, desktopTargets, installerNames, sha256 } from './desktop-artifacts.mjs';
import { verifyReleaseAssets } from './check-release-assets.mjs';

const version = '0.5.1';
async function releaseFixture(t) {
  const folder = await mkdtemp(join(tmpdir(), 'lifekernel-release-check-'));
  assert.equal(dirname(folder), resolve(tmpdir()));
  t.after(() => rm(folder, { recursive: true, force: true }));
  for (const target of desktopTargets) {
    const targetFolder = join(folder, `LifeKernelOS-${target.name}`);
    await mkdir(targetFolder);
    for (const name of installerNames(target, version)) {
      const file = join(targetFolder, name);
      await writeFile(file, `installer fixture: ${name}`);
      await writeFile(`${file}.sha256`, `${await sha256(file)}  ${name}\n`);
    }
  }
  return folder;
}

test('detects x64 and ARM64 PE / Mach-O / ELF binaries, rejecting unsupported headers', () => {
  for (const [arch, pe, mach, elf] of [['x64', 0x8664, 0x01000007, 62], ['arm64', 0xaa64, 0x0100000c, 183]]) {
    const header = Buffer.alloc(512);
    header.write('MZ'); header.writeUInt32LE(0x80, 0x3c); header.write('PE\0\0', 0x80);
    header.writeUInt16LE(pe, 0x84);
    assert.equal(binaryArchitecture(header, 'win'), arch);
    header.fill(0); header.writeUInt32LE(0xfeedfacf, 0); header.writeUInt32LE(mach, 4);
    assert.equal(binaryArchitecture(header, 'mac'), arch);
    header.fill(0); header.write('7f454c46', 0, 'hex'); header[4] = 2; header[5] = 1;
    header.writeUInt16LE(elf, 18);
    assert.equal(binaryArchitecture(header, 'linux'), arch);
  }
  for (const platform of ['win', 'mac', 'linux'])
    assert.throws(() => binaryArchitecture(Buffer.alloc(512), platform));
});

test('accepts eight installers and their SHA-256 across all five desktop targets', async t => {
  assert.equal(await verifyReleaseAssets(await releaseFixture(t), version), 8);
});

test('rejects a tampered installer before release', async t => {
  const folder = await releaseFixture(t);
  const target = desktopTargets.find(item => item.name === 'Windows-arm64');
  await writeFile(join(folder, `LifeKernelOS-${target.name}`, installerNames(target, version)[0]), 'tampered');
  await assert.rejects(verifyReleaseAssets(folder, version), /Invalid checksum/);
});

test('rejects a missing Windows ARM64 artifact', async t => {
  const folder = await releaseFixture(t);
  const missing = resolve(folder, 'LifeKernelOS-Windows-arm64');
  assert.equal(dirname(missing), folder);
  await rm(missing, { recursive: true });
  await assert.rejects(verifyReleaseAssets(folder, version), /every supported desktop architecture/);
});

test('rejects a missing checksum', async t => {
  const folder = await releaseFixture(t);
  const name = installerNames(desktopTargets[1], version)[0];
  await rm(join(folder, `LifeKernelOS-${desktopTargets[1].name}`, `${name}.sha256`));
  await assert.rejects(verifyReleaseAssets(folder, version), /Incomplete or unexpected/);
});

test('rejects an unexpected uploaded file', async t => {
  const folder = await releaseFixture(t);
  await writeFile(join(folder, 'LifeKernelOS-Windows-x64', 'lifekernel.sqlite'), 'private fixture');
  await assert.rejects(verifyReleaseAssets(folder, version), /Incomplete or unexpected/);
});

test('rejects stale package versions and malformed checksum lines', async t => {
  const folder = await releaseFixture(t);
  await assert.rejects(verifyReleaseAssets(folder, '0.5.2'), /Incomplete or unexpected/);
  const target = desktopTargets[0];
  const name = installerNames(target, version)[0];
  const file = join(folder, `LifeKernelOS-${target.name}`, name);
  await writeFile(`${file}.sha256`, `${await sha256(file)}  ../${name}\n`);
  await assert.rejects(verifyReleaseAssets(folder, version), /Invalid checksum/);
});
