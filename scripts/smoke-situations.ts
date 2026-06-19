import { app } from 'electron'
import * as sit from '../src/main/db/situations'
import * as repo from '../src/main/db/repo'

// Verify stories + situations: CRUD, per-story ordering, tags, cross-cut.
app
  .whenReady()
  .then(async () => {
    const a = sit.createStory(`物語A${Date.now()}`)
    const b = sit.createStory(`物語B${Date.now()}`)
    console.log('stories:', sit.listStories().map((s) => `${s.name}(${s.situation_count})`).join(' / '))

    const tachie = sit.createSituationTag('立ち絵')
    const battle = sit.createSituationTag('バトル')

    const s1 = sit.createSituation({ story_id: a.id, name: 'xxx standing', prompt: 'standing', tag_ids: [tachie.id] })
    const s2 = sit.createSituation({ story_id: a.id, name: 'xxx fighting', prompt: 'fighting', aspect_ratio: 'landscape', tag_ids: [battle.id] })
    const s3 = sit.createSituation({ story_id: a.id, name: 'xxx sitting', prompt: 'sitting', tag_ids: [tachie.id] })
    sit.createSituation({ story_id: b.id, name: 'xxx running', prompt: 'running', tag_ids: [battle.id] })

    let inA = sit.listSituationsByStory(a.id)
    console.log('物語A order:', inA.map((s) => s.name).join(' -> '))
    if (inA.length !== 3) throw new Error('expected 3 situations in A')

    // reorder: move sitting to the top
    sit.reorderSituations(a.id, [s3.id, s1.id, s2.id])
    inA = sit.listSituationsByStory(a.id)
    console.log('物語A after reorder:', inA.map((s) => s.name).join(' -> '))
    if (inA[0].id !== s3.id) throw new Error('reorder failed')

    // aspect + tags persisted
    const got = sit.getSituation(s2.id)!
    console.log('s2 aspect:', got.aspect_ratio, '| tags:', got.tags.map((t) => t.name).join(','))
    if (got.aspect_ratio !== 'landscape' || !got.tags.some((t) => t.name === 'バトル'))
      throw new Error('aspect/tag not persisted')

    // cross-cut: all situations tagged 立ち絵 across stories
    const all = sit.listAllSituations()
    const tachieAll = all.filter((s) => s.tags.some((t) => t.id === tachie.id))
    console.log('cross-cut 立ち絵:', tachieAll.map((s) => s.name).join(', '), `(${tachieAll.length})`)
    if (tachieAll.length !== 2) throw new Error('cross-cut filter wrong')

    // update: move s1 to story B
    sit.updateSituation(s1.id, { story_id: b.id, name: 'xxx moved', prompt: 'moved' })
    console.log('物語B now:', sit.listSituationsByStory(b.id).map((s) => s.name).join(', '))
    if (sit.listSituationsByStory(a.id).length !== 2) throw new Error('move failed (A should have 2)')

    // delete a story cascades its situations
    sit.deleteStory(b.id)
    if (sit.getSituation(s1.id)) throw new Error('cascade delete failed')
    console.log('after deleting B, total situations:', sit.listAllSituations().length)

    sit.deleteStory(a.id)
    console.log('SMOKE_OK')
    app.quit()
  })
  .catch((e) => {
    console.error('SMOKE_FAIL', e)
    app.exit(1)
  })
