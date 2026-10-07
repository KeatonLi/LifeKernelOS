import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

// Keep names aligned with electron-builder's ${os} / ${arch} macros.
// AppImage expands x64 to x86_64, whereas tar.gz retains x64.
export const desktopTargets = [
  { name: 'Linux-x64', platform: 'linux', arch: 'x64', formats: ['AppImage', 'tar.gz'] },
  { name: 'macOS-arm64', platform: 'mac', arch: 'arm64', formats: ['dmg', 'zip'] },
  { name: 'macOS-x64', platform: 'mac', arch: 'x64', formats: ['dmg', 'zip'] },
  { name: 'Windows-arm64', platform: 'win', arch: 'arm64', formats: ['exe'] },
  { name: 'Windows-x64', platform: 'win', arch: 'x64', formats: ['exe'] },
];

export function targetFor(platform, arch) {
  const target = desktopTargets.find(item => item.platform === platform && item.arch === arch);
  if (!target) throw new Error(`Unsupported desktop target: ${platform}/${arch}`);
  return target;
}

export function installerNames(target, version, productName = 'LifeKernelOS') {
  return target.formats.map(format => {
    const arch = format === 'AppImage' && target.arch === 'x64' ? 'x86_64' : target.arch;
    return `${productName}-${version}-${target.platform}-${arch}.${format}`;
  });
}

export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export function binaryArchitecture(header, platform) {
  if (platform === 'win') {
    if (header.toString('ascii', 0, 2) !== 'MZ') throw new Error('Expected a Windows PE executable.');
    const peOffset = header.readUInt32LE(0x3c);
    if (header.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') throw new Error('Invalid PE header.');
    const machine = header.readUInt16LE(peOffset + 4);
    if (machine === 0x8664) return 'x64';
    if (machine === 0xaa64) return 'arm64';
  } else if (platform === 'mac') {
    if (header.readUInt32LE(0) !== 0xfeedfacf) throw new Error('Expected a 64-bit Mach-O executable.');
    const cpu = header.readUInt32LE(4);
    if (cpu === 0x01000007) return 'x64';
    if (cpu === 0x0100000c) return 'arm64';
  } else if (platform === 'linux') {
    if (header.toString('hex', 0, 4) !== '7f454c46' || header[4] !== 2 || header[5] !== 1)
      throw new Error('Expected a little-endian 64-bit ELF executable.');
    const machine = header.readUInt16LE(18);
    if (machine === 62) return 'x64';
    if (machine === 183) return 'arm64';
  }
  throw new Error(`Unsupported ${platform} executable architecture.`);
}
