import { app } from 'electron'
import { getDb } from '../src/main/db/index'

// Run against a COPY of a real (v2/v3) DB to verify the v4 collapse:
// clothing/outfit/state tables are gone, schema is the simple model,
// tags + settings are preserved (character data is intentionally discarded).
app
  .whenReady()
  .then(async () => {
    const db = getDb() // triggers migrate
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string
      }[]
    ).map((r) => r.name)
    console.log('tables:', tables.join(', '))

    const dropped = ['clothing_types', 'clothing_states', 'character_outfits', 'outfit_states', 'outfit_state_images']
    const stillThere = dropped.filter((t) => tables.includes(t))
    if (stillThere.length) throw new Error('clothing layer still present: ' + stillThere.join(','))

    for (const need of ['characters', 'character_images', 'tags', 'character_tags', 'settings'])
      if (!tables.includes(need)) throw new Error('missing table ' + need)

    console.log('user_version:', db.pragma('user_version', { simple: true }))
    const n = (t: string): number => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n
    console.log(`tags preserved=${n('tags')} settings preserved=${n('settings')} characters=${n('characters')}`)
    console.log('SMOKE_OK')
    app.quit()
  })
  .catch((e) => {
    console.error('SMOKE_FAIL', e)
    app.exit(1)
  })
