// Generic LLM text generation (title / intro / chapter blurbs for articles),
// dispatched to the configured provider — remote Grok or local Ollama.
import * as repo from '../db/repo'
import { xaiChat } from './xai'

async function ollamaText(system: string, user: string, maxTokens: number): Promise<string> {
  const base = (repo.getSetting('OLLAMA_URL') || 'http://localhost:11434').replace(/\/+$/, '')
  const model = (repo.getSetting('OLLAMA_MODEL') || '').trim()
  if (!model) throw new Error('Ollama のモデル名が未設定です')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180_000)
  let res: Response
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        stream: false,
        keep_alive: '20m',
        options: { temperature: 0.7, num_predict: maxTokens }
      }),
      signal: controller.signal
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Ollama 応答がタイムアウトしました')
    throw new Error(`Ollama に接続できません（${base}）`)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  const data = (await res.json()) as { message?: { content?: string } }
  return (data.message?.content ?? '').trim()
}

// Generate a short piece of prose. Uses the configured provider.
export function generateText(system: string, user: string, maxTokens = 400): Promise<string> {
  if ((repo.getSetting('LLM_PROVIDER') || 'local').trim() === 'grok') {
    return xaiChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      { maxTokens }
    ).then((s) => s.trim())
  }
  return ollamaText(system, user, maxTokens)
}
