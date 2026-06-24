// Shared xAI (Grok) chat client — OpenAI-compatible /chat/completions. Reads the
// API key / model from settings so both dialogue and article-text generation go
// through one place.
import * as repo from '../db/repo'

const ENDPOINT = 'https://api.x.ai/v1/chat/completions'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function xaiChat(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {}
): Promise<string> {
  const apiKey = (repo.getSetting('GROK_API_KEY') || '').trim()
  const model = (repo.getSetting('GROK_MODEL') || 'grok-4.3').trim() || 'grok-4.3'
  if (!apiKey) throw new Error('Grok の APIキーが未設定です（設定画面で入力してください）')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000)
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 400
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
    throw new Error(`Grok HTTP ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

// Validate the API key without consuming tokens (GET /v1/api-key).
export async function testApiKey(): Promise<{ name: string }> {
  const apiKey = (repo.getSetting('GROK_API_KEY') || '').trim()
  if (!apiKey) throw new Error('Grok の APIキーが未設定です（設定画面で入力してください）')
  let res: Response
  try {
    res = await fetch('https://api.x.ai/v1/api-key', {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
  } catch {
    throw new Error('Grok API に接続できません（ネットワークを確認してください）')
  }
  if (res.status === 401 || res.status === 403) throw new Error('Grok APIキーが無効です')
  if (!res.ok) throw new Error(`Grok HTTP ${res.status}`)
  const data = (await res.json()) as { name?: string; redacted_api_key?: string }
  return { name: data.name || data.redacted_api_key || 'OK' }
}
