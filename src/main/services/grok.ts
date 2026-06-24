// Remote LLM (xAI Grok) client for dialogue generation. OpenAI-compatible
// /chat/completions endpoint. Unlike the local novel model, Grok follows
// instructions well, so we do selection + voice restyle in a single call (no
// seed/[INST] tricks needed).
import type { DialogueContext } from './dialogue-types'
import { xaiChat } from './xai'
import { classifyScene, cleanGrokLine } from './grok-format'

export async function generateDialogueGrok(ctx: DialogueContext): Promise<string> {
  // Output mode. Inner monologue (wrapped in （）) when she can't / isn't speaking
  // aloud: when the situation explicitly asks for it, when kissing (mouth busy),
  // or when the mouth is closed in a non-sexual scene. Closed mouth in a sexual
  // scene → nasal moans only. Open/unknown mouth → ~50/50 moans vs moans+words for
  // sexual scenes (coin flip here so it varies per image).
  const { wantsInner, kissing, closedMouth } = classifyScene(ctx)
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
    `口調・話し方はこの設定を参考にする: ${ctx.traits || '（指定なし）'}`,
    `ただし日本語として自然に。主語や相手への呼びかけ（「お兄ちゃん」など）は、入れた方が自然なときだけ使う。日本語で省略するのが自然な主語・目的語は省く。設定の口癖を毎回むりやり詰め込まない。`,
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
  if (ctx.avoid.length) {
    user +=
      `すでに他の画像で使ったセリフ（被らないよう、言い回しも内容も変える）:\n` +
      ctx.avoid.map((a) => `- ${a}`).join('\n') +
      '\n'
  }
  user +=
    `\nこの場面で${ctx.character}がその場でふと口にする自然なセリフを1つだけ書いてください。` +
    `状況の説明や実況ではなく、その瞬間の一言。${ctx.character}の口調で、日本語として自然に。セリフ本文だけを返す。`

  const content = await xaiChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    { maxTokens: 120, temperature: 0.8, timeoutMs: 60_000 }
  )
  const line = cleanGrokLine(content)
  if (!line) throw new Error('Grok が空の応答を返しました（内容がフィルタされた可能性）')
  return line
}
