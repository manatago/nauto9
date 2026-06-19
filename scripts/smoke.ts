import { app, nativeImage } from 'electron'
import * as repo from '../src/main/db/repo'
import { buildReferenceParams } from '../src/main/services/reference'

function makeTestPngDataUrl(): string {
  const W = 120
  const H = 180
  const bmp = Buffer.alloc(W * H * 4)
  for (let i = 0; i < bmp.length; i += 4) {
    bmp[i] = 200
    bmp[i + 1] = 120
    bmp[i + 2] = 60
    bmp[i + 3] = 255
  }
  return 'data:image/png;base64,' + nativeImage.createFromBitmap(bmp, { width: W, height: H }).toPNG().toString('base64')
}

// Verify the simplified model: character = prompt + reference images.
app
  .whenReady()
  .then(async () => {
    const c = repo.createCharacter({
      name: `スモーク${Date.now()}`,
      prompt: '1girl, long black hair, blue eyes',
      negative_prompt: 'bad quality'
    })
    console.log(`created #${c.id}, images=${c.images.length}`)
    if (c.images.length !== 0) throw new Error('new character should start with 0 images')

    const imgs = repo.addImages({ character_id: c.id, files: [{ name: 'a.png', dataUrl: makeTestPngDataUrl() }] })
    console.log('added image:', imgs[0].image_url, '| thumb:', imgs[0].thumbnail_url)
    repo.toggleReference(imgs[0].id)

    const me = repo.listCharacters().find((x) => x.id === c.id)!
    console.log(`list: image_count=${me.image_count} thumb=${me.thumbnail_url ? 'yes' : 'no'}`)
    if (me.image_count !== 1 || !me.thumbnail_url) throw new Error('list shape wrong')

    repo.setSetting('REFERENCE_MODE', 'precise')
    const ref = await buildReferenceParams(c.id, '1girl', 'dummy-token')
    console.log(`reference: mode=${ref.mode} count=${ref.count}`)
    if (ref.mode !== 'precise' || ref.count !== 1 || !ref.params) throw new Error('reference build failed')

    repo.setSetting('REFERENCE_MODE', 'none')
    const none = await buildReferenceParams(c.id, '1girl', 'dummy-token')
    if (none.params || none.count !== 0) throw new Error('none mode should send nothing')

    repo.deleteCharacter(c.id)
    console.log('SMOKE_OK')
    app.quit()
  })
  .catch((e) => {
    console.error('SMOKE_FAIL', e)
    app.exit(1)
  })
