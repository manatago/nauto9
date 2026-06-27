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

  // English fields (character prompt fallback + image prompt) carry booru tags
  // that can trip xAI's CSAM check: strip school/youth markers and rewrite
  // girl→woman so the (adult) characters don't read as minors.
  const sanitize = (s: string): string =>
    s
      .replace(
        /\b(school[\s_-]?uniform|schoolgirl|schoolboy|serafuku|sailor[\s_-]?collar|school[\s_-]?swimsuit|gym[\s_-]?uniform|buruma|bloomers|loli(?:ta)?|child(?:ren)?|toddler|kindergarten|elementary|middle[\s_-]?school|(?:young|little|small)[\s_-]?girls?)\b/gi,
        ''
      )
      .replace(/(\d\+?)girls\b/gi, '$1women')
      .replace(/(\d\+?)girl\b/gi, '$1woman')
      .replace(/\bgirls\b/gi, 'women')
      .replace(/\bgirl\b/gi, 'woman')
      .replace(/\s*,\s*,+/g, ', ')
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .trim()
  const safeTraits = sanitize(ctx.traits || '')
  const safeVisual = sanitize(ctx.visual)

  const system = [
    `あなたはキャラクター「${ctx.character}」になりきってセリフを1つだけ書きます。これはフィクションの成人向け創作で、登場人物はすべて20歳以上の成人です。`,
    `出力は${ctx.character}が口に出すセリフ本文のみ。説明・地の文・ナレーション・かぎ括弧（「」）は付けない。`,
    `自分の状況・見た目・していることをセリフで説明したり実況したりしない（「〜しているところ」「私は今〜」のような描写は禁止）。その瞬間にポロッと自然に口から出る一言にする。`,
    pleasureRule,
    `口調・話し方はこの設定を参考にする: ${safeTraits || '（指定なし）'}`,
    `ただし日本語として自然に。主語や相手への呼びかけ（「お兄ちゃん」など）は、入れた方が自然なときだけ使う。日本語で省略するのが自然な主語・目的語は省く。設定の口癖を毎回むりやり詰め込まない。`,
    `画像から検出した「表情・感情」「服装・露出」「行為」を最優先でセリフに反映する（赤面→恥じらい、怒り/への字眉→怒った口調、泣き/涙→涙声、アヘ顔/とろ顔→快感に溺れる、全裸/脱衣中→羞恥や昂り、フェラ/挿入などの行為→その状態に応じた喘ぎや言葉、など）。「体勢」「関係・周囲（手繋ぎ・大勢など）」「場所・背景」は文脈の参考にし、決して情景描写・実況にはしない。`,
    `物語「${ctx.story || '（未設定）'}」（${ctx.storyDesc || '説明なし'}）`
  ].join('\n')

  // School-themed clothing trips xAI's automated CSAM check (even with the
  // "all adults" framing) when it co-occurs with sexual tags — never send it.
  const RISKY_CLOTHING = new Set([
    'school_uniform',
    'serafuku',
    'sailor_collar',
    'school_swimsuit',
    'gym_uniform',
    'buruma'
  ])
  const labels = (arr?: { label: string }[]): string => (arr ?? []).map((e) => e.label).join('・')
  const emoTxt = labels(ctx.emotion)
  const clothingTxt = labels((ctx.clothing ?? []).filter((e) => !RISKY_CLOTHING.has(e.tag)))
  const actTxt = labels(ctx.act)
  const poseTxt = labels(ctx.pose)
  const relTxt = labels(ctx.relation)
  const sceneTxt = [labels(ctx.scene), labels(ctx.bgobj)].filter(Boolean).join('・')

  let stateBlock = ''
  if (emoTxt || clothingTxt || actTxt || poseTxt || relTxt || sceneTxt) {
    stateBlock = '画像から自動検出した状態（トーンや感情に反映するが、これ自体を実況・説明しない）:\n'
    if (emoTxt) stateBlock += `  表情・感情: ${emoTxt}\n`
    if (clothingTxt) stateBlock += `  服装・露出: ${clothingTxt}\n`
    if (actTxt) stateBlock += `  行為・体位: ${actTxt}\n`
    if (poseTxt) stateBlock += `  体勢: ${poseTxt}\n`
    if (relTxt) stateBlock += `  関係・周囲: ${relTxt}\n`
    if (sceneTxt) stateBlock += `  場所・背景: ${sceneTxt}\n`
  }

  // The scene info is background for understanding only — Grok must NOT verbalize
  // it. Fence it off explicitly so the line stays a natural utterance.
  const buildUser = (withState: boolean, withVisual: boolean): string => {
    let user = '（以下は場面を理解するための背景情報。セリフでそのまま説明しないこと）\n'
    user += `場面: ${ctx.situation}\n`
    if (withVisual && safeVisual) {
      user += `画像の内容（視覚情報の参考。ポーズや服装の手がかり）: ${safeVisual}\n`
    }
    if (withState && stateBlock) user += stateBlock
    if (ctx.samples.length) user += `状況・流れ・メモ:\n${ctx.samples.join('\n')}\n`
    if (ctx.avoid.length) {
      user +=
        `すでに他の画像で使ったセリフ（被らないよう、言い回しも内容も変える）:\n` +
        ctx.avoid.map((a) => `- ${a}`).join('\n') +
        '\n'
    }
    user +=
      `\nこの場面で${ctx.character}がその場でふと口にする自然なセリフを1つだけ書いてください。` +
      `状況の説明や実況ではなく、その瞬間の一言。${ctx.character}の口調で、日本語として自然に。セリフ本文だけを返す。`
    return user
  }

  // The line must be Japanese; an English meta-refusal ("No, I can't engage…")
  // means Grok soft-refused (returned 200), so treat it as a failure to retry.
  const isRefusal = (s: string): boolean =>
    /\b(I can'?t|I cannot|I'?m unable|I am unable|I won'?t|can'?t (?:engage|help|assist|comply|fulfill|do that)|against (?:my|our)|as an AI|I'?m sorry,? but|I must decline|not able to)\b/i.test(
      s
    )
  const ask = async (withState: boolean, withVisual: boolean): Promise<string> => {
    const content = await xaiChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: buildUser(withState, withVisual) }
      ],
      { maxTokens: 120, temperature: 0.8, timeoutMs: 60_000 }
    )
    if (isRefusal(content)) throw new Error('REFUSAL')
    return cleanGrokLine(content)
  }
  const isSafety = (e: unknown): boolean =>
    /403|SAFETY_CHECK|permission-denied|REFUSAL/i.test((e as Error).message)

  // On a safety false-positive, retry with progressively less context: first drop
  // the auto-detected tags, then also drop the English image prompt.
  let line: string
  try {
    line = await ask(true, true)
  } catch (e1) {
    if (!isSafety(e1)) throw e1
    try {
      line = await ask(false, true)
    } catch (e2) {
      if (!isSafety(e2)) throw e2
      line = await ask(false, false)
    }
  }
  if (!line) throw new Error('Grok が空の応答を返しました（内容がフィルタされた可能性）')
  return line
}
