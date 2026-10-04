import { z } from 'zod';
import { LifeKernelService } from './services.js';
import { AppError, type User } from './types.js';

export const requestSchema = z
  .object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z.string().max(250).startsWith('/api/'),
    body: z
      .record(
        z.union([
          z.string().max(6000),
          z.number().finite(),
          z.boolean(),
          z.null(),
        ]),
      )
      .refine((value) => Object.keys(value).length <= 16)
      .optional(),
  })
  .strict();
export type BusinessRequest = z.infer<typeof requestSchema>;
const text = (max: number) => z.string().max(max);
const minutes = z.union([
  z.literal(5),
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);
const energy = z.enum(['low', 'medium', 'high']);
const goalStatus = z.enum(['active', 'paused', 'completed', 'abandoned']);
const captureType = z.enum(['idea', 'task', 'event', 'feeling', 'inspiration']);
const actionInput = z
  .object({
    title: text(200),
    content: text(2000).nullable().optional(),
    estimatedMinutes: minutes.nullable().optional(),
    energyRequired: energy.nullable().optional(),
  })
  .strict();
const expected = z.object({ expectedActionId: z.string().uuid() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError('VALIDATION_ERROR', '请检查输入。', 400, {
      [String(issue?.path[0] ?? 'form')]: issue?.message ?? '输入不合法',
    });
  }
  return result.data;
}

/** Explicit IPC use-case allowlist; user identity is supplied by the trusted worker. */
export function dispatch(
  service: LifeKernelService,
  user: User,
  raw: unknown,
): unknown {
  const request = parse(requestSchema, raw);
  const url = new URL(request.path, 'https://local.invalid');
  const path = url.pathname;
  const method = request.method;
  const body = request.body ?? {};
  const id = user.id;
  if (method === 'GET' && path === '/api/auth/me') return { user };
  if (method === 'GET' && path === '/api/goals') {
    const status = url.searchParams.get('status');
    return {
      goals: service.listGoals(
        id,
        status ? parse(goalStatus, status) : undefined,
      ),
    };
  }
  if (method === 'POST' && path === '/api/goals')
    return {
      goal: service.createGoal(
        id,
        parse(
          z
            .object({
              title: text(100),
              doneDefinition: text(300).nullable().optional(),
            })
            .strict(),
          body,
        ),
      ),
    };
  const match = path.match(
    /^\/api\/(goals|actions|captures|knowledge)\/([\w-]+)(?:\/(actions|status|reflection|resume|convert|archive))?$/,
  );
  if (match) {
    const [, kind, resourceId, operation] = match;
    parse(z.string().uuid(), resourceId);
    if (kind === 'goals') {
      if (operation === 'actions' && method === 'GET')
        return { actions: service.listGoalActions(id, resourceId) };
      if (operation === 'actions' && method === 'POST')
        return {
          action: service.createGoalAction(
            id,
            resourceId,
            parse(actionInput, body),
          ),
        };
      if (!operation && method === 'PATCH')
        return {
          goal: service.updateGoal(
            id,
            resourceId,
            parse(
              z
                .object({
                  title: text(100).optional(),
                  doneDefinition: text(300).nullable().optional(),
                })
                .strict(),
              body,
            ),
          ),
        };
      if (operation === 'status' && method === 'POST') {
        const input = parse(
          z
            .object({ status: goalStatus, confirmed: z.boolean().optional() })
            .strict(),
          body,
        );
        return {
          goal: service.changeGoalStatus(
            id,
            resourceId,
            input.status,
            input.confirmed,
          ),
        };
      }
      if (operation === 'reflection' && method === 'PUT')
        return {
          reflection: service.upsertGoalReflection(
            id,
            resourceId,
            parse(z.object({ summary: text(500) }).strict(), body).summary,
          ),
        };
    }
    if (kind === 'actions') {
      if (!operation && method === 'PATCH')
        return {
          action: service.updateActionMetadata(
            id,
            resourceId,
            parse(actionInput.partial(), body),
          ),
        };
      if (operation === 'resume' && method === 'POST')
        return { action: service.resumeAction(id, resourceId) };
    }
    if (kind === 'captures') {
      if (!operation && method === 'PATCH')
        return {
          capture: service.updateCapture(
            id,
            resourceId,
            parse(z.object({ type: captureType.nullable() }).strict(), body),
          ),
        };
      if (!operation && method === 'DELETE') {
        service.deleteCapture(id, resourceId);
        return { success: true };
      }
      if (operation === 'archive' && method === 'POST')
        return { capture: service.archiveCapture(id, resourceId) };
      if (operation === 'convert' && method === 'POST')
        return service.convertCaptureToAction(
          id,
          resourceId,
          parse(
            z.object({ goalId: z.string().uuid(), title: text(200) }).strict(),
            body,
          ),
        );
    }
    if (kind === 'knowledge') {
      if (!operation && method === 'DELETE') {
        service.deleteKnowledgeItem(id, resourceId);
        return { success: true };
      }
      if (!operation && method === 'PATCH')
        return {
          knowledge: service.updateKnowledgeItem(
            id,
            resourceId,
            parse(
              z
                .object({
                  title: text(80).optional(),
                  note: text(300).optional(),
                  status: z
                    .enum([
                      'in_progress',
                      'needs_consolidation',
                      'consolidated',
                    ])
                    .optional(),
                })
                .strict(),
              body,
            ),
          ),
        };
    }
  }
  if (method === 'GET' && path === '/api/current')
    return service.getCurrentWorkspace(id);
  if (method === 'PUT' && path === '/api/current/context')
    return {
      context: service.recordCurrentContext(
        id,
        parse(
          z
            .object({
              availableMinutes: minutes.nullable().optional(),
              energy: energy.nullable().optional(),
            })
            .strict(),
          body,
        ),
      ),
    };
  if (method === 'POST' && path === '/api/current/select')
    return {
      context: service.selectCurrentAction(
        id,
        parse(z.object({ actionId: z.string().uuid() }).strict(), body)
          .actionId,
      ),
    };
  if (method === 'DELETE' && path === '/api/current/select')
    return {
      context: service.clearCurrentAction(
        id,
        parse(expected.strict(), body).expectedActionId,
      ),
    };
  if (method === 'POST' && path === '/api/current/complete') {
    const input = parse(
      expected
        .extend({ outcomeNote: text(500).nullable().optional() })
        .strict(),
      body,
    );
    return {
      action: service.completeCurrentAction(
        id,
        input.outcomeNote,
        input.expectedActionId,
      ),
    };
  }
  if (method === 'POST' && path === '/api/current/block') {
    const input = parse(
      expected
        .extend({ blockerNote: text(500).nullable().optional() })
        .strict(),
      body,
    );
    return {
      action: service.blockCurrentAction(
        id,
        input.blockerNote,
        input.expectedActionId,
      ),
    };
  }
  if (method === 'POST' && path === '/api/current/abandon') {
    const input = parse(
      expected
        .extend({ outcomeNote: text(500).nullable().optional() })
        .strict(),
      body,
    );
    return {
      action: service.abandonCurrentAction(
        id,
        input.outcomeNote,
        input.expectedActionId,
      ),
    };
  }
  if (method === 'POST' && path === '/api/current/split')
    return service.splitCurrentAction(
      id,
      parse(actionInput.extend({ expectedActionId: z.string().uuid() }), body),
    );
  if (method === 'GET' && path === '/api/captures')
    return {
      captures: service.listCaptures(
        id,
        parse(
          z.enum(['inbox', 'converted', 'archived']),
          url.searchParams.get('status') ?? 'inbox',
        ),
      ),
    };
  if (method === 'POST' && path === '/api/captures')
    return {
      capture: service.createCapture(
        id,
        parse(
          z
            .object({
              content: text(2000),
              type: captureType.nullable().optional(),
            })
            .strict(),
          body,
        ),
      ),
    };
  if (method === 'GET' && path === '/api/export') return service.exportData(id);
  if (method === 'GET' && path === '/api/profile')
    return { profile: service.getProfileView(id) };
  if (method === 'PUT' && path === '/api/profile/description')
    return {
      description: service.upsertProfileDescription(
        id,
        parse(z.object({ content: text(500) }).strict(), body).content,
      ),
    };
  if (method === 'POST' && path === '/api/knowledge')
    return {
      knowledge: service.createKnowledgeItem(
        id,
        parse(
          z
            .object({
              goalId: z.string().uuid(),
              title: text(80),
              note: text(300).optional(),
            })
            .strict(),
          body,
        ),
      ),
    };
  throw new AppError('COMMAND_NOT_ALLOWED', '此操作不可用。', 404);
}
