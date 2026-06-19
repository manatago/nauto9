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
  tags: {
    list(): Promise<Tag[]>
    create(name: string): Promise<Tag>
    rename(id: number, name: string): Promise<Tag>
    delete(id: number): Promise<void>
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
