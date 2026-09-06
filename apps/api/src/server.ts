import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { createSessionToken, hashPassword, hashToken, verifyPassword } from './auth.js';
import { createDatabase, type DatabaseContext } from './db.js';
import { LifeKernelService } from './services.js';
import { AppError, type KnowledgeStatus, type User } from './types.js';

const sessionCookieName = 'lk_session';
const sessionTtlDays = Number(process.env.SESSION_TTL_DAYS ?? '30');
const cookieSecure = process.env.COOKIE_SECURE === 'true';

const textSchema = (maxLength: number) => z.string().max(maxLength);
const knowledgeStatusSchema = z.enum(['in_progress', 'needs_consolidation', 'consolidated']);
const goalStatusSchema = z.enum(['active', 'paused', 'completed', 'abandoned']);
const actionStatusSchema = z.enum(['available', 'completed', 'blocked', 'abandoned', 'superseded']);
const energySchema = z.enum(['low', 'medium', 'high']);
const availableMinutesSchema = z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)]);

function parseBody<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]?.toString() ?? 'form';
    throw new AppError('VALIDATION_ERROR', '请检查输入', 400, { [field]: parsed.error.issues[0]?.message ?? '输入不合法' });
  }
  return parsed.data;
}

function sessionExpiresAt(): string {
  return new Date(Date.now() + sessionTtlDays * 24 * 60 * 60 * 1000).toISOString();
}

function cookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'lax' as const,
    maxAge: sessionTtlDays * 24 * 60 * 60
  };
}

function assertSafeOrigin(request: FastifyRequest): void {
  const origin = request.headers.origin;
  if (!origin) return;
  const allowed = new Set(['http://127.0.0.1:4173', 'http://localhost:4173']);
  const configuredOrigin = process.env.WEB_ORIGIN;
  if (configuredOrigin) allowed.add(configuredOrigin);
  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(',')[0]?.trim() || request.protocol;
  if (request.headers.host) allowed.add(`${protocol}://${request.headers.host}`);
  if (!allowed.has(origin)) throw new AppError('FORBIDDEN_ORIGIN', '请求来源不被允许', 403);
}

