import { app } from 'electron'
import * as batches from '../src/main/db/batches'
import * as sit from '../src/main/db/situations'
import * as repo from '../src/main/db/repo'

// Verify the "scene × tag" batch: selected situations × every character in a
// tag, one generation each, carrying its own character.
app
  .whenReady()
  .then(async () => {
    const tag = repo.createTag('パーティ')
    const c1 = repo.createCharacter({ name: 'アクア', prompt: '1girl, blue hair', tag_ids: [tag.id] })
    const c2 = repo.createCharacter({ name: 'めぐみん', prompt: '1girl, red eyes', tag_ids: [tag.id] })
    repo.createCharacter({ name: '無関係', prompt: '1girl' }) // not in tag
    console.log('characters in tag:', repo.charactersByTag(tag.id).map((c) => c.name).join(','))
    if (repo.charactersByTag(tag.id).length !== 2) throw new Error('charactersByTag wrong')

    const story = sit.createStory('冒険')
    const s1 = sit.createSituation({ story_id: story.id, name: 'town', prompt: 'town' })
    const s2 = sit.createSituation({ story_id: story.id, name: 'dungeon', prompt: 'dungeon' })
    const s3 = sit.createSituation({ story_id: story.id, name: 'inn', prompt: 'inn' })

    // pick situations 1 and 3 only
    const b = batches.createSceneBatch({
      story_id: story.id,
      situation_ids: [s1.id, s3.id],
      character_tag_id: tag.id
    })
    console.log('batch type:', b.type, '| name:', b.name, '| total:', b.total)
    console.log('tag name snapshot:', b.character_tag_name)
    if (b.type !== 'scene') throw new Error('type should be scene')
    if (b.total !== 4) throw new Error('expected 2 sit × 2 char = 4')
    if (b.generations.length !== 4) throw new Error('expected 4 generations')

    // situation-major order: (town: a), (town: m), (inn: a), (inn: m) — by name sort アクア<めぐみん
    const pairs = b.generations.map((g) => `${g.situation_name}:${g.character_name}`)
    console.log('pairs:', pairs.join(' | '))
    const sits = b.generations.map((g) => g.situation_name)
    if (sits[0] !== 'town' || sits[1] !== 'town' || sits[2] !== 'inn' || sits[3] !== 'inn')
      throw new Error('not situation-major')
    if (!b.generations.every((g) => g.character_id)) throw new Error('generations missing character_id')
    if (b.generations.some((g) => g.situation_name === 'dungeon')) throw new Error('unselected situation leaked')

    // each generation row exposes its own character (for the worker/regenerate)
    const row = batches.getGenerationRow(b.generations[0].id)!
    console.log('gen0 character_id present:', row.character_id != null)
    if (row.character_id == null) throw new Error('getGenerationRow missing character_id')

    batches.deleteBatch(b.id)
    sit.deleteStory(story.id)
    for (const c of repo.listCharacters()) repo.deleteCharacter(c.id)
    console.log('SMOKE_OK')
    app.quit()
  })
  .catch((e) => {
    console.error('SMOKE_FAIL', e)
    app.exit(1)
  })
