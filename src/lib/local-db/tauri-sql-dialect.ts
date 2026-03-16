import Database from '@tauri-apps/plugin-sql';
import {
  DatabaseConnection,
  Dialect,
  DialectAdapter,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  createQueryId,
} from 'kysely';

export class TauriSqliteDialect implements Dialect {
  constructor(private readonly dbPath: string) {}

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  createDriver(): Driver {
    return new TauriSqliteDriver(this.dbPath);
  }

  createIntrospector(db: Kysely<any>) {
    return new SqliteIntrospector(db);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }
}

class Mutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise<() => void>(resolve => {
      this.queue.push(() => resolve(() => this.release()));
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

class TauriSqliteDriver implements Driver {
  private db: Database | null = null;
  private readonly mutex = new Mutex();

  constructor(private readonly dbPath: string) {}

  async init(): Promise<void> {
    this.db = await Database.load(this.dbPath);
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    if (!this.db) throw new Error('Database not initialized');
    const release = await this.mutex.acquire();
    return new TauriSqliteConnection(this.db, release);
  }

  async beginTransaction(conn: DatabaseConnection): Promise<void> {
    await conn.executeQuery({ sql: 'BEGIN', parameters: [], queryId: createQueryId(), query: null as any });
  }

  async commitTransaction(conn: DatabaseConnection): Promise<void> {
    await conn.executeQuery({ sql: 'COMMIT', parameters: [], queryId: createQueryId(), query: null as any });
  }

  async rollbackTransaction(conn: DatabaseConnection): Promise<void> {
    await conn.executeQuery({ sql: 'ROLLBACK', parameters: [], queryId: createQueryId(), query: null as any });
  }

  async releaseConnection(conn: DatabaseConnection): Promise<void> {
    (conn as TauriSqliteConnection).release();
  }

  async destroy(): Promise<void> {}
}

class TauriSqliteConnection implements DatabaseConnection {
  private released = false;
  constructor(
    private readonly db: Database,
    private readonly releaseFn: () => void,
  ) {}

  release(): void {
    if (!this.released) {
      this.released = true;
      this.releaseFn();
    }
  }

  async executeQuery<R>(compiledQuery: { sql: string; parameters: readonly unknown[] }): Promise<QueryResult<R>> {
    const sql = compiledQuery.sql.trim().toUpperCase();
    const params = compiledQuery.parameters as unknown[];

    if (sql.startsWith('SELECT') || sql.startsWith('PRAGMA') || sql.startsWith('WITH') || sql.includes('RETURNING')) {
      const rows = await this.db.select<R[]>(compiledQuery.sql, params);
      return { rows };
    } else {
      const result = await this.db.execute(compiledQuery.sql, params);
      return {
        rows: [],
        insertId: result.lastInsertId !== undefined ? BigInt(result.lastInsertId) : undefined,
        numAffectedRows: result.rowsAffected !== undefined ? BigInt(result.rowsAffected) : undefined,
      };
    }
  }

  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('Streaming not supported by Tauri SQL plugin');
  }
}
