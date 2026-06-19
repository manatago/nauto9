import { app } from 'electron'
import { zipSync } from 'fflate'
import * as batches from '../src/main/db/batches'
import * as sit from '../src/main/db/situations'
import * as repo from '../src/main/db/repo'
import { generationKey, safeArcName, slug } from '../src/main/services/naming'

// Verify: batch creation makes one pending generation per situation in story
// order; naming convention; ZIP arc naming + dedup.
app
  .whenReady()
  .then(async () => {
    // naming convention (nauto8-compatible)
    const key = generationKey('御坂-学園編', 3, 'xxx in classroom looking at viewer with a long name over 32')
    console.log('generationKey:', key)
    if (!/^generations\/.+\/003-.+-[a-z0-9]{7}\.png$/.test(key)) throw new Error('naming pattern wrong')
    console.log('slug(日本語 タグ!):', slug('日本語 タグ! 123'))
    if (slug('a b/c').includes('/')) throw new Error('slug should strip slashes')

    // build a story with 3 ordered situations + a character
    const ch = repo.createCharacter({ name: 'みさか', prompt: '1girl' })
    const story = sit.createStory('学園編')
    const s1 = sit.createSituation({ story_id: story.id, name: 'classroom', prompt: 'classroom' })
    const s2 = sit.createSituation({ story_id: story.id, name: 'rooftop', prompt: 'rooftop' })
    const s3 = sit.createSituation({ story_id: story.id, name: 'corridor', prompt: 'corridor' })
    // reorder so corridor comes first
    sit.reorderSituations(story.id, [s3.id, s1.id, s2.id])

    const b = batches.createBatch({ character_id: ch.id, story_id: story.id })
    console.log('batch name:', b.name, '| total:', b.total, '| status:', b.status)
    console.log('generations order:', b.generations.map((g) => `${g.seq}:${g.situation_name}`).join(' '))
    if (b.total !== 3) throw new Error('expected total 3')
    if (b.generations.map((g) => g.situation_name).join(',') !== 'corridor,classroom,rooftop')
      throw new Error('generations not in story order')
    if (b.generations.some((g) => g.status !== 'pending')) throw new Error('new gens should be pending')

    // simulate two successes + one fail to exercise list/download counts
    batches.setGenerationResult(b.generations[0].id, generationKey(b.name, 1, b.generations[0].situation_name))
    batches.setGenerationResult(b.generations[1].id, generationKey(b.name, 2, b.generations[1].situation_name))
    batches.setGenerationFailed(b.generations[2].id, 'token missing')
    batches.finalizeBatch(b.id)
    const after = batches.getBatch(b.id)!
    console.log('after: status', after.status, 'success', after.success_count, 'done', after.done_count)
    if (after.status !== 'completed') throw new Error('should be completed (some success, none pending)')
    if (after.success_count !== 2 || after.done_count !== 3) throw new Error('counts wrong')

    // ZIP arc naming + dedup (two files with same basename)
    const files: Record<string, Uint8Array> = {}
    const seen = new Set<string>()
    for (const p of ['generations/x/001-a-aaaaaaa.png', 'sub/001-a-aaaaaaa.png']) {
      let arc = safeArcName(p)
      if (seen.has(arc)) arc = arc.replace(/\.png$/, '_2.png')
      seen.add(arc)
      files[arc] = new Uint8Array([1, 2, 3])
    }
    const zipped = zipSync(files, { level: 0 })
    console.log('zip arcs:', Object.keys(files).join(', '), '| bytes:', zipped.length)
    if (!('001-a-aaaaaaa.png' in files) || !('001-a-aaaaaaa_2.png' in files))
      throw new Error('arc dedup failed')

    batches.deleteBatch(b.id)
    sit.deleteStory(story.id)
    repo.deleteCharacter(ch.id)
    console.log('SMOKE_OK')
    app.quit()
  })
  .catch((e) => {
    console.error('SMOKE_FAIL', e)
    app.exit(1)
  })
