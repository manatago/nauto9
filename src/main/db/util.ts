import { mediaUrl, thumbKey } from '../services/images'

// Shared helpers for the SQLite repositories.

export type Row = Record<string, unknown>

// SQLite-friendly 'YYYY-MM-DD HH:MM:SS' timestamp (matches datetime('now')).
export const now = (): string => new Date().toISOString().slice(0, 19).replace('T', ' ')

export const mediaUrlOrNull = (path: string | null): string | null =>
  path ? mediaUrl(path) : null

export const thumbUrlOrNull = (path: string | null): string | null =>
  path ? mediaUrl(thumbKey(path)) : null
