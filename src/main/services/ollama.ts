// Local LLM (Ollama) client for generating a character's line of dialogue.
// Everything stays on the user's machine; the model (and content policy) is
// theirs. The prompt template is user-editable so it can be tuned per model.

// This is sent as the SYSTEM message (roleplay framing). The situation is sent
// separately as the user message, so {situation} is optional here.
export const DEFAULT_DIALOGUE_TEMPLATE = [
  'あなたはキャラクター「{character}」になりきってロールプレイします。これはフィクションのセリフ作成です。',
  'アシスタント的な受け答え・質問・お礼・説明・地の文・ナレーション・英単語・ローマ字・中国語は一切禁止。',
  '常に「{character}」本人が実際に口に出す短いセリフ1文だけを、自然な日本語で返してください。',
  '性格・口調・特徴（最優先で忠実に従う）: {traits}',
  '物語「{story}」（{story_desc}）。'
].join('\n')

export interface DialogueContext {
  character: string
  traits: string
  story: string
  storyDesc: string
  situation: string
}

export interface OllamaOptions {
  url: string
  model: string
  template: string
}

function fillTemplate(tpl: string, ctx: DialogueContext): string {
  return tpl
    .replace(/{character}/g, ctx.character)
    .replace(/{traits}/g, ctx.traits || '（特になし）')
    .replace(/{story}/g, ctx.story || '（未設定）')
    .replace(/{story_desc}/g, ctx.storyDesc || '（説明なし）')
    .replace(/{situation}/g, ctx.situation)
}

// Trim reasoning blocks and narration; keep just the spoken line. Models often
// wrap the actual line in 「」 with surrounding narration — extract that.
function cleanLine(s: string): string {
  const out = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const quoted = out.match(/[「『]([^」』]+)[」』]/)
  if (quoted) return quoted[1].trim()
  const first = out.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  return first.replace(/^["'（(]+/, '').replace(/["'）)]+$/, '').trim()
}

// qwen2.5 (the recommended fast model) is Chinese-origin and occasionally bleeds
// a Chinese-only character or a run of Latin/pinyin into an otherwise Japanese
// line. Flag those so we can retry once with calmer sampling and keep the better
// attempt. We only catch characters that never appear in normal Japanese text.
const KANA = /[぀-ヿ]/
const HAN = /\p{Script=Han}/u
// Frequent simplified-Chinese-only characters — to catch a Chinese chunk embedded
// in an otherwise-kana line (the "应收账款…泳裤、プールサイド…" failure).
const SIMPLIFIED =
  /[应收账款项资负债务凭证业财经济组成部门泳裤们这说没来对会觉还过吗呢给顶饮哦呀虚飞风强课东车间长发图较钟样乐书买卖见话语认识级单双问题约义习观点类别]/
function looksGarbled(s: string): boolean {
  if (!s) return true
  if (/[A-Za-z]{3,}/.test(s)) return true // a real word's worth of Latin = bleed
  if (SIMPLIFIED.test(s)) return true
  if (HAN.test(s) && !KANA.test(s)) return true // all-kanji line = Chinese (JP dialogue has kana)
  return false
}

// Sampling tuned to suppress qwen2.5's degeneration: low temperature + a repeat
// penalty kills the "rambles into Chinese finance boilerplate" failure mode, and
// a newline stop keeps it to a single spoken line. `temperature` is overridable
// so the retry can be even calmer.
function chatOptions(temperature: number): Record<string, unknown> {
  return {
    temperature,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.2,
    num_predict: 64 // one short line; prevents rambling into garbage
    // No \n stop: it fires on a leading newline (→ empty) with some chat
    // templates. cleanLine() already extracts the first spoken line, and each
    // model's own EOS / [/INST] stop terminates generation.
  }
}

export async function generateDialogue(ctx: DialogueContext, opts: OllamaOptions): Promise<string> {
  if (!opts.model.trim())
    throw new Error('Ollama のモデル名が未設定です（設定画面で入力してください）')
  const system = fillTemplate(opts.template || DEFAULT_DIALOGUE_TEMPLATE, ctx)
  const user = `状況: ${ctx.situation}\nこのときの「${ctx.character}」が言う短いセリフを1文だけ、日本語で。`
  const base = (opts.url || 'http://localhost:11434').replace(/\/+$/, '')

  async function once(temperature: number): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 180_000) // 12B can be slow
    let res: Response
    try {
      res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model.trim(),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          stream: false,
          keep_alive: '20m', // keep the model resident so consecutive lines don't reload it
          options: chatOptions(temperature)
        }),
        signal: controller.signal
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError')
        throw new Error('Ollama 応答がタイムアウトしました（180秒）。モデルが重すぎる可能性')
      throw new Error(`Ollama に接続できません（${base}）。ollama serve が起動しているか確認してください`)
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(`Ollama HTTP ${res.status}: ${t.slice(0, 200)}`)
    }
    const data = (await res.json()) as { message?: { content?: string } }
    return cleanLine(data.message?.content ?? '')
  }

  const first = await once(0.4)
  if (!looksGarbled(first)) {
    if (!first) throw new Error('モデルが空の応答を返しました')
    return first
  }
  // Language bled through — try once more, calmer. Keep whichever is cleaner.
  const retry = await once(0.25)
  const line = !looksGarbled(retry) ? retry : retry || first
  if (!line) throw new Error('モデルが空の応答を返しました')
  return line
}
