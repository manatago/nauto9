// Shared domain types used across main / preload / renderer.
//
// Simple model: a character is a single prompt + tags + reference images.

export interface PromptReplacement {
  find: string
  replace: string
}

export interface Tag {
  id: number
  name: string
}

export interface CharacterImage {
  id: number
  character_id: number
  image_path: string
  image_url: string // media:// url (derived)
  thumbnail_url: string // media:// url (derived)
  caption: string | null
  is_reference_enabled: boolean
  is_grayscale: boolean
  order_index: number
  created_at: string
}

export interface Character {
  id: number
  name: string
  prompt: string
  negative_prompt: string
  prompt_replacements: PromptReplacement[]
  memo: string
  persona: string // personality / speech style — fed to the LLM for dialogue
  tags: Tag[]
  images: CharacterImage[]
  created_at: string
  updated_at: string
}

// Lightweight row for list views.
export interface CharacterListItem {
  id: number
  name: string
  tags: Tag[]
  image_count: number
  thumbnail_url: string | null
  created_at: string
  updated_at: string
}

export interface PreviewResult {
  image_path: string
  image_url: string
  reference: { mode: 'none' | 'vibe' | 'precise'; count: number }
}

// ---- stories & situations ----

export type AspectRatio = 'portrait' | 'square' | 'landscape'

export interface Story {
  id: number
  name: string
  description: string // story setting/context (fed to the LLM for dialogue)
  order_index: number
  situation_count: number
  thumbnail_url: string | null // first situation's preview image (representative)
  created_at: string
}

export interface Situation {
  id: number
  story_id: number
  name: string // `xxx` is replaced by the character name at generation time
  prompt: string
  negative_prompt: string
  aspect_ratio: AspectRatio
  order_index: number
  tags: Tag[] // from the situation tag pool (separate from character tags)
  dialogue_samples: string // newline-separated example lines (few-shot tone for dialogue)
  preview_image_path: string | null
  preview_image_url: string | null // media:// (derived); the row background
  created_at: string
  updated_at: string
}

export interface StoryUpdateInput {
  name?: string
  description?: string
}

// ---- batches & generations ----

export type BatchStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
export type GenerationStatus = 'pending' | 'success' | 'failed'
export type BatchType = 'story' | 'scene'

export interface Generation {
  id: number
  batch_id: number
  situation_id: number | null
  character_id: number | null
  seq: number
  situation_name: string
  character_name: string
  dialogue: string // LLM-generated line the character says in this scene
  image_path: string | null
  image_url: string | null
  thumbnail_url: string | null
  status: GenerationStatus
  error: string | null
  has_original: boolean // a pre-edit original is backed up (mosaic/inpaint can be reverted)
  created_at: string
}

export interface Batch {
  id: number
  name: string
  type: BatchType
  character_id: number | null
  story_id: number | null
  character_tag_id: number | null
  character_name: string
  story_name: string
  character_tag_name: string
  prefix_prompt: string // prepended to every situation prompt in this batch
  status: BatchStatus
  total: number
  done_count: number
  success_count: number
  dialogue_running: boolean // dialogue generation in progress (background)
  dialogue_count: number // generations that already have a dialogue line
  created_at: string
  updated_at: string
  generations: Generation[]
}

// "story" batch: one character × every situation in a story (in order).
export interface BatchCreateInput {
  character_id: number
  story_id: number
  name?: string
  prefix_prompt?: string
}

// "scene" batch: selected situations × an explicit set of characters (picked
// manually and/or bulk-selected by tag in the UI).
export interface SceneBatchCreateInput {
  story_id: number
  situation_ids: number[]
  character_ids: number[]
  name?: string
  prefix_prompt?: string
}

export interface SituationCreateInput {
  story_id: number
  name?: string
  prompt?: string
  negative_prompt?: string
  aspect_ratio?: AspectRatio
  dialogue_samples?: string
  tag_ids?: number[]
}

