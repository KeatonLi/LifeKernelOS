// Runs the real main/preload/utility process against an isolated test workspace.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
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
      const { user } = await request('GET', '/api/auth/me');
      assert.equal(user.email, 'local@lifekernel.desktop');
      let { goals } = await request('GET', '/api/goals');
      if (process.env.LK_SMOKE_REOPEN === '1') {
        assert.equal(goals.length, 1);
        assert.equal(goals[0].progress.completedTodoCount, 1);
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
        const workspace = await request('GET', '/api/current');
        assert.equal(workspace.currentAction, null);
        const { profile } = await request('GET', '/api/profile');
        assert.equal(profile.factSummary.completedActionCount, 1);
        const exportData = await request('GET', '/api/export');
        assert.equal(exportData.data.captures[0].status, 'converted');
        const invalid = await window.webContents.executeJavaScript(
          "window.lifeKernel.request({method:'POST',path:'/api/sql',body:{sql:'DROP TABLE users'}})",
        );
        assert.equal(invalid.ok, false);
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
