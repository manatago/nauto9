import type Database from 'better-sqlite3'
import { rmSync } from 'fs'
import { join } from 'path'
import { storageRoot } from '../paths'

const SCHEMA_VERSION = 4

// Simple model: a character is a single prompt + tags + reference images.
// (The earlier clothing/state/outfit layer was removed — make separate
// characters like "御坂美琴（トップレス）" and register vibes per character.)
const SCHEMA = `
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL DEFAULT '',
  negative_prompt TEXT NOT NULL DEFAULT '',
  prompt_replacements TEXT NOT NULL DEFAULT '[]',
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS character_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  caption TEXT,
  vibe_cache TEXT,
  is_reference_enabled INTEGER NOT NULL DEFAULT 0,
  is_grayscale INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS character_tags (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (character_id, tag_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_images_character ON character_images(character_id);
CREATE INDEX IF NOT EXISTS idx_character_tags_tag ON character_tags(tag_id);
`

export function migrate(db: Database.Database): void {
  const v = db.pragma('user_version', { simple: true }) as number

  if (v < 4) {
    // Collapse to the simple model. Per the user, existing character data may be
    // discarded; we keep `tags` and `settings` (token / reference config).
    db.exec(`
      DROP TABLE IF EXISTS state_modifiers;
      DROP TABLE IF EXISTS outfit_state_images;
      DROP TABLE IF EXISTS outfit_states;
      DROP TABLE IF EXISTS character_outfits;
      DROP TABLE IF EXISTS clothing_states;
      DROP TABLE IF EXISTS clothing_types;
      DROP TABLE IF EXISTS character_images;
      DROP TABLE IF EXISTS character_tags;
      DROP TABLE IF EXISTS characters;
    `)
    // Old reference image files become orphans — clear them.
    try {
      rmSync(join(storageRoot(), 'characters'), { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }

  db.exec(SCHEMA)
  db.pragma(`user_version = ${SCHEMA_VERSION}`)
}
