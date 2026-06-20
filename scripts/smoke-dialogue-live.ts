import { app } from 'electron'
import * as repo from '../src/main/db/repo'
import * as batches from '../src/main/db/batches'
import { generateDialogueForGeneration } from '../src/main/services/dialogue'

// Live end-to-end test against REAL Ollama, using a COPY of dev-data. For each
// generation id, generate a dialogue line and print it. Different characters,
// same situation 1 (which has dialogue_samples set).
const GEN_IDS = (process.env.CAP_GEN_IDS || '561,449,505,393').split(',').map(Number)

app
  .whenReady()
  .then(async () => {
    if (process.env.XAI_API_KEY) {
      // Test the remote Grok path when a key is supplied via env.
      repo.setSetting('LLM_PROVIDER', 'grok')
      repo.setSetting('GROK_API_KEY', process.env.XAI_API_KEY)
      repo.setSetting('GROK_MODEL', process.env.GROK_MODEL || 'grok-4.3')
      console.log(`(provider: grok / ${process.env.GROK_MODEL || 'grok-4.3'})`)
    } else {
      repo.setSetting('LLM_PROVIDER', 'local')
      repo.setSetting('OLLAMA_MODEL', process.env.OLLAMA_MODEL || 'ninja-nsfw-rp')
      repo.setSetting('OLLAMA_URL', 'http://127.0.0.1:11434')
      console.log('(provider: local / ollama)')
    }
    repo.setSetting('DIALOGUE_PROMPT_TEMPLATE', '') // default template

    for (const id of GEN_IDS) {
      const before = batches.getGeneration(id)
      const who = before?.character_name ?? '(?)'
      // generate 3 lines to show variety/stability
      const lines: string[] = []
      for (let i = 0; i < 3; i++) {
        try {
          await generateDialogueForGeneration(id)
          lines.push(batches.getGeneration(id)?.dialogue ?? '(empty)')
        } catch (e) {
          lines.push('ERROR: ' + (e as Error).message)
        }
      }
      console.log(`\n【${who}】(gen ${id})`)
      lines.forEach((l) => console.log('   ・' + l))
    }
    console.log('\nSMOKE_OK')
    app.quit()
  })
  .catch((e) => {
    console.error('SMOKE_FAIL', e)
    app.exit(1)
  })
