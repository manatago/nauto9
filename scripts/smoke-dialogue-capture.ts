import { app } from 'electron'
import { createServer } from 'http'
import * as repo from '../src/main/db/repo'
import { generateDialogueForGeneration } from '../src/main/services/dialogue'

// Intercept the actual Ollama request the real code path sends, so we can see
// whether the situation's dialogue_samples reach the prompt. Runs against a COPY
// of dev-data (NAUTO9_DATA_DIR), generation 561 = 千石撫子 on situation 1.
const GEN_ID = Number(process.env.CAP_GEN_ID || '561')

app
  .whenReady()
  .then(async () => {
    let captured = ''
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        captured = body
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: { content: 'テスト応答' } }))
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port

    repo.setSetting('OLLAMA_URL', `http://127.0.0.1:${port}`)
    repo.setSetting('OLLAMA_MODEL', 'capture-test')
    repo.setSetting('DIALOGUE_PROMPT_TEMPLATE', '') // use the default template

    await generateDialogueForGeneration(GEN_ID)

    const payload = JSON.parse(captured) as { messages: { role: string; content: string }[] }
    const system = payload.messages.find((m) => m.role === 'system')?.content ?? ''
    const user = payload.messages.find((m) => m.role === 'user')?.content ?? ''
    console.log('===== SYSTEM MESSAGE SENT =====')
    console.log(system)
    console.log('===== USER MESSAGE SENT =====')
    console.log(user)
    console.log('===== CHECK =====')
    console.log('contains "セリフの例":', system.includes('セリフの例'))
    console.log('contains sample line:', system.includes('スクール水着なんて久しぶり'))

    server.close()
    console.log('SMOKE_OK')
    app.quit()
  })
  .catch((e) => {
    console.error('SMOKE_FAIL', e)
    app.exit(1)
  })
