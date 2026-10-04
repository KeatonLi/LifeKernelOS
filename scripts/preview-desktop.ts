/** Local design preview only. Packaged desktop never starts this HTTP server. */
import { createServer } from 'vite';
import { createDatabase } from '../apps/api/src/db.js';
import { LifeKernelService } from '../apps/api/src/services.js';
import { dispatch } from '../apps/api/src/commands.js';
import { AppError } from '../apps/api/src/types.js';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { localDay, shiftDay } from '../shared/calendar.js';
const database = createDatabase(
  process.env.LK_PREVIEW_DATABASE ??
    join(tmpdir(), 'lifekernel-design-preview-v04.sqlite'),
);
const service = new LifeKernelService(database);
const user =
  service.findUserCredential('local@lifekernel.desktop')?.user ??
  service.provisionInitialAccount(
    'local@lifekernel.desktop',
    'LOCAL_ONLY_NO_LOGIN',
  );
if (
  process.env.LK_PREVIEW_EXAMPLE === '1' &&
  !service.listGoals(user.id).length
) {
  const goal = service.createGoal(user.id, {
    title: '让 LifeKernel 成为我的日常工具',
    doneDefinition: '做出愿意每天打开、真正帮助我开始行动的产品。',
  });
  const first = service.createGoalAction(user.id, goal.id, {
    title: '梳理客户端的核心体验',
    scheduledDate: shiftDay(localDay(), -2),
    content:
      '从打开到开始行动，走一遍最短的路径。\n\n先把心里的想法记下来，再找到一个足够小、现在就能开始的动作。',
    estimatedMinutes: 30,
    energyRequired: 'medium',
  });
  service.selectCurrentAction(user.id, first.id);
  service.completeCurrentAction(user.id);
  const current = service.createGoalAction(user.id, goal.id, {
    title: '打磨主线工作区的第一眼',
    scheduledDate: localDay(),
    content:
      '让界面先回答一个问题：我现在可以做什么？\n\n整理任务层级、留白和主要操作，用一个可以完成的小步骤推进产品。',
    estimatedMinutes: 30,
    energyRequired: 'medium',
  });
  service.selectCurrentAction(user.id, current.id);
  service.createGoalAction(user.id, goal.id, {
    title: '邀请一位朋友体验',
    scheduledDate: shiftDay(localDay(), 3),
    content: '观察他第一次打开时会做什么。',
    estimatedMinutes: 15,
    energyRequired: 'low',
  });
  service.createGoalAction(user.id, goal.id, {
    title: '整理一次真实反馈',
    estimatedMinutes: 15,
    energyRequired: 'low',
  });
  service.createGoal(user.id, {
    title: '保持阅读与思考',
    doneDefinition: '把读到的内容变成自己的认识。',
  });
  service.createKnowledgeItem(user.id, {
    goalId: goal.id,
    title: '把行动拆到足够小',
    note: '降低开始的成本，比给自己更多压力更有用。',
  });
  service.upsertProfileDescription(
    user.id,
    '用一个个真实的行动，让想法慢慢成为日常。',
  );
  service.createCapture(user.id, {
    content: '卡住的时候，也许可以先换一个更小的起点。',
    type: 'idea',
  });
}
const server = await createServer({
  root: resolve(import.meta.dirname, '..'),
  server: { host: '0.0.0.0', port: 4173, strictPort: true },
  plugins: [
    {
      name: 'local-desktop-preview',
      configureServer(server) {
        server.middlewares.use('/api', async (request, response) => {
          try {
            let body = '';
            for await (const chunk of request) {
              body += String(chunk);
              if (body.length > 65536)
                throw new AppError('INVALID_INPUT', '输入过长。');
            }
            const result = dispatch(service, user, {
              method: request.method,
              path: `/api${request.url}`,
              body: body ? JSON.parse(body) : undefined,
            });
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(result));
          } catch (error) {
            response.statusCode =
              error instanceof AppError ? error.statusCode : 500;
            response.setHeader('Content-Type', 'application/json');
            response.end(
              JSON.stringify({
                error: {
                  message:
                    error instanceof Error ? error.message : '本地预览不可用。',
                  code: error instanceof AppError ? error.code : undefined,
                  fields: error instanceof AppError ? error.fields : undefined,
                },
              }),
            );
          }
        });
      },
    },
  ],
});
await server.listen();
console.log('Local desktop design preview ready');
process.on('SIGTERM', async () => {
  await server.close();
  database.close();
  process.exit(0);
});
