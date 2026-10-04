import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/** Compatibility boundary for existing synchronous SQL use cases. */
export class SqliteDatabase {
  private readonly connection: DatabaseSync;
  private depth = 0;
  constructor(path: string) {
    this.connection = new DatabaseSync(path);
  }
  exec(sql: string) {
    this.connection.exec(sql);
  }
  close() {
    this.connection.close();
  }
  prepare(sql: string) {
    const statement = this.connection.prepare(sql);
    return {
      get: (...values: SQLInputValue[]): unknown => statement.get(...values),
      all: (...values: SQLInputValue[]): unknown[] => statement.all(...values),
      run: (...values: SQLInputValue[]) => statement.run(...values),
    };
  }
  pragma(sql: string, options?: { simple: boolean }): unknown {
    const rows = this.connection.prepare(`PRAGMA ${sql}`).all();
    return options?.simple ? Object.values(rows[0] ?? {})[0] : rows;
  }
  transaction<T>(fn: () => T): () => T {
    return () => {
      const level = this.depth++;
      const savepoint = `lk_transaction_${level}`;
      let started = false;
      try {
        this.exec(level ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
        started = true;
        const result = fn();
        this.exec(level ? `RELEASE ${savepoint}` : 'COMMIT');
        return result;
      } catch (error) {
        if (started) {
          if (level) {
            this.exec(`ROLLBACK TO ${savepoint}`);
            this.exec(`RELEASE ${savepoint}`);
          } else this.exec('ROLLBACK');
        }
        throw error;
      } finally {
        this.depth--;
      }
    };
  }
}
export type DatabaseContext = { sqlite: SqliteDatabase; close: () => void };
export function createDatabase(
  databasePath: string,
  migrationsPath = fileURLToPath(
    new URL('../../../db/migrations', import.meta.url),
  ),
): DatabaseContext {
  mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new SqliteDatabase(databasePath);
  try {
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('busy_timeout = 5000');
    sqlite.pragma('synchronous = FULL');
    const currentVersion = Number(
      sqlite.pragma('user_version', { simple: true }),
    );
    const migrations = readdirSync(migrationsPath)
      .filter((name) => /^\d{3}_.*\.sql$/.test(name))
      .sort();
    if (currentVersion > migrations.length)
      throw new Error('数据库来自较新的版本，请升级客户端。');
    for (const filename of migrations) {
      const version = Number(filename.slice(0, 3));
      if (version <= currentVersion) continue;
      sqlite.transaction(() => {
        sqlite.exec(readFileSync(resolve(migrationsPath, filename), 'utf8'));
        sqlite.pragma(`user_version = ${version}`);
      })();
    }
    return { sqlite, close: () => sqlite.close() };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
