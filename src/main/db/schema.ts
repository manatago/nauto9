import type Database from 'better-sqlite3'
import { rmSync } from 'fs'
import { join } from 'path'
import { storageRoot } from '../paths'

const SCHEMA_VERSION = 14

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
  persona TEXT NOT NULL DEFAULT '',
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

-- Stories group situations; a situation belongs to exactly one story and is
-- ordered within it. Tags (shared pool) cross-cut across stories.
CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS situations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  negative_prompt TEXT NOT NULL DEFAULT '',
  aspect_ratio TEXT NOT NULL DEFAULT 'portrait',
  order_index INTEGER NOT NULL DEFAULT 0,
  dialogue_samples TEXT NOT NULL DEFAULT '',
  preview_image_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Situation tags are a SEPARATE pool from character tags (different namespace).
CREATE TABLE IF NOT EXISTS situation_tag_defs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS situation_tags (
  situation_id INTEGER NOT NULL REFERENCES situations(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES situation_tag_defs(id) ON DELETE CASCADE,
  PRIMARY KEY (situation_id, tag_id)
);

-- A batch generates one character against every situation in a story (in the
-- story's display order), grouping the results together.
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'story',
  character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  story_id INTEGER REFERENCES stories(id) ON DELETE SET NULL,
  character_tag_id INTEGER REFERENCES tags(id) ON DELETE SET NULL,
  character_name TEXT NOT NULL DEFAULT '',
  story_name TEXT NOT NULL DEFAULT '',
  character_tag_name TEXT NOT NULL DEFAULT '',
  prefix_prompt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  total INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  situation_id INTEGER REFERENCES situations(id) ON DELETE SET NULL,
  character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  seq INTEGER NOT NULL,
  situation_name TEXT NOT NULL DEFAULT '',
  character_name TEXT NOT NULL DEFAULT '',
  dialogue TEXT NOT NULL DEFAULT '',
  image_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Saved WordPress drafts composed from a batch (editable / postable later).
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  h3_mode TEXT NOT NULL DEFAULT 'dialogue',
  blocks TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_images_character ON character_images(character_id);
CREATE INDEX IF NOT EXISTS idx_character_tags_tag ON character_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_situations_story ON situations(story_id);
CREATE INDEX IF NOT EXISTS idx_situation_tags_tag ON situation_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_generations_batch ON generations(batch_id);
`

// ALTER ADD COLUMN only when the column doesn't already exist (so fresh DBs,
// where SCHEMA already created it, don't error on a duplicate).
function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  def: string
): void {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name
  )
  if (cols.length && !cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
  }
}

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

  if (v < 6) {
    // Situation tags move to their own pool (situation_tag_defs). No real
    // situation data exists yet, so drop the old join; SCHEMA recreates it
    // against the new pool.
    db.exec('DROP TABLE IF EXISTS situation_tags;')
  }

  db.exec(SCHEMA)

  if (v < 6) {
    // Add the situation preview/background image column to pre-existing DBs
    // (SCHEMA's CREATE IF NOT EXISTS won't alter an existing situations table).
    addColumnIfMissing(db, 'situations', 'preview_image_path', 'TEXT')
  }
  if (v < 8) {
    // Batch type + per-generation character (for "scene × tag" batches).
    addColumnIfMissing(db, 'batches', 'type', "TEXT NOT NULL DEFAULT 'story'")
    addColumnIfMissing(db, 'batches', 'character_tag_id', 'INTEGER')
    addColumnIfMissing(db, 'batches', 'character_tag_name', "TEXT NOT NULL DEFAULT ''")
    addColumnIfMissing(db, 'generations', 'character_id', 'INTEGER')
    addColumnIfMissing(db, 'generations', 'character_name', "TEXT NOT NULL DEFAULT ''")
    // Existing (story) generations inherit the batch's single character.
    db.exec(`
      UPDATE generations SET
        character_id = (SELECT character_id FROM batches b WHERE b.id = generations.batch_id),
        character_name = COALESCE((SELECT character_name FROM batches b WHERE b.id = generations.batch_id), '')
      WHERE character_id IS NULL
    `)
  }
  if (v < 9) {
    addColumnIfMissing(db, 'batches', 'prefix_prompt', "TEXT NOT NULL DEFAULT ''")
  }
  if (v < 10) {
    addColumnIfMissing(db, 'stories', 'description', "TEXT NOT NULL DEFAULT ''")
    addColumnIfMissing(db, 'generations', 'dialogue', "TEXT NOT NULL DEFAULT ''")
  }
  if (v < 11) {
    addColumnIfMissing(db, 'characters', 'persona', "TEXT NOT NULL DEFAULT ''")
  }
  if (v < 12) {
    // Per-situation example lines (newline-separated) used as few-shot tone
    // guidance for dialogue generation.
    addColumnIfMissing(db, 'situations', 'dialogue_samples', "TEXT NOT NULL DEFAULT ''")
  }
  if (v < 14) {
    // h3 heading source per saved article (dialogue line vs image name).
    addColumnIfMissing(db, 'articles', 'h3_mode', "TEXT NOT NULL DEFAULT 'dialogue'")
  }

  db.pragma(`user_version = ${SCHEMA_VERSION}`)
}
