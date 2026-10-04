import { z } from 'zod';
import type { Action, Goal } from '../apps/api/src/types.js';

export const DEFAULT_AI = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' };
export type AiSettings = {
  baseUrl: string; model: string; hasApiKey: boolean;
  storage: 'none' | 'encrypted' | 'session'; canPersistKey: boolean;
  revision: string | null; warning: string | null;
};
export const splitStepSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().max(2000).nullable().optional(),
}).strict();
export const splitStepsSchema = z.array(splitStepSchema).min(1).max(6);
export type SplitStep = z.infer<typeof splitStepSchema>;
export type SplitSource = { action: Action; goal: Goal; revision: string };
export type SplitResult = { operationId: string; original: Action; actions: Action[]; undone: boolean };
export type AiPreview = { previewId: string; steps: SplitStep[]; model: string };
const uuid = z.string().uuid();
const revision = z.string().regex(/^[a-f0-9]{64}$/);
export const aiCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('settings') }).strict(),
  z.object({ kind: z.literal('save-settings'), baseUrl: z.string().trim().min(1).max(2000),
    model: z.string().trim().min(1).max(200), apiKey: z.string().max(4096).optional(),
    persistKey: z.boolean(), expectedRevision: uuid.nullable() }).strict(),
  z.object({ kind: z.literal('clear-key'), expectedRevision: uuid.nullable() }).strict(),
  z.object({ kind: z.literal('test'), requestId: uuid, configRevision: uuid }).strict(),
  z.object({ kind: z.literal('source'), actionId: uuid }).strict(),
  z.object({ kind: z.literal('generate'), requestId: uuid, actionId: uuid,
    sourceRevision: revision, configRevision: uuid, instruction: z.string().trim().max(1000) }).strict(),
  z.object({ kind: z.literal('cancel'), requestId: uuid }).strict(),
  z.object({ kind: z.literal('apply'), previewId: uuid, steps: splitStepsSchema }).strict(),
  z.object({ kind: z.literal('undo'), operationId: uuid }).strict(),
]);
export type AiCommand = z.infer<typeof aiCommandSchema>;
export const splitApplySchema = z.object({ operationId: uuid, actionId: uuid,
  sourceRevision: revision, steps: splitStepsSchema }).strict();
export type SplitApply = z.infer<typeof splitApplySchema>;
export const splitUndoSchema = z.object({ operationId: uuid }).strict();

export function normalizeAiBaseUrl(input: string): string {
  const url = new URL(input);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.search || url.hash) throw new Error('Invalid AI URL');
  if (url.pathname.replace(/\/+$/, '').endsWith('/chat/completions')) throw new Error('Use the base URL');
  return url.href.replace(/\/+$/, '');
}
