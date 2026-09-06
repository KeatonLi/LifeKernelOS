import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

export type DatabaseContext = {
  sqlite: Database.Database;
  orm: ReturnType<typeof drizzle>;
  close: () => void;
};

export function createDatabase(databasePath: string): DatabaseContext {
  mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = FULL');

  try {
    let userVersion = (sqlite.pragma('user_version', { simple: true }) as number) ?? 0;
    if (userVersion === 0) {
      const initialMigrationPath = resolve(process.cwd(), 'db/migrations/001_initial.sql');
      sqlite.exec(readFileSync(initialMigrationPath, 'utf8'));
      userVersion = (sqlite.pragma('user_version', { simple: true }) as number) ?? 0;
    }
    if (userVersion < 2) {
      const v05MigrationPath = resolve(process.cwd(), 'db/migrations/002_v05_goal_current_action.sql');
      const migrate = sqlite.transaction(() => {
        sqlite.exec(readFileSync(v05MigrationPath, 'utf8'));
        sqlite.pragma('user_version = 2');
      });
      migrate();
    }
    const currentUserVersion = (sqlite.pragma('user_version', { simple: true }) as number) ?? 0;
    if (currentUserVersion < 3) {
      const v05CompatibilityPath = resolve(process.cwd(), 'db/migrations/003_v05_remove_single_active_goal_constraint.sql');
      const repair = sqlite.transaction(() => {
        sqlite.exec(readFileSync(v05CompatibilityPath, 'utf8'));
        sqlite.pragma('user_version = 3');
      });
      repair();
    }
    const latestUserVersion = (sqlite.pragma('user_version', { simple: true }) as number) ?? 0;
    if (latestUserVersion < 4) {
      const statusEventsPath = resolve(process.cwd(), 'db/migrations/004_goal_status_events.sql');
      const addStatusEvents = sqlite.transaction(() => {
        sqlite.exec(readFileSync(statusEventsPath, 'utf8'));
        sqlite.pragma('user_version = 4');
      });
      addStatusEvents();
    }
    const v07UserVersion = (sqlite.pragma('user_version', { simple: true }) as number) ?? 0;
    if (v07UserVersion < 5) {
      const actionContentPath = resolve(process.cwd(), 'db/migrations/005_v07_action_content.sql');
      const addActionContent = sqlite.transaction(() => {
        sqlite.exec(readFileSync(actionContentPath, 'utf8'));
        sqlite.pragma('user_version = 5');
      });
      addActionContent();
    }
  } catch (error) {
    sqlite.close();
    throw error;
  }

  return {
    sqlite,
    orm: drizzle(sqlite),
    close: () => sqlite.close()
  };
}
