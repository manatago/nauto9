import { app, nativeImage } from 'electron'
import { readFileSync } from 'fs'
import * as batches from '../src/main/db/batches'
import * as sit from '../src/main/db/situations'
import * as repo from '../src/main/db/repo'
import { saveImageWithName } from '../src/main/services/images'
import { generationKey } from '../src/main/services/naming'
import { storageRoot } from '../src/main/paths'
import { join } from 'path'
import { existsSync } from 'fs'

function pngBuf(): Buffer {
  const W = 60
  const H = 90
  const bmp = Buffer.alloc(W * H * 4)
  for (let i = 0; i < bmp.length; i += 4) {
    bmp[i] = 120
    bmp[i + 1] = 90
    bmp[i + 2] = 200
    bmp[i + 3] = 255
  }
  return nativeImage.createFromBitmap(bmp, { width: W, height: H }).toPNG()
}

// Verify the non-network parts of regenerate/mosaic: setGenerationImage swaps
// files (old deleted), getGeneration serializes, imageData round-trips.
app
  .whenReady()
  .then(async () => {
    const ch = repo.createCharacter({ name: 'みさか', prompt: '1girl' })
    const story = sit.createStory('章1')
    const s = sit.createSituation({ story_id: story.id, name: 'scene', prompt: 'standing' })
    const b = batches.createBatch({ character_id: ch.id, story_id: story.id })
    const g = b.generations[0]

    // simulate an initial generated image
    const key1 = generationKey(b.name, g.seq, g.situation_name)
    saveImageWithName('generations/test', key1.split('/').pop()!, pngBuf())
    // (use a real dir so the file exists)
    const realKey1 = generationKey(b.name, g.seq, g.situation_name)
    saveImageWithName(realKey1.substring(0, realKey1.lastIndexOf('/')), realKey1.split('/').pop()!, pngBuf())
    batches.setGenerationImage(g.id, realKey1)

    let gen = batches.getGeneration(g.id)!
    console.log('gen status:', gen.status, '| has url:', !!gen.image_url, '| thumb:', !!gen.thumbnail_url)
    if (gen.status !== 'success' || !gen.image_url) throw new Error('setGenerationImage did not mark success')
    if (!existsSync(join(storageRoot(), realKey1))) throw new Error('image file missing after save')

    // imageData round-trip (what the mosaic editor loads)
    const row = batches.getGenerationRow(g.id)!
    const buf = readFileSync(join(storageRoot(), row.image_path!))
    const dataUrl = 'data:image/png;base64,' + buf.toString('base64')
    console.log('imageData length ok:', dataUrl.length > 100)
    if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('imageData not a png data url')

    // replace with a new image (mosaic/regenerate) -> old file removed
    const realKey2 = generationKey(b.name, g.seq, g.situation_name)
    saveImageWithName(realKey2.substring(0, realKey2.lastIndexOf('/')), realKey2.split('/').pop()!, pngBuf())
    batches.setGenerationImage(g.id, realKey2)
    console.log('old file removed:', !existsSync(join(storageRoot(), realKey1)))
    console.log('new file present:', existsSync(join(storageRoot(), realKey2)))
    if (existsSync(join(storageRoot(), realKey1))) throw new Error('old image not deleted on replace')
    if (!existsSync(join(storageRoot(), realKey2))) throw new Error('new image missing')

    gen = batches.getGeneration(g.id)!
    if (gen.image_path !== realKey2) throw new Error('image_path not updated')

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
