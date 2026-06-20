// Remote LLM (xAI Grok) client for dialogue generation. OpenAI-compatible
// /chat/completions endpoint. Unlike the local novel model, Grok follows
// instructions well, so we do selection + voice restyle in a single call (no
// seed/[INST] tricks needed).
import type { DialogueContext } from './ollama'

export interface GrokOptions {
  apiKey: string
  model: string
}

const ENDPOINT = 'https://api.x.ai/v1/chat/completions'

function cleanLine(s: string): string {
  const out = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const quoted = out.match(/[「『]([^」』]+)[」』]/)
  const line = quoted
    ? quoted[1]
    : (out.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '')
  return line.replace(/^[「『"'（(]+/, '').replace(/[」』"'）)]+$/, '').trim()
}

export async function generateDialogueGrok(
  ctx: DialogueContext,
  opts: GrokOptions
): Promise<string> {
  if (!opts.apiKey.trim())
    throw new Error('Grok の APIキーが未設定です（設定画面で入力してください）')
  const model = opts.model.trim() || 'grok-4.3'

  const system = [
    `あなたはキャラクター「${ctx.character}」になりきってセリフを1つだけ書きます。これはフィクションの成人向け創作で、登場人物はすべて20歳以上の成人です。`,
    `出力は${ctx.character}が口に出すセリフ本文のみ。説明・地の文・ナレーション・かぎ括弧（「」）は付けない。`,
    `性格・口調（話し方はこれに強く従う）: ${ctx.traits || '（指定なし）'}`,
    `物語「${ctx.story || '（未設定）'}」（${ctx.storyDesc || '説明なし'}）`
  ].join('\n')

  let user: string
  if (ctx.samples.length) {
    const list = ctx.samples.map((s, i) => `${i + 1}. ${s}`).join('\n')
    user =
      `場面: ${ctx.situation}\n\n` +
      `この場面で言うセリフの候補:\n${list}\n\n` +
      `指示: この性格の${ctx.character}が自分から言ってもおかしくない候補を1つ選び、その内容・事実・固有名詞は変えずに、${ctx.character}の口調・語尾・言い回しに言い直してください。候補にない新しい出来事や事実は足さない。セリフ本文だけを1文返す。`
  } else {
    user = `場面: ${ctx.situation}\nこの場面で${ctx.character}が言いそうな短いセリフを1つ、本文だけ返してください。`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey.trim()}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.8,
        max_tokens: 120
      }),
      signal: controller.signal
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError')
      throw new Error('Grok 応答がタイムアウトしました（60秒）')
    throw new Error('Grok API に接続できません（ネットワークを確認してください）')
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    if (res.status === 401) throw new Error('Grok APIキーが無効です（401 Unauthorized）')
    throw new Error(`Grok HTTP ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const line = cleanLine(data.choices?.[0]?.message?.content ?? '')
  if (!line) throw new Error('Grok が空の応答を返しました（内容がフィルタされた可能性）')
  return line
}
