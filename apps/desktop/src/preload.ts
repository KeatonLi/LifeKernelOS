import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from './bridge.js';
const bridge: DesktopBridge = {
  request: (request) => ipcRenderer.invoke('lk:request', request),
  desktop: (command) => ipcRenderer.invoke('lk:desktop', command),
  ai: (command) => ipcRenderer.invoke('lk:ai', command),
  onChange: (listener) => {
    const callback = () => listener();
    ipcRenderer.on('lk:changed', callback);
    return () => ipcRenderer.removeListener('lk:changed', callback);
  },
  platform: process.platform,
};
contextBridge.exposeInMainWorld('lifeKernel', bridge);
