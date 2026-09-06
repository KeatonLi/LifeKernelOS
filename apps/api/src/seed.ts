import { resolve } from 'node:path';
import { hashPassword } from './auth.js';
import { createDatabase } from './db.js';
import { LifeKernelService } from './services.js';

const email = process.env.LK_SEED_EMAIL;
const password = process.env.LK_SEED_PASSWORD;

if (!email || !password) {
  console.error('请先以环境变量提供 LK_SEED_EMAIL 与 LK_SEED_PASSWORD，再运行 db:seed。');
  process.exit(1);
}

const database = createDatabase(process.env.DATABASE_PATH ?? resolve(process.cwd(), 'data/lifekernel.sqlite'));
const service = new LifeKernelService(database);

try {
  const user = service.provisionInitialAccount(email, await hashPassword(password));
  console.log(`已创建受控账号：${user.email}`);
} finally {
  database.close();
}
