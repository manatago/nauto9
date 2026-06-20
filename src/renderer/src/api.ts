import useSWR from 'swr'
import type { Batch, Character, CharacterListItem, Situation, Story, Tag } from '@shared/types'

export const api = window.api

// Revalidate-only wrapper: never forward an argument to SWR's mutate, otherwise
// a stray `.then(mutate)` would set the resolved value as optimistic cache data
// and corrupt the cached shape (e.g. an array becoming a single object).
type Revalidate = () => Promise<unknown>

export function useCharacters(): {
  data: CharacterListItem[] | undefined
  isLoading: boolean
  mutate: Revalidate
} {
  const { data, isLoading, mutate } = useSWR<CharacterListItem[]>('characters', () =>
    api.characters.list()
  )
  return { data, isLoading, mutate: () => mutate() }
}

export function useCharacter(id: number | null): {
  data: Character | null | undefined
  isLoading: boolean
  mutate: Revalidate
} {
  const { data, isLoading, mutate } = useSWR<Character | null>(
    id == null ? null : ['character', id],
    () => api.characters.get(id as number)
  )
  return { data, isLoading, mutate: () => mutate() }
}

export function useTags(): { data: Tag[] | undefined; mutate: Revalidate } {
  const { data, mutate } = useSWR<Tag[]>('tags', () => api.tags.list())
  return { data, mutate: () => mutate() }
}

export function useStories(): { data: Story[] | undefined; mutate: Revalidate } {
  const { data, mutate } = useSWR<Story[]>('stories', () => api.stories.list())
  return { data, mutate: () => mutate() }
}

// Situation tags are a separate pool from character tags.
export function useSituationTags(): { data: Tag[] | undefined; mutate: Revalidate } {
  const { data, mutate } = useSWR<Tag[]>('situationTags', () => api.situationTags.list())
  return { data, mutate: () => mutate() }
}

// Polls while any batch is still processing/pending so progress updates live.
export function useBatches(): { data: Batch[] | undefined; mutate: Revalidate } {
  const { data, mutate } = useSWR<Batch[]>('batches', () => api.batches.list(), {
    refreshInterval: (latest) =>
      latest?.some(
        (b) => b.status === 'processing' || b.status === 'pending' || b.dialogue_running
      )
        ? 1500
        : 0
  })
  return { data, mutate: () => mutate() }
}

// storyId === null -> all situations across stories (cross-cut view).
export function useSituations(storyId: number | null): {
  data: Situation[] | undefined
  mutate: Revalidate
} {
  const { data, mutate } = useSWR<Situation[]>(['situations', storyId ?? 'all'], () =>
    storyId == null ? api.situations.listAll() : api.situations.listByStory(storyId)
  )
  return { data, mutate: () => mutate() }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
