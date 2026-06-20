// Generic LLM text generation (title / intro / chapter blurbs for articles),
// dispatched to the configured provider — remote Grok or local Ollama.
import * as repo from '../db/repo'

async function grokText(system: string, user: string, maxTokens: number): Promise<string> {
  const apiKey = (repo.getSetting('GROK_API_KEY') || '').trim()
  const model = (repo.getSetting('GROK_MODEL') || 'grok-4.3').trim() || 'grok-4.3'
  if (!apiKey) throw new Error('Grok の APIキーが未設定です（設定画面で入力してください）')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90_000)
  let res: Response
  try {
    res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.8,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Grok 応答がタイムアウトしました')
    throw new Error('Grok API に接続できません（ネットワークを確認してください）')
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    if (res.status === 401) throw new Error('Grok APIキーが無効です（401）')
    throw new Error(`Grok HTTP ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

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
    return grokText(system, user, maxTokens)
  }
  return ollamaText(system, user, maxTokens)
}
