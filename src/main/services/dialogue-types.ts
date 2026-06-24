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
}
