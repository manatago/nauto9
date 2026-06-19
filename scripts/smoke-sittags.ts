import { app } from 'electron'
import * as sit from '../src/main/db/situations'
import * as repo from '../src/main/db/repo'
import { applyCharacterReplacements, replaceXxx } from '../src/main/services/prompt'

// Verify: situation tags are a SEPARATE pool from character tags, and the
// test-shot prompt composition (random character + situation).
app
  .whenReady()
  .then(async () => {
    // same NAME in both pools must coexist (separate namespaces)
    const charTag = repo.createTag('夏')
    const sitTag = sit.createSituationTag('夏')
    console.log('char tag 夏 id =', charTag.id, '| sit tag 夏 id =', sitTag.id)
    console.log('character tags:', repo.listTags().map((t) => t.name).join(','))
    console.log('situation tags:', sit.listSituationTags().map((t) => t.name).join(','))
    // Separate pools: the same name "夏" exists independently in both tables,
    // and creating in one must NOT add it to the other.
    if (repo.listTags().length !== 1 || sit.listSituationTags().length !== 1)
      throw new Error('tag pools are not independent')

    const story = sit.createStory('テスト物語')
    const s = sit.createSituation({
      story_id: story.id,
      name: 'xxx in classroom',
      prompt: 'xxx, classroom, standing',
      negative_prompt: 'bad',
      tag_ids: [sitTag.id]
    })
    console.log('situation tags attached:', sit.getSituation(s.id)!.tags.map((t) => t.name).join(','))
    if (!sit.getSituation(s.id)!.tags.some((t) => t.name === '夏')) throw new Error('sit tag not attached')

    // a character to draw randomly
    repo.createCharacter({
      name: 'みさか',
      prompt: '1girl, brown hair',
      prompt_replacements: [{ find: 'classroom', replace: 'rooftop' }]
    })
    const ch = repo.randomCharacter()!
    console.log('random character:', ch.name)
    let scene = replaceXxx(s.prompt, ch.name)
    scene = applyCharacterReplacements(scene, ch.prompt_replacements)
    console.log('composed scene:', scene)
    if (scene.includes('xxx')) throw new Error('xxx not replaced')
    if (!scene.includes('みさか')) throw new Error('character name not substituted')
    if (scene.includes('classroom') || !scene.includes('rooftop'))
      throw new Error('character prompt_replacements not applied')

    // preview path set/serialize
    const updated = sit.setSituationPreviewPath(s.id, 'situations/1/preview-abc.png')
    console.log('preview_image_url:', updated.preview_image_url)
    if (!updated.preview_image_url?.startsWith('media://')) throw new Error('preview url not derived')

    sit.deleteStory(story.id)
    repo.deleteCharacter(ch.id)
    console.log('SMOKE_OK')
    app.quit()
  })
  .catch((e) => {
    console.error('SMOKE_FAIL', e)
    app.exit(1)
  })
