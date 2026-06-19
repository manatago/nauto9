import Database from 'better-sqlite3'
import { dbPath } from '../paths'
import { migrate } from './schema'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const conn = new Database(dbPath())
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')
  conn.pragma('busy_timeout = 5000')
  migrate(conn)
  db = conn
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
