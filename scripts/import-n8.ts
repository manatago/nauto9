import { app } from 'electron'
import { readFileSync } from 'fs'
import * as repo from '../src/main/db/repo'

// One-off: import characters fetched from nauto8 (Cloud Run / Firestore) into
// the local nauto9 DB. Images are intentionally skipped (recreated by hand).
// Source JSON path is passed via N8_JSON env.

interface N8Char {
  name: string
  prompt?: string
  negative_prompt?: string
  prompt_replacements?: { find: string; replace?: string }[]
  tags?: { name: string }[]
}

app
  .whenReady()
  .then(async () => {
    const path = process.env.N8_JSON ?? '/tmp/n8chars.json'
    const data = JSON.parse(readFileSync(path, 'utf8')) as N8Char[]
    console.log(`source: ${data.length} characters`)

    let imported = 0
    const skipped: string[] = []
    for (const c of data) {
      if (!c.name?.trim()) continue
      const tagIds: number[] = []
      for (const t of c.tags ?? []) {
        if (t?.name?.trim()) tagIds.push(repo.createTag(t.name).id)
      }
      try {
        repo.createCharacter({
          name: c.name,
          prompt: c.prompt ?? '',
          negative_prompt: c.negative_prompt ?? '',
          prompt_replacements: (c.prompt_replacements ?? [])
            .filter((r) => r?.find?.trim())
            .map((r) => ({ find: r.find, replace: r.replace ?? '' })),
          tag_ids: tagIds
        })
        imported++
      } catch (e) {
        // UNIQUE(name) -> already imported; skip
        skipped.push(c.name)
      }
    }

    console.log(`imported=${imported} skipped(existing)=${skipped.length} tags=${repo.listTags().length}`)
    if (skipped.length) console.log('skipped:', skipped.join(', '))
    console.log('IMPORT_OK')
    app.quit()
  })
  .catch((e) => {
    console.error('IMPORT_FAIL', e)
    app.exit(1)
  })
