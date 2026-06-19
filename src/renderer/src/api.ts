import useSWR from 'swr'
import type { Character, CharacterListItem, Tag } from '@shared/types'

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

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
