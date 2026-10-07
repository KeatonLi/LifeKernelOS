// Runs the real main/preload/utility process against an isolated test workspace.
const { app, BrowserWindow, dialog } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const root = process.env.LK_SMOKE_APP_ROOT
  ? path.resolve(process.env.LK_SMOKE_APP_ROOT)
  : path.resolve(__dirname, '..');
app.setAppPath(root);
const timeout = setTimeout(() => {
  console.error('Desktop smoke timed out');
  app.exit(1);
}, 30000);
let running = false;
app.on('browser-window-created', (_event, window) => {
  if (running) return;
  running = true;
  window.webContents.once('did-finish-load', async () => {
    try {
      const request = async (method, route, body) => {
        const result = await window.webContents.executeJavaScript(
          `window.lifeKernel.request(${JSON.stringify({ method, path: route, body })})`,
        );
        assert.equal(result.ok, true, JSON.stringify(result));
        return result.data;
      };
      const isolation = await window.webContents.executeJavaScript(
        '({node:typeof window.require, bridge:typeof window.lifeKernel, body:document.body.textContent})',
      );
      assert.equal(isolation.node, 'undefined');
      assert.equal(isolation.bridge, 'object');
      assert.equal(
        window.webContents.getLastWebPreferences().contextIsolation,
        true,
      );
      assert.equal(window.webContents.getLastWebPreferences().sandbox, true);
      const ai = async command => {
        const result = await window.webContents.executeJavaScript(`window.lifeKernel.ai(${JSON.stringify(command)})`);
        assert.equal(result.ok, true, JSON.stringify(result));
        return result.data;
      };
      const aiMetadata = await ai({ kind: 'settings' });
      assert.equal(aiMetadata.hasApiKey, false);
      const { user } = await request('GET', '/api/auth/me');
      assert.equal(user.email, 'local@lifekernel.desktop');
      let { goals } = await request('GET', '/api/goals');
      if (process.env.LK_SMOKE_REOPEN === '1') {
        assert.equal(goals.length, 1);
        assert.equal(goals[0].progress.completedTodoCount, 1);
        const { actions } = await request('GET', '/api/todos');
        assert.equal(actions.length, 4);
        assert.equal(actions.filter(item => item.parentActionId).length, 2);
        assert.ok(actions.filter(item => item.parentActionId).every(item => item.status === 'abandoned'));
        assert.equal(actions.find(item => item.title === '下一个行动').scheduledDate, '2024-02-29');
        const persisted = await request('GET', '/api/current');
        assert.equal(persisted.currentAction.title, '下一个行动');
        console.log(
          'DESKTOP REOPEN PASSED: identity, tasks and completion persist',
        );
      } else {
        assert.equal(goals.length, 0, 'first start must be empty');
        const { goal } = await request('POST', '/api/goals', {
          title: '桌面启动验证',
        });
        const { capture } = await request('POST', '/api/captures', {
          content: '完整的本地行动记录',
          type: 'idea',
        });
        const { action } = await request(
          'POST',
          `/api/captures/${capture.id}/convert`,
          { goalId: goal.id, title: '完成桌面闭环' },
        );
        await request('POST', '/api/current/select', { actionId: action.id });
        const focusResult = await window.webContents.executeJavaScript(
          "window.lifeKernel.desktop('focus')",
        );
        assert.equal(focusResult.ok, true);
        await new Promise((resolve) => setTimeout(resolve, 500));
        assert.equal(BrowserWindow.getAllWindows().length, 2);
        await request('POST', '/api/current/complete', {
          expectedActionId: action.id,
        });
        await request('PATCH', `/api/actions/${action.id}`, {scheduledDate: '2026-10-04'});
        await request('POST', `/api/actions/${action.id}/status`, {status: 'available', expectedStatus: 'completed'});
        const { action: next } = await request('POST', `/api/goals/${goal.id}/actions`, {title: '下一个行动', scheduledDate: '2024-02-29'});
        await request('POST', '/api/current/select', {actionId: next.id});
        await request('POST', `/api/actions/${action.id}/status`, {status: 'completed', expectedStatus: 'available'});
        const workspace = await request('GET', '/api/current');
        assert.equal(workspace.currentAction.id, next.id);
        const { profile } = await request('GET', '/api/profile');
        assert.equal(profile.factSummary.completedActionCount, 1);
        const exportData = await request('GET', '/api/export');
        assert.equal(exportData.data.captures[0].status, 'converted');
        assert.equal(exportData.schemaVersion, 7);
        assert.equal(exportData.data.actions.find(item => item.id === action.id).scheduledDate, '2026-10-04');
        const invalid = await window.webContents.executeJavaScript(
          "window.lifeKernel.request({method:'POST',path:'/api/sql',body:{sql:'DROP TABLE users'}})",
        );
        assert.equal(invalid.ok, false);
        // Local scripted provider tests the real main-process HTTP path, never a paid service.
        const testKey = 'desktop-smoke-only-key';
        const providerRequests = [];
        const provider = createServer(async (req, res) => {
          try {
            let raw = ''; for await (const chunk of req) raw += String(chunk);
            assert.equal(req.url, '/v1/chat/completions');
            assert.equal(req.headers.authorization, `Bearer ${testKey}`);
            assert.equal(raw.includes(testKey), false);
            const body = JSON.parse(raw); providerRequests.push(body);
            const testing = body.messages[0].content === 'Connection test. Reply OK.';
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: testing ? 'OK' : JSON.stringify({
              steps: [{ title: '核对字段', content: '列出需要导出的内容' }, { title: '生成备份', content: '确认 JSON 可以恢复' }],
            }) } }] }));
          } catch { res.statusCode = 500; res.end('Smoke provider failure'); }
        });
        await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
        try {
          const saved = await ai({ kind: 'save-settings', baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
            model: 'smoke-model', apiKey: testKey, persistKey: false, expectedRevision: aiMetadata.revision });
          assert.equal(saved.storage, 'session'); assert.equal(JSON.stringify(saved).includes(testKey), false);
          await ai({ kind: 'test', requestId: randomUUID(), configRevision: saved.revision });
          const source = await ai({ kind: 'source', actionId: next.id });
          const preview = await ai({ kind: 'generate', requestId: randomUUID(), configRevision: saved.revision,
            actionId: next.id, sourceRevision: source.revision, instruction: '拆成两步' });
          const applied = await ai({ kind: 'apply', previewId: preview.previewId, steps: preview.steps });
          assert.equal(applied.actions.length, 2);
          assert.ok(applied.actions.every(item => item.parentActionId === next.id && item.scheduledDate === '2024-02-29'));
          assert.equal((await request('GET', '/api/current')).currentAction, null);
          const repeated = await ai({ kind: 'apply', previewId: preview.previewId, steps: preview.steps });
          assert.deepEqual(repeated.actions.map(item => item.id), applied.actions.map(item => item.id));
          const undone = await ai({ kind: 'undo', operationId: applied.operationId });
          assert.equal(undone.original.status, 'available'); assert.equal(undone.undone, true);
          assert.equal(providerRequests.length, 2);
          assert.equal(JSON.stringify(await request('GET', '/api/export')).includes(testKey), false);
          await request('POST', '/api/current/select', { actionId: next.id });
          console.log('AI SMOKE PASSED: session Key, real HTTP, preview, idempotent apply, undo and Key-free backup');
        } finally { await new Promise(resolve => provider.close(resolve)); }
        // Exercise the real import IPC without requiring clicks in native dialogs.
        const beforeImport = await request('GET', '/api/export');
        assert.ok(process.env.LK_DATA_DIR, 'smoke must use an isolated workspace');
        const importFile = path.join(process.env.LK_DATA_DIR, 'smoke-import.json');
        writeFileSync(importFile, JSON.stringify(beforeImport));
        const originalOpenDialog = dialog.showOpenDialog;
        const originalMessageBox = dialog.showMessageBox;
        try {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [importFile] });
          dialog.showMessageBox = async () => {
            await request('POST', '/api/captures', { content: '导入确认期间另一窗口的新记录' });
            return { response: 1 };
          };
          const conflicted = await window.webContents.executeJavaScript("window.lifeKernel.desktop('import')");
          assert.equal(conflicted.ok, false);
          assert.equal(conflicted.error.code, 'WORKSPACE_CHANGED');
          const latest = await request('GET', '/api/export');
          assert.equal(latest.data.captures.length, beforeImport.data.captures.length + 1);
          dialog.showMessageBox = async () => ({ response: 0 });
          const canceled = await window.webContents.executeJavaScript("window.lifeKernel.desktop('import')");
          assert.equal(canceled.data.canceled, true);
          assert.deepEqual((await request('GET', '/api/export')).data, latest.data);
          dialog.showMessageBox = async () => ({ response: 1 });
          const restored = await window.webContents.executeJavaScript("window.lifeKernel.desktop('import')");
          assert.equal(restored.ok, true, JSON.stringify(restored));
          assert.equal(restored.data.canceled, false);
          assert.deepEqual((await request('GET', '/api/export')).data, beforeImport.data);
          assert.equal((await ai({ kind: 'settings' })).hasApiKey, true, 'task import must preserve AI settings');
          console.log('IMPORT SMOKE PASSED: stale confirmation conflict, cancellation, backed-up restore and Key isolation');
        } finally {
          dialog.showOpenDialog = originalOpenDialog;
          dialog.showMessageBox = originalMessageBox;
        }
        console.log(
          'DESKTOP SMOKE PASSED: startup, isolated preload, IPC, capture, conversion, focus window, completion and profile',
        );
      }
      clearTimeout(timeout);
      app.quit();
    } catch (error) {
      console.error(error);
      clearTimeout(timeout);
      app.exit(1);
    }
  });
});
require(path.join(root, 'dist-desktop/main.cjs'));