export interface SituationUpdateInput {
  story_id?: number
  name?: string
  prompt?: string
  negative_prompt?: string
  aspect_ratio?: AspectRatio
  dialogue_samples?: string
  tag_ids?: number[]
}

// ---- NSFW part detection (auto-mosaic suggestions) ----

export type CensorLabel = 'nipple_f' | 'penis' | 'pussy'

// A detected region in ORIGINAL image pixel coordinates.
export interface CensorBox {
  x0: number
  y0: number
  x1: number
  y1: number
  label: CensorLabel
  score: number
}

// ---- articles (WordPress draft composition) ----

export type ArticleBlockKind = 'h2' | 'chapterDesc' | 'dialogue' | 'image' | 'customHtml'

export interface ArticleBlock {
  id: string
  kind: ArticleBlockKind
  text: string // h2 / chapterDesc / dialogue text; '' for image
  generation_id: number | null // dialogue & image
  image_url: string | null // image (media:// url)
  situation_id: number | null // h2 / chapterDesc — for regeneration context
}

// h3 heading source: the dialogue line, or the image name (situation name).
export type H3Mode = 'dialogue' | 'imageName'

export interface Article {
  batch_id: number | null
  title: string
  intro: string
  h3_mode: H3Mode
  blocks: ArticleBlock[]
}

export interface ArticleRegenInput {
  batch_id: number
  target: 'title' | 'intro' | 'h2' | 'chapterDesc'
  situation_id?: number | null // required for h2 / chapterDesc
}

// One image to upload (already converted to webp in the renderer via canvas).
export interface ArticleImageUpload {
  generation_id: number
  data_url: string // webp data: URL
  filename: string
}

export interface ArticlePostInput {
  title: string
  intro: string
  h3_mode: H3Mode
  blocks: ArticleBlock[] // edited text/structure
  images: ArticleImageUpload[]
}

export interface ArticlePostResult {
  id: number
  link: string // the draft's edit/preview link
}

export interface SavedArticle {
  id: number
  batch_id: number | null
  title: string
  intro: string
  h3_mode: H3Mode
  blocks: ArticleBlock[]
  created_at: string
  updated_at: string
}

export interface ArticleListItem {
  id: number
  batch_id: number | null
  title: string
  updated_at: string
}

export interface ArticleSaveInput {
  id?: number // update when present, else create
  batch_id: number | null
  title: string
  intro: string
  h3_mode: H3Mode
  blocks: ArticleBlock[]
}

export interface WpTestResult {
  ok: boolean
  name: string // the authenticated user's display name
}

// ---- IPC payloads ----

export interface CharacterCreateInput {
  name: string
  prompt: string
  negative_prompt?: string
  prompt_replacements?: PromptReplacement[]
  memo?: string
  persona?: string
  tag_ids?: number[]
}

export interface CharacterUpdateInput {
  name?: string
  prompt?: string
  negative_prompt?: string
  prompt_replacements?: PromptReplacement[]
  memo?: string
  persona?: string
  tag_ids?: number[]
}

export interface ImageAddInput {
  character_id: number
  files: { name: string; dataUrl: string }[]
}

export interface ImageUpdateInput {
  caption?: string | null
  is_grayscale?: boolean
}

