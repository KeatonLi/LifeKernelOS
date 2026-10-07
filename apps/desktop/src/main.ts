import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  protocol,
  session,
  safeStorage,
  net,
  utilityProcess,
  type IpcMainInvokeEvent,
  type UtilityProcess,
} from 'electron';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';
import { requestSchema, type BusinessRequest } from '../../api/src/commands.js';
import type { ExportPayload } from '../../api/src/types.js';
import type { DesktopCommand, Result } from './bridge.js';
import { AiSettingsStore } from './ai-settings.js';
import { AiController } from './ai.js';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
if (process.env.LK_DATA_DIR)
  app.setPath('userData', resolve(process.env.LK_DATA_DIR));
const devUrl = !app.isPackaged ? process.env.LK_DEV_URL : undefined;
if (devUrl && !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(devUrl))
  throw new Error('开发预览只能来自本机。');
const origin = devUrl ? new URL(devUrl).origin : 'app://lifekernel';
const windows = new Map<'main' | 'capture' | 'focus', BrowserWindow>();
const pending = new Map<
  number,
  { resolve: (value: Result) => void; timer: ReturnType<typeof setTimeout> }
>();
let worker: UtilityProcess;
let sequence = 0;
let quitting = false;
let shuttingDown = false;
let backupWarning: string | null = null;
let mainBounds = { width: 1360, height: 900 };
const dataFolder = app.getPath('userData');
const appRoot = app.getAppPath();
const aiSettings = new AiSettingsStore(dataFolder, {
  available: async () => {
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
    return safeStorage.isAsyncEncryptionAvailable();
  },
  encrypt: value => safeStorage.encryptStringAsync(value),
  decrypt: async value => (await safeStorage.decryptStringAsync(value)).result,
});
const ai = new AiController(aiSettings, {
  rpc, changed: broadcast,
  fetch: (input, init) => net.fetch(input instanceof URL ? input.href : input, init),
});
const fail = (message: string, code = 'LOCAL_UNAVAILABLE'): Result => ({
  ok: false,
  error: { code, message },
});

