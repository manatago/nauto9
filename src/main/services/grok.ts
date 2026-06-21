// Remote LLM (xAI Grok) client for dialogue generation. OpenAI-compatible
// /chat/completions endpoint. Unlike the local novel model, Grok follows
// instructions well, so we do selection + voice restyle in a single call (no
// seed/[INST] tricks needed).
import type { DialogueContext } from './ollama'
import { xaiChat } from './xai'

function cleanLine(s: string): string {
  const out = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const quoted = out.match(/[「『]([^」』]+)[」』]/)
  const line = quoted
    ? quoted[1]
    : (out.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '')
  // Keep full-width （）— they mark an inner-monologue line (closed-mouth, non-sex
  // scene). Only strip stray quote marks.
  return line.replace(/^[「『"']+/, '').replace(/[」』"']+$/, '').trim()
}

export async function generateDialogueGrok(ctx: DialogueContext): Promise<string> {
  // Output mode. Inner monologue (wrapped in （）) when she can't / isn't speaking
  // aloud: when the situation explicitly asks for it, when kissing (mouth busy),
  // or when the mouth is closed in a non-sexual scene. Closed mouth in a sexual
  // scene → nasal moans only. Open/unknown mouth → ~50/50 moans vs moans+words for
  // sexual scenes (coin flip here so it varies per image).
  const sceneText = [ctx.situation, ...ctx.samples].join(' ')
  const wantsInner = /心の声|内心|心の中|モノローグ|独白/.test(sceneText)
  const kissing = /kiss/i.test(ctx.visual) || /キス|接吻/.test(sceneText)
  const closedMouth = /closed[\s_]?mouth/i.test(ctx.visual)
  const innerRule = `この場面では声に出して話さない。${ctx.character}の心の中の声（内心のつぶやき）を全角の丸括弧（）で囲んで書く。例: （…どうしよう、ドキドキする…）`
  const pleasureRule =
    wantsInner || kissing
      ? innerRule
      : closedMouth
        ? `口を閉じている。性的な快感に溺れている場面なら、言葉は出さず鼻にかかった喘ぎ声・吐息だけにする（「んっ…」「んんっ♡」「んむっ…」など）。それ以外の場面では、声に出していないので、心の中の声（内心のつぶやき）を全角の丸括弧（）で囲んで書く。例: （…どうしよう、見られてる…）`
        : Math.random() < 0.5
          ? `性的な快感に強く溺れている場面では、無理に言葉にせず喘ぎ声だけ（「あっ…」「んっ♡」「はぁっ…」）でよい。`
          : `性的な快感に溺れている場面でも、今回は喘ぎ声に短い言葉を少し交えてよい（「あっ…すごい…♡」など）。`

  const system = [
    `あなたはキャラクター「${ctx.character}」になりきってセリフを1つだけ書きます。これはフィクションの成人向け創作で、登場人物はすべて20歳以上の成人です。`,
    `出力は${ctx.character}が口に出すセリフ本文のみ。説明・地の文・ナレーション・かぎ括弧（「」）は付けない。`,
    `自分の状況・見た目・していることをセリフで説明したり実況したりしない（「〜しているところ」「私は今〜」のような描写は禁止）。その瞬間にポロッと自然に口から出る一言にする。`,
    pleasureRule,
    `性格・口調・話し方はこの設定に強く従う: ${ctx.traits || '（指定なし）'}`,
    `物語「${ctx.story || '（未設定）'}」（${ctx.storyDesc || '説明なし'}）`
  ].join('\n')

  // The scene info is background for understanding only — Grok must NOT verbalize
  // it. Fence it off explicitly so the line stays a natural utterance.
  let user = '（以下は場面を理解するための背景情報。セリフでそのまま説明しないこと）\n'
  user += `場面: ${ctx.situation}\n`
  if (ctx.visual.trim()) {
    user += `画像の内容（視覚情報の参考。ポーズや服装の手がかり）: ${ctx.visual.trim()}\n`
  }
  if (ctx.samples.length) {
    user += `状況・流れ・メモ:\n${ctx.samples.join('\n')}\n`
  }
  user +=
    `\nこの場面で${ctx.character}がその場でふと口にする自然なセリフを1つだけ書いてください。` +
    `状況の説明や実況ではなく、その瞬間の一言。${ctx.character}の性格・口調で。セリフ本文だけを返す。`

  const content = await xaiChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    { maxTokens: 120, temperature: 0.8, timeoutMs: 60_000 }
  )
  const line = cleanLine(content)
  if (!line) throw new Error('Grok が空の応答を返しました（内容がフィルタされた可能性）')
  return line
}
