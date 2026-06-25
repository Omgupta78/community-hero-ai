// D1-compatible adapter backed by Node's built-in `node:sqlite`.
//
// This lets the exact same Hono app code (which calls the Cloudflare D1 API:
// `db.prepare(sql).bind(...).first()/all()/run()`) run on a plain Node server
// such as Google Cloud Run — with zero native dependencies.
import { DatabaseSync } from 'node:sqlite'

class Statement {
  private params: any[] = []
  constructor(private db: DatabaseSync, private sql: string) {}

  bind(...args: any[]): Statement {
    // node:sqlite accepts null/number/bigint/string/Uint8Array. Coerce
    // undefined → null and booleans → 0/1 to match D1 behaviour.
    this.params = args.map((v) =>
      v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v
    )
    return this
  }

  async first<T = any>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params)
    return (row as T) ?? null
  }

  async all<T = any>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    const results = this.db.prepare(this.sql).all(...this.params) as T[]
    return { results, success: true, meta: {} }
  }

  async run(): Promise<{ success: true; meta: { last_row_id: number; changes: number } }> {
    const r = this.db.prepare(this.sql).run(...this.params)
    return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }
  }
}

export class SqliteD1 {
  db: DatabaseSync
  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
  }
  prepare(sql: string): Statement {
    return new Statement(this.db, sql)
  }
  exec(sql: string): void {
    this.db.exec(sql)
  }
}
