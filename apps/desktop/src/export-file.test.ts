import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { writeJsonExport } from './export-file.js';

async function exportFolder(context: { after: (fn: () => Promise<void>) => void }) {
  const folder = await mkdtemp(join(tmpdir(), 'lifekernel-export-'));
  assert.equal(dirname(folder), resolve(tmpdir()));
  context.after(() => rm(folder, { recursive: true, force: true }));
  return folder;
}

test('SPEC-0012：同时导出到同一路径保留完整快照，不覆盖用户暂存文件', async context => {
  const folder = await exportFolder(context);
  const destination = join(folder, 'backup.json');
  const unrelated = `${destination}.tmp`;
  await writeFile(unrelated, 'user-owned draft');
  const snapshots = [{ data: '甲'.repeat(100000) }, { data: '乙'.repeat(100000) }];
  await Promise.all(snapshots.map(snapshot => writeJsonExport(destination, snapshot)));
  const actual = JSON.parse(await readFile(destination, 'utf8'));
  assert.deepEqual(actual, snapshots[1], 'the later export must replace the earlier complete snapshot');
  assert.equal(await readFile(unrelated, 'utf8'), 'user-owned draft');
  assert.deepEqual((await readdir(folder)).sort(), ['backup.json', 'backup.json.tmp']);
});

test('SPEC-0012：导出失败后同一目标可重新导出，不被失败队列阻塞', async context => {
  const folder = await exportFolder(context);
  const destination = join(folder, 'backup.json');
  await mkdir(destination);
  await assert.rejects(writeJsonExport(destination, { data: 'cannot replace a directory' }));
  await rmdir(destination);
  await writeJsonExport(destination, { data: 'recovered export' });
  assert.deepEqual(JSON.parse(await readFile(destination, 'utf8')), { data: 'recovered export' });
  assert.deepEqual(await readdir(folder), ['backup.json']);
});

test('SPEC-0012：导出替换失败保留原目标并清理本次临时文件', async context => {
  const folder = await exportFolder(context);
  const destination = join(folder, 'existing-folder');
  await mkdir(destination);
  await writeFile(join(destination, 'keep.txt'), 'original work');
  await assert.rejects(writeJsonExport(destination, { data: 'new export' }));
  assert.equal(await readFile(join(destination, 'keep.txt'), 'utf8'), 'original work');
  assert.deepEqual(await readdir(folder), ['existing-folder']);
});