export function buildApp(context?: DatabaseContext) {
  const database = context ?? createDatabase(process.env.DATABASE_PATH ?? resolve(process.cwd(), 'data/lifekernel.sqlite'));
  const service = new LifeKernelService(database);
  const app = Fastify({ logger: process.env.NODE_ENV === 'production' });

  app.register(cookie);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message, fields: error.fields } });
    }
    app.log.error(error);
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用' } });
  });

  async function requireUser(request: FastifyRequest): Promise<User> {
    const token = request.cookies[sessionCookieName];
    if (!token) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
    const user = service.getSessionUser(hashToken(token));
    if (!user) {
      throw new AppError('UNAUTHENTICATED', '登录已失效，请重新登录', 401);
    }
    return user;
  }

  app.post('/api/auth/login', async (request, reply) => {
    assertSafeOrigin(request);
    const input = parseBody(z.object({ email: textSchema(254).email(), password: textSchema(256).min(1) }), request.body);
    const credential = service.findUserCredential(input.email);
    if (!credential || !(await verifyPassword(input.password, credential.passwordHash))) {
      throw new AppError('INVALID_CREDENTIALS', '邮箱或密码错误', 401);
    }
    const token = createSessionToken();
    service.createSession(credential.user.id, hashToken(token), sessionExpiresAt());
    reply.setCookie(sessionCookieName, token, cookieOptions());
    return { user: credential.user };
  });

  app.get('/api/auth/me', async (request) => ({ user: await requireUser(request) }));

  app.post('/api/auth/logout', async (request, reply) => {
    assertSafeOrigin(request);
    const token = request.cookies[sessionCookieName];
    if (token) service.deleteSession(hashToken(token));
    reply.clearCookie(sessionCookieName, cookieOptions());
    return { success: true };
  });

  // Legacy Focus routes are read/write compatibility only; current clients use /api/goals.
  app.get('/api/focuses/active', async (request) => {
    const user = await requireUser(request);
    return { focus: service.getLegacyActiveFocus(user.id) };
  });

  app.post('/api/focuses', async (request, reply) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const input = parseBody(z.object({ title: textSchema(100) }), request.body);
    return reply.status(201).send({ focus: service.createLegacyFocus(user.id, input.title) });
  });

  app.patch('/api/focuses/:id/progress', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const input = parseBody(z.object({ progressPercent: z.number().int().min(0).max(100) }), request.body);
    return { focus: service.updateLegacyFocusProgress(user.id, params.id, input.progressPercent) };
  });

  app.get('/api/actions', async (request) => {
    const user = await requireUser(request);
    const query = parseBody(z.object({ focusId: z.string().uuid(), status: z.enum(['available', 'completed']).optional() }), request.query);
    return { actions: service.listActions(user.id, query.focusId, query.status) };
  });

  app.post('/api/actions', async (request, reply) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const input = parseBody(z.object({ focusId: z.string().uuid(), title: textSchema(200) }), request.body);
    return reply.status(201).send({ action: service.createAction(user.id, input.focusId, input.title) });
  });

  app.post('/api/actions/:id/complete', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    return { action: service.completeAction(user.id, params.id) };
  });

  app.get('/api/goals', async (request) => {
    const user = await requireUser(request);
    const query = parseBody(z.object({ status: goalStatusSchema.optional() }), request.query);
    return { goals: service.listGoals(user.id, query.status) };
  });

  app.post('/api/goals', async (request, reply) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const input = parseBody(z.object({ title: textSchema(100), doneDefinition: textSchema(300).nullable().optional() }), request.body);
    return reply.status(201).send({ goal: service.createGoal(user.id, input) });
  });

  app.patch('/api/goals/:id', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const input = parseBody(z.object({ title: textSchema(100).optional(), doneDefinition: textSchema(300).nullable().optional() }).refine((value) => value.title !== undefined || value.doneDefinition !== undefined, '至少更新一项内容'), request.body);
    return { goal: service.updateGoal(user.id, params.id, input) };
  });

  app.post('/api/goals/:id/status', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const input = parseBody(z.object({ status: goalStatusSchema, confirmed: z.boolean().optional() }), request.body);
    return { goal: service.changeGoalStatus(user.id, params.id, input.status, input.confirmed === true) };
  });

  app.get('/api/goals/:id/actions', async (request) => {
    const user = await requireUser(request);
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const query = parseBody(z.object({ status: actionStatusSchema.optional() }), request.query);
    return { actions: service.listGoalActions(user.id, params.id, query.status) };
  });

  app.post('/api/goals/:id/actions', async (request, reply) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const input = parseBody(z.object({ title: textSchema(200), content: textSchema(1000).nullable().optional(), estimatedMinutes: availableMinutesSchema.nullable().optional(), energyRequired: energySchema.nullable().optional() }), request.body);
    return reply.status(201).send({ action: service.createGoalAction(user.id, params.id, input) });
  });

  app.patch('/api/actions/:id', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const input = parseBody(z.object({ title: textSchema(200).optional(), content: textSchema(1000).nullable().optional(), estimatedMinutes: availableMinutesSchema.nullable().optional(), energyRequired: energySchema.nullable().optional() }).refine((value) => value.title !== undefined || value.content !== undefined || value.estimatedMinutes !== undefined || value.energyRequired !== undefined, '至少更新一项内容'), request.body);
    return { action: service.updateActionMetadata(user.id, params.id, input) };
  });

  app.get('/api/current', async (request) => {
    const user = await requireUser(request);
    return service.getCurrentWorkspace(user.id);
  });

  app.put('/api/current/context', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const input = parseBody(z.object({ availableMinutes: availableMinutesSchema.nullable().optional(), energy: energySchema.nullable().optional() }).refine((value) => value.availableMinutes !== undefined || value.energy !== undefined, '至少记录一项当前状态'), request.body);
    return { context: service.recordCurrentContext(user.id, input) };
  });

  app.post('/api/current/select', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const input = parseBody(z.object({ actionId: z.string().uuid() }), request.body);
    return { context: service.selectCurrentAction(user.id, input.actionId) };
  });

  app.delete('/api/current/select', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    return { context: service.clearCurrentAction(user.id) };
  });

  app.post('/api/current/complete', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const input = parseBody(z.object({ outcomeNote: textSchema(500).nullable().optional() }), request.body ?? {});
    return { action: service.completeCurrentAction(user.id, input.outcomeNote) };
  });

  app.post('/api/current/split', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const input = parseBody(z.object({ title: textSchema(200), content: textSchema(1000).nullable().optional(), estimatedMinutes: availableMinutesSchema.nullable().optional(), energyRequired: energySchema.nullable().optional() }), request.body);
    return service.splitCurrentAction(user.id, input);
  });

  app.post('/api/current/block', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const input = parseBody(z.object({ blockerNote: textSchema(500).nullable().optional() }), request.body ?? {});
    return { action: service.blockCurrentAction(user.id, input.blockerNote) };
  });

  app.post('/api/current/abandon', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const input = parseBody(z.object({ outcomeNote: textSchema(500).nullable().optional() }), request.body ?? {});
    return { action: service.abandonCurrentAction(user.id, input.outcomeNote) };
  });

  app.get('/api/export', async (request, reply) => {
    const user = await requireUser(request);
    const payload = service.exportData(user.id);
    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="lifekernel-export.json"')
      .send(payload);
  });

  app.get('/api/profile', async (request) => {
    const user = await requireUser(request);
    return { profile: service.getProfileView(user.id) };
  });

  app.put('/api/profile/description', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const input = parseBody(z.object({ content: textSchema(500) }), request.body);
    return { description: service.upsertProfileDescription(user.id, input.content) };
  });

  app.delete('/api/profile/description', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    service.deleteProfileDescription(user.id);
    return { success: true };
  });

  app.put('/api/goals/:id/reflection', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const input = parseBody(z.object({ summary: textSchema(500) }), request.body);
    return { reflection: service.upsertGoalReflection(user.id, params.id, input.summary) };
  });

  app.delete('/api/goals/:id/reflection', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    service.deleteGoalReflection(user.id, params.id);
    return { success: true };
  });

  app.post('/api/knowledge', async (request, reply) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const input = parseBody(z.object({ goalId: z.string().uuid(), title: textSchema(80), note: textSchema(300).optional() }), request.body);
    return reply.status(201).send({ knowledge: service.createKnowledgeItem(user.id, input) });
  });

  app.patch('/api/knowledge/:id', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const input = parseBody(
      z.object({ title: textSchema(80).optional(), note: textSchema(300).optional(), status: knowledgeStatusSchema.optional() }).refine(
        (value) => value.title !== undefined || value.note !== undefined || value.status !== undefined,
        '至少更新一项内容'
      ),
      request.body
    );
    return { knowledge: service.updateKnowledgeItem(user.id, params.id, input as { title?: string; note?: string; status?: KnowledgeStatus }) };
  });

  app.delete('/api/knowledge/:id', async (request) => {
    assertSafeOrigin(request);
    const user = await requireUser(request);
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    service.deleteKnowledgeItem(user.id, params.id);
    return { success: true };
  });

  const webDistPath = resolve(process.cwd(), 'dist');
  if (existsSync(webDistPath)) {
    app.register(fastifyStatic, { root: webDistPath, wildcard: false });
    app.get('/*', async (_request, reply) => reply.sendFile('index.html'));
  }

  app.addHook('onClose', async () => {
    if (!context) database.close();
  });

  return { app, service, database };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app } = buildApp();
  const port = Number(process.env.PORT ?? '3000');
  app.listen({ port, host: '127.0.0.1' }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
