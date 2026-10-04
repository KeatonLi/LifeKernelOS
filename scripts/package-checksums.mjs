import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const folder = process.argv[2] ?? 'release';
const installers = (await readdir(folder, { withFileTypes: true })).filter(
  (entry) =>
    entry.isFile() && /\.(exe|dmg|zip|AppImage|tar\.gz)$/.test(entry.name),
);
if (!installers.length) throw new Error('No desktop installers were produced.');
for (const { name } of installers) {
  const digest = createHash('sha256')
    .update(await readFile(join(folder, name)))
    .digest('hex');
  await writeFile(join(folder, `${name}.sha256`), `${digest}  ${name}\n`);
}
console.log(`Checksums written for ${installers.length} installers.`);
