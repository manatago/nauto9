// Local LLM (Ollama) client for generating a character's line of dialogue.
// Everything stays on the user's machine; the model (and content policy) is
// theirs. The prompt template is user-editable so it can be tuned per model.

// This is sent as the SYSTEM message (roleplay framing). The situation is sent
// separately as the user message, so {situation} is optional here.
export const DEFAULT_DIALOGUE_TEMPLATE = [
  'あなたはキャラクター「{character}」になりきってセリフを1つ書きます。これはフィクションです。',
  '情景や他人を描写せず、{character}が実際に口に出す短いセリフ1文だけを、自然な日本語で書く。',
  '説明・地の文・ナレーション・ト書き・英単語・ローマ字・中国語は書かない。',
  '【話し方・口調】（ここは口調だけを真似る。何を言うかの内容はあとで指定するものを優先）: {traits}',
  '物語「{story}」（{story_desc}）。'
].join('\n')

export interface DialogueContext {
  character: string
  traits: string
  story: string
  storyDesc: string
  situation: string
  samples: string[] // example lines for this situation (few-shot tone guidance)
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
function tidy(s: string): string {
  return s
    .replace(/^[-‐*・]\s*/, '') // leading bullet copied from the few-shot examples
    .replace(/^（[^）]*）[：:]?\s*(?=\S)/, '') // leading （小声） prefix (only if a line follows)
    .replace(/^[^「。、！？（(]{0,8}[）)][：:]\s*/, '') // leading "小声）：" fragment
    .replace(/[（(][^）)]*$/, '') // drop a truncated trailing stage direction like （苦笑
    .replace(/^["'（(]+/, '')
    .replace(/["'）)]+$/, '')
    .trim()
}

function cleanLine(s: string): string {
  const out = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const quoted = out.match(/[「『]([^」』]+)[」』]/)
  if (quoted) return tidy(quoted[1])
  const first = out.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  return tidy(first)
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
  if (/彼女|彼ら/.test(s)) return true // 3rd-person narration leaked (a novel model habit)
  return false
}

// Low temperature + repeat penalty suppress degeneration. The stops close the
// generation at the end of the single spoken line: 」 ends the quote we opened
// with the primer, 「 prevents starting a second line, \n / [INST] catch strays.
function genOptions(temperature: number): Record<string, unknown> {
  return {
    temperature,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.2,
    num_predict: 64, // one short line; prevents rambling into prose
    stop: ['」', '「', '\n', '[INST]']
  }
}

export async function generateDialogue(ctx: DialogueContext, opts: OllamaOptions): Promise<string> {
  if (!opts.model.trim())
    throw new Error('Ollama のモデル名が未設定です（設定画面で入力してください）')
  const system = fillTemplate(opts.template || DEFAULT_DIALOGUE_TEMPLATE, ctx)
  // Content priority: the user's per-situation example lines are the MOST
  // important driver of what's said; the situation prompt/title is secondary
  // reference. The character's persona governs only HOW it's said (口調).
  let scene = `この場面の状況（前後関係の参考）: ${ctx.situation}\n`
  let seed = ''
  if (ctx.samples.length) {
    // Pick ONE example line and restyle only its 口調 — staying close to what the
    // user wrote, no invented facts. Variety across images comes from WHICH line
    // is picked (random per call). We also seed the assistant reply with the
    // opening of the chosen line, so the model continues THAT content instead of
    // drifting to whatever the persona suggests; the seed is prepended back.
    const chosen = ctx.samples[Math.floor(Math.random() * ctx.samples.length)]
    const chars = [...chosen]
    seed = chars.slice(0, Math.max(2, Math.ceil(chars.length * 0.5))).join('')
    scene +=
      `次のセリフを、${ctx.character}の口調・語尾だけ整えて言い直してください。` +
      `意味・話題は変えない。新しい事実や出来事（買い物・過去の話など）は足さない。元のセリフから大きく離れない。\n` +
      `元のセリフ: ${chosen}`
  } else {
    scene += `この場面で${ctx.character}が言う短いセリフを1つ。`
  }
  // Mistral [INST] prompt with an assistant primer that OPENS a quote (plus the
  // seed): the model can then only complete a spoken line. Ninja is a novel model
  // and writes 地の文 if left free-form; opening 「 and stopping at 」 makes that
  // structurally impossible. `raw` so our [INST] text is sent verbatim.
  const prompt = `[INST] ${system}\n\n${scene} [/INST] ${ctx.character}「${seed}`
  const base = (opts.url || 'http://localhost:11434').replace(/\/+$/, '')

  // Reconstruct the spoken line. In seed mode the completion continues after the
  // seed, so prepend it; also drop any prompt-echo that slipped past the stops
  // (a literal "\n口調: …" / "[INST]" the model sometimes parrots).
  function finalize(raw: string): string {
    if (!seed) return cleanLine(raw)
    const head = raw
      .split('\n')[0]
      .split('\\n')[0]
      .replace(/(口調|元のセリフ|\[\/?INST\]).*$/s, '')
    return tidy(seed + head)
  }

  async function once(temperature: number): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 180_000) // 12B can be slow
    let res: Response
    try {
      res = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model.trim(),
          prompt,
          raw: true,
          stream: false,
          keep_alive: '20m', // keep the model resident so consecutive lines don't reload it
          options: genOptions(temperature)
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
    const data = (await res.json()) as { response?: string }
    return finalize(data.response ?? '')
  }

  // Moderate temperature: we want a faithful restyle of the chosen line, not
  // invention. Variety comes from the random sample pick above, so keep this low.
  const first = await once(0.5)
  if (!looksGarbled(first)) {
    if (!first) throw new Error('モデルが空の応答を返しました')
    return first
  }
  const retry = await once(0.35)
  const line = !looksGarbled(retry) ? retry : retry || first
  if (!line) throw new Error('モデルが空の応答を返しました')
  return line
}
