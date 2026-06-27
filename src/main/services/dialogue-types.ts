import type { EmotionTag } from '@shared/types'

// Context assembled for one image's dialogue generation.
export interface DialogueContext {
  character: string
  traits: string // personality / speech style
  story: string
  storyDesc: string
  situation: string
  visual: string // the situation's image prompt (pose/clothing/composition)
  samples: string[] // per-situation example lines / notes
  avoid: string[] // lines already used elsewhere in the batch — don't repeat
  // Detected from the image (WD14, local) — informs the line's tone/emotion.
  emotion?: EmotionTag[] // facial expression (from the face crop)
  pose?: EmotionTag[] // body pose
  scene?: EmotionTag[] // location / background
}
