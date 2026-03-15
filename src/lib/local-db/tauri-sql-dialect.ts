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

class TauriSqliteDriver implements Driver {
  private db: Database | null = null;

  constructor(private readonly dbPath: string) {}

  async init(): Promise<void> {
    this.db = await Database.load(this.dbPath);
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    if (!this.db) throw new Error('Database not initialized');
    return new TauriSqliteConnection(this.db);
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

  async releaseConnection(_conn: DatabaseConnection): Promise<void> {}

  async destroy(): Promise<void> {}
}

class TauriSqliteConnection implements DatabaseConnection {
  constructor(private readonly db: Database) {}

  async executeQuery<R>(compiledQuery: { sql: string; parameters: readonly unknown[] }): Promise<QueryResult<R>> {
    const sql = compiledQuery.sql.trim().toUpperCase();
    const params = compiledQuery.parameters as unknown[];

    if (sql.startsWith('SELECT') || sql.startsWith('PRAGMA') || sql.startsWith('WITH')) {
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
