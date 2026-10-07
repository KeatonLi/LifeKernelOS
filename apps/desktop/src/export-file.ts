import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';

/** Stage beside the destination so rename never crosses a filesystem boundary. */
export async function writeJsonExport(destination: string, payload: unknown): Promise<void> {
  const content = JSON.stringify(payload, null, 2);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  // Only clean up after exclusive creation has established ownership.
  const staged = await open(temporary, 'wx', 0o600);
  try {
    try {
      await staged.writeFile(content);
    } finally {
      await staged.close();
    }
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
