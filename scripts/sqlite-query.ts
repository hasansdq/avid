import type { Database, SQLQueryBindings } from "bun:sqlite";

/** Finalize every statement before closing SQLite or starting Prisma's engine. */
export function sqliteRows<T>(
  db: Database,
  sql: string,
  ...params: SQLQueryBindings[]
): T[] {
  const statement = db.prepare<T, SQLQueryBindings[]>(sql);
  try {
    return statement.all(...params);
  } finally {
    statement.finalize();
  }
}
