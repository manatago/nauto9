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
  order_index: number
  situation_count: number
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
  preview_image_path: string | null
  preview_image_url: string | null // media:// (derived); the row background
  created_at: string
  updated_at: string
}

export interface StoryUpdateInput {
  name?: string
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
  image_path: string | null
  image_url: string | null
  thumbnail_url: string | null
  status: GenerationStatus
  error: string | null
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
  status: BatchStatus
  total: number
  done_count: number
  success_count: number
  created_at: string
  updated_at: string
  generations: Generation[]
}

// "story" batch: one character × every situation in a story (in order).
export interface BatchCreateInput {
  character_id: number
  story_id: number
  name?: string
}

// "scene" batch: selected situations × every character carrying a tag.
export interface SceneBatchCreateInput {
  story_id: number
  situation_ids: number[]
  character_tag_id: number
  name?: string
}

export interface SituationCreateInput {
  story_id: number
  name?: string
  prompt?: string
  negative_prompt?: string
  aspect_ratio?: AspectRatio
  tag_ids?: number[]
}

export interface SituationUpdateInput {
  story_id?: number
  name?: string
  prompt?: string
  negative_prompt?: string
  aspect_ratio?: AspectRatio
  tag_ids?: number[]
}

// ---- IPC payloads ----

export interface CharacterCreateInput {
  name: string
  prompt: string
  negative_prompt?: string
  prompt_replacements?: PromptReplacement[]
  memo?: string
  tag_ids?: number[]
}

export interface CharacterUpdateInput {
  name?: string
  prompt?: string
  negative_prompt?: string
  prompt_replacements?: PromptReplacement[]
  memo?: string
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
  }
  generations: {
    regenerate(id: number): Promise<Generation> // re-run the same character × situation
    imageData(id: number): Promise<string> // data: URL (clean for canvas editing)
    saveImage(id: number, dataUrl: string): Promise<Generation> // save edited (mosaic) image
  }
  settings: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
  }
  preview: {
    run(characterId: number, situationPrompt?: string): Promise<PreviewResult>
  }
}

export const REFERENCE_LIMIT = 5
