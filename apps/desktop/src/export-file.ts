import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const writers = new Map<string, Promise<void>>();

async function replaceFile(temporary: string, destination: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temporary, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== 'win32' || attempt >= 3 ||
          !['EACCES', 'EPERM', 'EBUSY'].includes(code ?? '')) throw error;
      // A scanner or another Windows handle can briefly deny file replacement.
      await delay(50 * 2 ** attempt);
    }
  }
}

/** Stage beside the destination so rename never crosses a filesystem boundary. */
async function writeSnapshot(destination: string, content: string): Promise<void> {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  // Only clean up after exclusive creation has established ownership.
  const staged = await open(temporary, 'wx', 0o600);
  try {
    try {
      await staged.writeFile(content);
    } finally {
      await staged.close();
    }
    await replaceFile(temporary, destination);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function writeJsonExport(destination: string, payload: unknown): Promise<void> {
  const content = JSON.stringify(payload, null, 2);
  const path = resolve(destination);
  const key = process.platform === 'win32' ? path.toLowerCase() : path;
  const previous = writers.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(() => writeSnapshot(path, content));
  writers.set(key, pending);
  try {
    await pending;
  } finally {
    if (writers.get(key) === pending) writers.delete(key);
  }
}
