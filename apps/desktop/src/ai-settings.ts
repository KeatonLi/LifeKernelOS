import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../api/src/types.js';
import { DEFAULT_AI, normalizeAiBaseUrl, type AiCommand, type AiSettings } from '../../../shared/ai.js';

export type SecretStorage = {
  available: () => Promise<boolean>;
  encrypt: (value: string) => Promise<Buffer>;
  decrypt: (value: Buffer) => Promise<string>;
};
const storedSchema = z.object({ version: z.literal(1), revision: z.string().uuid(),
  baseUrl: z.string().max(2000), model: z.string().min(1).max(200),
  encryptedKey: z.string().max(12000).nullable() }).strict();
type Stored = z.infer<typeof storedSchema>;

/** This object is main-process only. Public metadata never returns a secret. */
export class AiSettingsStore {
  private stored: Stored | null = null;
  private sessionKey: string | null = null;
  private warning: string | null = null;
  private loadPromise?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly file: string;
  constructor(folder: string, private readonly secrets: SecretStorage) {
    this.file = join(folder, 'ai-connection.json');
  }
  private async load() {
    this.loadPromise ??= (async () => {
      try {
        const bytes = await readFile(this.file);
        if (bytes.length > 16384) throw new Error('Invalid config');
        const data = storedSchema.parse(JSON.parse(bytes.toString('utf8')));
        data.baseUrl = normalizeAiBaseUrl(data.baseUrl);
        this.stored = data;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          this.warning = 'AI 配置无法读取，请重新输入并保存。';
      }
    })();
    await this.loadPromise;
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async canPersist() {
    try { return await this.secrets.available(); } catch { return false; }
  }
  private async secret(): Promise<string | null> {
    if (this.sessionKey) return this.sessionKey;
    if (!this.stored?.encryptedKey) return null;
    try {
      if (!await this.canPersist()) throw new Error('Unavailable');
      const key = await this.secrets.decrypt(Buffer.from(this.stored.encryptedKey, 'base64'));
      if (!key) throw new Error('Empty key');
      return key;
    } catch {
      this.warning = '已保存的 Key 无法解密，请重新输入；本地任务不受影响。';
      return null;
    }
  }
  private async metadata(): Promise<AiSettings> {
    const key = await this.secret();
    return { baseUrl: this.stored?.baseUrl ?? DEFAULT_AI.baseUrl,
      model: this.stored?.model ?? DEFAULT_AI.model, hasApiKey: Boolean(key),
      storage: this.sessionKey ? 'session' : key ? 'encrypted' : 'none',
      canPersistKey: await this.canPersist(), revision: this.stored?.revision ?? null,
      warning: this.warning };
  }
  get(): Promise<AiSettings> {
    return this.serial(async () => { await this.load(); return this.metadata(); });
  }
  connection(): Promise<{ baseUrl: string; model: string; apiKey: string; revision: string }> {
    return this.serial(async () => {
      await this.load();
      const apiKey = await this.secret();
      if (!apiKey || !this.stored) throw new AppError('AI_NOT_CONFIGURED', '先在设置中添加 API Key。');
      return { baseUrl: this.stored.baseUrl, model: this.stored.model, apiKey, revision: this.stored.revision };
    });
  }
  private async write(data: Stored) {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
      await rename(temporary, this.file);
    } catch {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new AppError('AI_CONFIG_WRITE_FAILED', '配置未保存，请检查目录权限后重试。');
    }
  }
  save(input: Extract<AiCommand, { kind: 'save-settings' }>): Promise<AiSettings> {
    return this.serial(async () => {
      await this.load();
      if (input.expectedRevision !== (this.stored?.revision ?? null))
        throw new AppError('AI_CONFIG_CHANGED', 'AI 配置已在另一个窗口改变，请重新读取。', 409);
      let baseUrl: string;
      try { baseUrl = normalizeAiBaseUrl(input.baseUrl); }
      catch { throw new AppError('AI_INVALID_URL', '请填写 HTTPS 基础地址，不含凭据或查询参数；本机回环可使用 HTTP。'); }
      const fresh = input.apiKey?.trim() || null;
      if (fresh && !/^[\x21-\x7e]+$/.test(fresh))
        throw new AppError('AI_INVALID_KEY', 'API Key 不能包含空格、换行或无效字符。');
      if (this.stored && baseUrl !== this.stored.baseUrl && !fresh)
        throw new AppError('AI_KEY_REQUIRED', '服务地址已改变，请重新输入对应的 API Key。');
      const apiKey = fresh ?? await this.secret();
      if (!apiKey) throw new AppError('AI_KEY_REQUIRED', '请输入 API Key。');
      let encryptedKey: string | null = null;
      if (input.persistKey) {
        if (!await this.canPersist()) throw new AppError('AI_SECURE_STORAGE_UNAVAILABLE', '系统安全存储不可用，请选择仅本次运行。');
        try { encryptedKey = (await this.secrets.encrypt(apiKey)).toString('base64'); }
        catch { throw new AppError('AI_ENCRYPTION_FAILED', '系统未能加密 Key，可选择仅本次运行或稍后重试。'); }
      }
      const next: Stored = { version: 1, revision: randomUUID(), baseUrl, model: input.model, encryptedKey };
      await this.write(next);
      this.stored = next;
      this.sessionKey = input.persistKey ? null : apiKey;
      this.warning = null;
      return this.metadata();
    });
  }
  clear(expectedRevision: string | null): Promise<AiSettings> {
    return this.serial(async () => {
      await this.load();
      if (expectedRevision !== (this.stored?.revision ?? null))
        throw new AppError('AI_CONFIG_CHANGED', 'AI 配置已改变，请重新读取。', 409);
      const next: Stored = { version: 1, revision: randomUUID(),
        baseUrl: this.stored?.baseUrl ?? DEFAULT_AI.baseUrl,
        model: this.stored?.model ?? DEFAULT_AI.model, encryptedKey: null };
      await this.write(next);
      this.stored = next; this.sessionKey = null; this.warning = null;
      return this.metadata();
    });
  }
}
