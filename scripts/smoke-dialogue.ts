import { app } from 'electron'
import * as sit from '../src/main/db/situations'
import * as batches from '../src/main/db/batches'
import * as repo from '../src/main/db/repo'

// Verify the non-network parts of the dialogue feature: story.description and
// generation.dialogue persist + serialize; story resolves from a situation.
app
  .whenReady()
  .then(async () => {
    const story = sit.createStory('夏休み')
    const updated = sit.updateStory(story.id, { description: 'プールで遊ぶ日常もの' })
    console.log('story description:', JSON.stringify(updated.description))
    if (updated.description !== 'プールで遊ぶ日常もの') throw new Error('story description not saved')

    const ch = repo.createCharacter({ name: 'みさか', prompt: '1girl', memo: 'ツンデレ' })
    const s = sit.createSituation({ story_id: story.id, name: 'xxx at pool', prompt: 'pool, smiling' })
    const b = batches.createBatch({ character_id: ch.id, story_id: story.id })
    const g = b.generations[0]

    // story resolves from a situation (used for dialogue context)
    const st = sit.storyForSituation(s.id)!
    console.log('storyForSituation:', st.name, '/', st.description)
    if (st.name !== '夏休み' || st.description !== 'プールで遊ぶ日常もの')
      throw new Error('storyForSituation wrong')

    // dialogue persists + serializes
    batches.setDialogue(g.id, 'べ、別にあんたのためじゃないんだからね')
    const gen = batches.getGeneration(g.id)!
    console.log('dialogue:', JSON.stringify(gen.dialogue))
    if (!gen.dialogue.includes('別に')) throw new Error('dialogue not persisted/serialized')

    // success ids helper
    console.log('success ids before image:', batches.successGenerationIds(b.id).length)

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
