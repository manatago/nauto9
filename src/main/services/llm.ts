// Generic LLM text generation (title / intro / chapter blurbs for articles) via Grok.
import { xaiChat } from './xai'

export function generateText(system: string, user: string, maxTokens = 400): Promise<string> {
  return xaiChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    { maxTokens }
  ).then((s) => s.trim())
}