function rpc(kind: string, payload?: unknown): Promise<Result> {
  return new Promise((resolveResult) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolveResult(fail('本地操作超时，请重新打开客户端。'));
    }, 20000);
    pending.set(id, { resolve: resolveResult, timer });
    try {
      worker.postMessage({ id, kind, payload });
    } catch {
      clearTimeout(timer);
      pending.delete(id);
      resolveResult(fail('本地数据进程未连接，请重新打开客户端。'));
    }
  });
}
function broadcast() {
  for (const window of windows.values())
    if (!window.isDestroyed()) window.webContents.send('lk:changed');
}
function trusted(event: IpcMainInvokeEvent) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (
    !window ||
    ![...windows.values()].includes(window) ||
    event.senderFrame !== event.sender.mainFrame
  )
    return false;
  const url = event.senderFrame?.url ?? '';
  return devUrl
    ? url.startsWith(`${origin}/`)
    : url.startsWith('app://lifekernel/');
}
function openWindow(kind: 'main' | 'capture' | 'focus') {
  const existing = windows.get(kind);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }
  const auxiliary = kind !== 'main';
  const window = new BrowserWindow({
    title:
      kind === 'main'
        ? 'LifeKernelOS'
        : kind === 'capture'
          ? '快速记下 · LifeKernelOS'
          : '此刻行动 · LifeKernelOS',
    width: kind === 'capture' ? 560 : kind === 'focus' ? 480 : mainBounds.width,
    height:
      kind === 'capture' ? 680 : kind === 'focus' ? 580 : mainBounds.height,
    minWidth: auxiliary ? 400 : 900,
    minHeight: auxiliary ? 460 : 640,
    backgroundColor: '#f3f4f5',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: join(appRoot, 'public/brand/lifekernel-icon.png'),
    webPreferences: {
      preload: join(appRoot, 'dist-desktop/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
    },
  });
  windows.set(kind, window);
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${origin}/`)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) =>
    event.preventDefault(),
  );
  window.webContents.on('did-fail-load', (_event, code, description) => {
    if (code !== -3)
      void dialog.showMessageBox(window, {
        type: 'error',
        title: '工作区未能打开',
        message: '请重新打开客户端。你的本地记录仍保存在数据目录中。',
        detail: description,
      });
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (auxiliary && input.key === 'Escape') {
      event.preventDefault();
      window.close();
    }
  });
  window.on('close', () => {
    if (kind === 'main') {
      const { width, height } = window.getBounds();
      mainBounds = { width, height };
      try {
        writeFileSync(
          join(dataFolder, 'window.json'),
          JSON.stringify(mainBounds),
          { mode: 0o600 },
        );
      } catch {
        /* Size preference must not prevent closing. */
      }
      for (const [key, other] of windows) if (key !== 'main') other.close();
    }
  });
  const ownerId = window.webContents.id;
  window.on('closed', () => { ai.cancelOwner(ownerId); windows.delete(kind); });
  const route = kind === 'main' ? '/expectations' : `/${kind}`;
  void window.loadURL(`${devUrl ?? 'app://lifekernel/index.html'}#${route}`);
  return window;
}
async function startWorker() {
  worker = utilityProcess.fork(
    join(appRoot, 'dist-desktop/worker.cjs'),
    [dataFolder, join(appRoot, 'db/migrations')],
    { stdio: 'pipe', serviceName: 'LifeKernel local data' },
  );
  worker.stderr?.on('data', (chunk) => console.error(String(chunk)));
  return new Promise<void>((resolveReady, reject) => {
    let ready = false;
    const timer = setTimeout(
      () => reject(new Error('本地数据启动超时。')),
      20000,
    );
    worker.on(
      'message',
      (message: {
        ready?: boolean;
        fatal?: string;
        backupWarning?: string;
        id?: number;
        result?: Result;
      }) => {
        if (message.ready) {
          ready = true;
          backupWarning = message.backupWarning ?? null;
          clearTimeout(timer);
          resolveReady();
        }
        if (message.fatal) {
          clearTimeout(timer);
          reject(new Error(message.fatal));
        }
        if (message.id && message.result) {
          const request = pending.get(message.id);
          if (request) {
            clearTimeout(request.timer);
            pending.delete(message.id);
            request.resolve(message.result);
          }
        }
      },
    );
    worker.on('exit', () => {
      clearTimeout(timer);
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.resolve(fail('本地数据进程已退出，请重新打开客户端。'));
      }
      pending.clear();
      if (!ready) reject(new Error('无法启动本地数据进程。'));
      else if (!quitting)
        void dialog.showMessageBox({
          type: 'error',
          message: '本地数据进程已退出，请重新打开客户端。',
          detail: '已提交的记录保存在本机。',
        });
    });
  });
}
async function desktopCommand(
  event: IpcMainInvokeEvent,
  command: DesktopCommand,
): Promise<Result> {
  if (!trusted(event)) return fail('请求来源不可用。', 'UNTRUSTED_SENDER');
  const owner = BrowserWindow.fromWebContents(event.sender)!;
  if (['main', 'capture', 'focus'].includes(command)) {
    openWindow(command as 'main' | 'capture' | 'focus');
    return { ok: true, data: null };
  }
  if (command === 'close') {
    owner.close();
    return { ok: true, data: null };
  }
  if (command === 'pin') {
    owner.setAlwaysOnTop(!owner.isAlwaysOnTop());
    return { ok: true, data: owner.isAlwaysOnTop() };
  }
  if (command === 'info')
    return {
      ok: true,
      data: {
        version: app.getVersion(),
        dataFolder,
        backupFolder: join(dataFolder, 'backups'),
        backupWarning,
        captureShortcut: globalShortcut.isRegistered(
          'CommandOrControl+Shift+Space',
        ),
      },
    };
  if (command === 'data-folder' || command === 'backup-folder') {
    const { shell } = await import('electron');
    const error = await shell.openPath(
      command === 'data-folder' ? dataFolder : join(dataFolder, 'backups'),
    );
    return error ? fail('无法打开目录。') : { ok: true, data: null };
  }
  if (command === 'export') {
    const destination = await dialog.showSaveDialog(owner, {
      title: '保存全部记录',
      defaultPath: `lifekernel-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'LifeKernel JSON', extensions: ['json'] }],
    });
    if (destination.canceled || !destination.filePath)
      return { ok: true, data: { canceled: true } };
    const result = await rpc('export');
    if (!result.ok) return result;
    const temporary = `${destination.filePath}.tmp`;
    await writeFile(temporary, JSON.stringify(result.data, null, 2), {
      mode: 0o600,
    });
    await rename(temporary, destination.filePath);
    return { ok: true, data: { canceled: false } };
  }
  if (command === 'import') {
    const source = await dialog.showOpenDialog(owner, {
      title: '导入 LifeKernel 备份',
      properties: ['openFile'],
      filters: [{ name: 'LifeKernel JSON', extensions: ['json'] }],
    });
    if (source.canceled || !source.filePaths[0])
      return { ok: true, data: { canceled: true } };
    const validation = await rpc('validate-import', source.filePaths[0]);
    if (!validation.ok) return validation;
    const { payload, counts, workspaceRevision } = validation.data as {
      payload: ExportPayload;
      counts: { goals: number; actions: number; captures: number };
      workspaceRevision: string;
    };
    const confirmation = await dialog.showMessageBox(owner, {
      type: 'warning',
      title: '恢复这份备份？',
      message: `导入 ${counts.goals} 条主线、${counts.actions} 项行动、${counts.captures} 条收集记录`,
      detail:
        '将替换当前工作区。继续前会自动备份现有全部记录，可从备份目录恢复。',
      buttons: ['取消', '备份并导入'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmation.response !== 1)
      return { ok: true, data: { canceled: true } };
    ai.invalidate();
    const result = await rpc('import', { payload, expectedWorkspaceRevision: workspaceRevision });
    if (result.ok) {
      broadcast();
      return { ok: true, data: { canceled: false, counts } };
    }
    return result;
  }
  return fail('此桌面操作不可用。', 'COMMAND_NOT_ALLOWED');
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (app.isReady()) openWindow('main');
  });
  app
    .whenReady()
    .then(async () => {
      await mkdir(dataFolder, { recursive: true });
      try {
        const value = JSON.parse(
          await readFile(join(dataFolder, 'window.json'), 'utf8'),
        );
        if (Number.isFinite(value.width) && Number.isFinite(value.height))
          mainBounds = {
            width: Math.max(900, Math.min(value.width, 2000)),
            height: Math.max(640, Math.min(value.height, 1400)),
          };
      } catch {
        /* first launch */
      }
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      if (!devUrl) {
        const root = resolve(appRoot, 'dist');
        const mime: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.woff2': 'font/woff2',
        };
        protocol.handle('app', async (request) => {
          const url = new URL(request.url);
          const file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
          if (url.host !== 'lifekernel' || !file.startsWith(`${root}${sep}`))
            return new Response(null, { status: 403 });
          try {
            return new Response(await readFile(file), {
              headers: {
                'Content-Type':
                  mime[extname(file)] ?? 'application/octet-stream',
                'Content-Security-Policy':
                  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'",
              },
            });
          } catch {
            return new Response(null, { status: 404 });
          }
        });
      }
      await startWorker();
      ipcMain.handle('lk:ai', async (event, raw): Promise<Result> => {
        if (!trusted(event)) return fail('请求来源不可用。', 'UNTRUSTED_SENDER');
        return ai.invoke(event.sender.id, raw);
      });
      ipcMain.handle('lk:request', async (event, raw): Promise<Result> => {
        if (!trusted(event))
          return fail('请求来源不可用。', 'UNTRUSTED_SENDER');
        const parsed = requestSchema.safeParse(raw);
        if (!parsed.success || JSON.stringify(raw).length > 65536)
          return fail('输入格式不正确。', 'VALIDATION_ERROR');
        const result = await rpc('request', parsed.data as BusinessRequest);
        if (result.ok && parsed.data.method !== 'GET') broadcast();
        return result;
      });
      ipcMain.handle('lk:desktop', async (event, command) => {
        try {
          return await desktopCommand(event, command);
        } catch {
          return fail('文件操作没有成功，请检查目录权限或可用空间。');
        }
      });
      const capture = () => openWindow('capture');
      globalShortcut.register('CommandOrControl+Shift+Space', capture);
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === 'darwin'
            ? [
                {
                  label: 'LifeKernelOS',
                  submenu: [
                    { role: 'about' as const },
                    { type: 'separator' as const },
                    { role: 'quit' as const },
                  ],
                },
              ]
            : []),
          {
            label: '文件',
            submenu: [
              {
                label: '快速记下',
                accelerator: 'CommandOrControl+K',
                click: capture,
              },
              { label: '专注当前行动', click: () => openWindow('focus') },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
          {
            label: '编辑',
            submenu: [
              { role: 'undo' },
              { role: 'redo' },
              { type: 'separator' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { role: 'selectAll' },
            ],
          },
          {
            label: '视图',
            submenu: [
              { role: 'resetZoom' },
              { role: 'zoomIn' },
              { role: 'zoomOut' },
              { role: 'togglefullscreen' },
            ],
          },
        ]),
      );
      openWindow('main');
      app.on('activate', () => openWindow('main'));
    })
    .catch(async (error) => {
      await dialog.showMessageBox({
        type: 'error',
        title: '无法打开 LifeKernelOS',
        message: '本地工作区启动失败。',
        detail: error instanceof Error ? error.message : '请重新打开客户端。',
      });
      app.quit();
    });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    quitting = true;
    ai.invalidate();
    globalShortcut.unregisterAll();
    void rpc('shutdown').finally(() => {
      shuttingDown = true;
      worker?.kill();
      app.quit();
    });
  });
}
