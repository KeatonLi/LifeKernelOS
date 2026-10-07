import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from './desktop-artifacts.mjs';
const folder = process.argv[2] ?? 'release';
const installers = (await readdir(folder, { withFileTypes: true })).filter(
  (entry) =>
    entry.isFile() && /\.(exe|dmg|zip|AppImage|tar\.gz)$/.test(entry.name),
);
if (!installers.length) throw new Error('No desktop installers were produced.');
for (const { name } of installers) {
  const digest = await sha256(join(folder, name));
  await writeFile(join(folder, `${name}.sha256`), `${digest}  ${name}\n`);
}
console.log(`Checksums written for ${installers.length} installers.`);
