import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4195';
let browser, server, folder;
const screenshots = process.env.UI_SCREENSHOT_DIR;
before(async () => {
  if (!process.env.UI_BASE_URL) {
    folder = await mkdtemp(join(tmpdir(), 'components-ui-'));
    server = spawn(process.execPath, ['--import', 'tsx', 'scripts/preview-desktop.ts'], { env: { ...process.env, LK_PREVIEW_PORT: '4195', LK_PREVIEW_DATABASE: join(folder, 'preview.sqlite'), LK_PREVIEW_EXAMPLE: '1' }, stdio: 'pipe' });
    let log = '';
    server.stdout.on('data', data => { log += data });
    server.stderr.on('data', data => { log += data });
    let ready = false;
    for (let attempt = 0; attempt < 180; attempt++) {
      if (server.exitCode !== null) throw new Error(log);
      try { if ((await fetch(base)).ok) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, `Preview did not start: ${log}`);
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  if (screenshots) await mkdir(screenshots, { recursive: true });
});
after(async () => {
  await browser?.close();
  if (server) {
    server.kill('SIGTERM');
    await Promise.race([new Promise(resolve => server.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 2000))]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  if (folder) await rm(folder, { recursive: true, force: true });
});
async function pageFor(path, viewport = { width: 1440, height: 960 }) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + path);
  return { page, errors };
}
async function screenshot(page, name) { if (screenshots) await page.screenshot({ path: join(screenshots, name + '.png'), fullPage: true }) }

test('Nova capture form saves text and restores focus after Escape', async () => {
  const { page, errors } = await pageFor('/#/expectations');
  await page.getByText('打磨主线工作区的第一眼', { exact: true }).last().waitFor();
  await screenshot(page, 'desktop');
  const trigger = page.getByRole('button', { name: /快速记下/ });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: '快速收集箱' });
  const input = drawer.getByRole('textbox', { name: '收集内容' });
  assert.equal(await input.getAttribute('data-slot'), 'textarea');
  const save = drawer.getByRole('button', { name: '保存', exact: true });
  assert.equal(await save.isDisabled(), true);
  const text = `组件回归 ${Date.now()}`;
  await input.fill(text);
  assert.equal(await save.isEnabled(), true);
  await save.click();
  await drawer.getByText(text, { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.capture-drawer button[aria-label="关闭"]')?.disabled);
  await screenshot(page, 'capture');
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
  assert.deepEqual(errors, []);
  await page.close();
});
test('Nova menu retains keyboard navigation and focus', async () => {
  const { page, errors } = await pageFor('/#/expectations', { width: 900, height: 640 });
  const trigger = page.getByRole('button', { name: '更多当前任务操作' }).first();
  await trigger.focus(); await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu').first(); await menu.waitFor();
  assert.equal(await menu.getByRole('menuitem').first().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('End');
  assert.equal(await menu.getByRole('menuitem').last().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await screenshot(page, 'compact');
  assert.deepEqual(errors, []); await page.close();
});
