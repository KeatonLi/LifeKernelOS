import { readFileSync } from 'node:fs';
const tag = process.argv[2];
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
if (
  !/^v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(tag ?? '') ||
  tag !== `v${version}`
) {
  throw new Error(`Release tag must match package.json: v${version}`);
}
console.log(`Release version verified: ${tag}`);