// The typed bridge exposed on window.api
export interface Api {
  characters: {
    list(): Promise<CharacterListItem[]>
    get(id: number): Promise<Character | null>
    create(input: CharacterCreateInput): Promise<Character>
    update(id: number, input: CharacterUpdateInput): Promise<Character>
    delete(id: number): Promise<void>
  }
  characterImages: {
    add(input: ImageAddInput): Promise<CharacterImage[]>
    delete(imageId: number): Promise<void>
    update(imageId: number, patch: ImageUpdateInput): Promise<CharacterImage>
    toggleReference(imageId: number): Promise<CharacterImage>
    reorder(characterId: number, imageIds: number[]): Promise<void>
    saveFromPath(characterId: number, imagePath: string): Promise<CharacterImage>
    // Start a native OS drag of the image file (drag out to Finder/desktop).
    dragOut(imagePath: string): void
  }
  stories: {
    list(): Promise<Story[]>
    create(name: string): Promise<Story>
    rename(id: number, name: string): Promise<Story>
    update(id: number, patch: StoryUpdateInput): Promise<Story> // name / description
    delete(id: number): Promise<void>
    reorder(ids: number[]): Promise<void>
  }
  situations: {
    listByStory(storyId: number): Promise<Situation[]>
    listAll(): Promise<Situation[]>
    get(id: number): Promise<Situation | null>
    create(input: SituationCreateInput): Promise<Situation>
    update(id: number, input: SituationUpdateInput): Promise<Situation>
    delete(id: number): Promise<void>
    reorder(storyId: number, ids: number[]): Promise<void>
    // Test shot: generate with a RANDOM registered character's prompt + this
    // situation, save the result as the situation's background image.
    preview(id: number): Promise<Situation>
  }
  // Character tag pool.
  tags: {
    list(): Promise<Tag[]>
    create(name: string): Promise<Tag>
    rename(id: number, name: string): Promise<Tag>
    delete(id: number): Promise<void>
  }
  // Situation tag pool (separate namespace from character tags).
  situationTags: {
    list(): Promise<Tag[]>
    create(name: string): Promise<Tag>
    rename(id: number, name: string): Promise<Tag>
    delete(id: number): Promise<void>
  }
  batches: {
    list(): Promise<Batch[]> // newest first, each with its generations
    create(input: BatchCreateInput): Promise<Batch> // story type
    createScene(input: SceneBatchCreateInput): Promise<Batch> // scene × tag type
    delete(id: number): Promise<void>
    download(id: number): Promise<{ saved: string | null }> // ZIP via save dialog
    generateDialogues(id: number): Promise<void> // background; poll list for progress
  }
  generations: {
    regenerate(id: number): Promise<Generation> // re-run the same character × situation
    imageData(id: number): Promise<string> // data: URL (clean for canvas editing)
    saveImage(id: number, dataUrl: string): Promise<Generation> // save edited (mosaic) image
    inpaint(id: number, maskDataUrl: string, prompt: string): Promise<Generation> // redraw masked region
    detectCensor(id: number, opts?: { conf?: number; pad?: number }): Promise<CensorBox[]> // suggest genital mosaic regions
    restoreOriginal(id: number): Promise<Generation> // revert to the pre-edit (pre-mosaic) original
    generateDialogue(id: number): Promise<Generation> // LLM line for one image
    setDialogue(id: number, text: string): Promise<Generation> // manual edit
  }
  // Compose / preview a WordPress draft from a batch (posting comes later).
  articles: {
    compose(batchId: number): Promise<Article> // LLM title/intro + chapters + dialogue/image blocks
    regenerate(input: ArticleRegenInput): Promise<string> // re-generate one text block
    post(input: ArticlePostInput): Promise<ArticlePostResult> // upload webp media + create a draft
    save(input: ArticleSaveInput): Promise<SavedArticle> // persist for later editing/posting
    list(): Promise<ArticleListItem[]> // saved drafts, newest first
    get(id: number): Promise<SavedArticle | null> // with image URLs refreshed
    delete(id: number): Promise<void>
  }
  wordpress: {
    test(): Promise<WpTestResult> // verify site URL + credentials
  }
  novelai: {
    anlas(): Promise<number> // remaining Anlas for the account
  }
  grok: {
    test(): Promise<{ name: string }> // validate the API key
  }
  settings: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
  }
  // Whole-library backup: bundle DB + images into a zip, or restore from one.
  backup: {
    export(): Promise<{ saved: string | null }> // null when the user cancels
    import(): Promise<{ imported: boolean }> // app relaunches/exits on success
  }
  preview: {
    run(characterId: number, situationPrompt?: string): Promise<PreviewResult>
  }
}

export const REFERENCE_LIMIT = 5
