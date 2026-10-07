import { join } from 'node:path';
import { createDatabase } from '../../api/src/db.js';
import { LifeKernelService } from '../../api/src/services.js';
import { dispatch } from '../../api/src/commands.js';
import { AppError } from '../../api/src/types.js';
import { readBackup, restoreBackup, writeBackup, workspaceRevision } from './restore.js';
import type { Result } from './bridge.js';
import { z } from 'zod';
import { splitApplySchema, splitUndoSchema } from '../../../shared/ai.js';

type ParentPort = {
  on(
    event: 'message',
    listener: (event: {
      data: { id: number; kind: string; payload?: unknown };
    }) => void,
  ): void;
  postMessage(message: unknown): void;
};
const port = (process as typeof process & { parentPort: ParentPort })
  .parentPort;
const [dataFolder, migrationsFolder] = process.argv.slice(2);
let database: ReturnType<typeof createDatabase> | undefined;
try {
  database = createDatabase(
    join(dataFolder, 'lifekernel.sqlite'),
    migrationsFolder,
  );
  const service = new LifeKernelService(database);
  const existing = service.findUserCredential('local@lifekernel.desktop');
  const user =
    existing?.user ??
    service.provisionInitialAccount(
      'local@lifekernel.desktop',
      'LOCAL_ONLY_NO_LOGIN',
    );
  const backupFolder = join(dataFolder, 'backups');
  let backupWarning: string | null = null;
  try {
    writeBackup(backupFolder, service.exportData(user.id));
  } catch {
    backupWarning = '自动备份未成功，请检查数据目录的可用空间。';
  }
  port.postMessage({ ready: true, backupWarning });
  port.on('message', ({ data: message }) => {
    try {
      let result: unknown;
      switch (message.kind) {
        case 'request':
          result = dispatch(service, user, message.payload);
          break;
        case 'ai-source':
          result = service.getSplitSource(user.id, z.object({ actionId: z.string().uuid() }).strict().parse(message.payload).actionId);
          break;
        case 'ai-apply':
          result = service.applyAiSplit(user.id, splitApplySchema.parse(message.payload));
          break;
        case 'ai-undo':
          result = service.undoAiSplit(user.id, splitUndoSchema.parse(message.payload).operationId);
          break;
        case 'export':
          result = service.exportData(user.id);
          break;
        case 'validate-import': {
          const payload = readBackup(String(message.payload));
          result = {
            payload,
            workspaceRevision: workspaceRevision(service.exportData(user.id)),
            counts: {
              goals: payload.data.goals.length,
              actions: payload.data.actions.length,
              captures: payload.data.captures.length,
            },
          };
          break;
        }
        case 'import': {
          const input = z.object({
            payload: z.unknown(),
            expectedWorkspaceRevision: z.string().regex(/^[a-f0-9]{64}$/),
          }).strict().parse(message.payload);
          result = restoreBackup(
            database!,
            service,
            user.id,
            input.payload,
            backupFolder,
            input.expectedWorkspaceRevision,
          );
          break;
        }
        case 'shutdown':
          database!.close();
          result = true;
          break;
        default:
          throw new AppError('COMMAND_NOT_ALLOWED', '此操作不可用。');
      }
      port.postMessage({
        id: message.id,
        result: { ok: true, data: result } satisfies Result,
      });
    } catch (error) {
      const detail =
        error instanceof AppError
          ? { code: error.code, message: error.message, fields: error.fields }
          : { code: 'INTERNAL_ERROR', message: '本地数据操作未成功，请重试。' };
      console.error(
        error instanceof Error ? error.message : 'Local operation failed',
      );
      port.postMessage({
        id: message.id,
        result: { ok: false, error: detail } satisfies Result,
      });
    }
  });
} catch (error) {
  database?.close();
  port.postMessage({
    fatal: error instanceof Error ? error.message : '无法打开本地数据库。',
  });
}
