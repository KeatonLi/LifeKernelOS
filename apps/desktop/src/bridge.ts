import type { BusinessRequest } from '../../api/src/commands.js';
import type { AiCommand } from '../../../shared/ai.js';
export type Result<T = unknown> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: string; message: string; fields?: Record<string, string> };
    };
export type DesktopCommand =
  | 'capture'
  | 'focus'
  | 'main'
  | 'close'
  | 'pin'
  | 'export'
  | 'import'
  | 'data-folder'
  | 'backup-folder'
  | 'info';
export type DesktopBridge = {
  request: (request: BusinessRequest) => Promise<Result>;
  desktop: (command: DesktopCommand) => Promise<Result>;
  ai: (command: AiCommand) => Promise<Result>;
  onChange: (listener: () => void) => () => void;
  platform: string;
};
declare global {
  interface Window {
    lifeKernel?: DesktopBridge;
  }
}
