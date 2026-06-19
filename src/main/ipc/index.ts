import { ipcMain, nativeImage } from 'electron'
import { existsSync } from 'fs'
import type {
  CharacterCreateInput,
  CharacterUpdateInput,
  ImageAddInput,
  ImageUpdateInput,
  PreviewResult
} from '@shared/types'
import * as repo from '../db/repo'
import { generateImage } from '../services/novelai'
import { buildReferenceParams, referenceMode } from '../services/reference'
import { mediaUrl, saveImage, thumbKey } from '../services/images'
import { storagePathFor } from '../paths'

type Handler = (...args: never[]) => unknown

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, (_e, ...args) => fn(...(args as never[])))
}

export function registerIpc(): void {
  // characters
  handle('characters:list', () => repo.listCharacters())
  handle('characters:get', (id: number) => repo.getCharacter(id))
  handle('characters:create', (input: CharacterCreateInput) => repo.createCharacter(input))
  handle('characters:update', (id: number, input: CharacterUpdateInput) => repo.updateCharacter(id, input))
  handle('characters:delete', (id: number) => repo.deleteCharacter(id))

  // character images
  handle('characterImages:add', (input: ImageAddInput) => repo.addImages(input))
  handle('characterImages:delete', (imageId: number) => repo.deleteCharacterImage(imageId))
  handle('characterImages:update', (imageId: number, patch: ImageUpdateInput) =>
    repo.updateCharacterImage(imageId, patch)
  )
  handle('characterImages:toggleReference', (imageId: number) => repo.toggleReference(imageId))
  handle('characterImages:reorder', (characterId: number, imageIds: number[]) =>
    repo.reorderCharacterImages(characterId, imageIds)
  )
  handle('characterImages:saveFromPath', (characterId: number, imagePath: string) =>
    repo.saveImageFromPath(characterId, imagePath)
  )

  // Native drag-out of an image file to the OS (Finder / desktop). Uses send
  // (not invoke) because startDrag must run during the renderer's dragstart.
  ipcMain.on('characterImages:dragOut', (e, imagePath: string) => {
    try {
      const file = storagePathFor(imagePath)
      if (!existsSync(file)) return
      let icon = nativeImage.createFromPath(storagePathFor(thumbKey(imagePath)))
      if (icon.isEmpty()) icon = nativeImage.createFromPath(file)
      if (icon.isEmpty()) return
      e.sender.startDrag({ file, icon: icon.resize({ width: 128 }) })
    } catch {
      /* ignore */
    }
  })

  // tags
  handle('tags:list', () => repo.listTags())
  handle('tags:create', (name: string) => repo.createTag(name))
  handle('tags:rename', (id: number, name: string) => repo.renameTag(id, name))
  handle('tags:delete', (id: number) => repo.deleteTag(id))

  // settings
  handle('settings:get', (key: string) => repo.getSetting(key))
  handle('settings:set', (key: string, value: string) => repo.setSetting(key, value))

  // preview (NovelAI test shot)
  handle(
    'preview:run',
    async (characterId: number, situationPrompt?: string): Promise<PreviewResult> => {
      const token = repo.getSetting('NOVELAI_API_TOKEN') ?? ''
      const { prompt, negative_prompt } = repo.characterPrompt(characterId)
      const ref = token
        ? await buildReferenceParams(characterId, prompt, token)
        : { mode: referenceMode(), count: 0 }
      const png = await generateImage({
        token,
        charPrompt: prompt,
        negativePrompt: negative_prompt,
        scenePrompt: situationPrompt ?? '',
        reference: ref.params
      })
      const key = saveImage(`characters/${characterId}/_previews`, png, 'png')
      return {
        image_path: key,
        image_url: mediaUrl(key),
        reference: { mode: ref.mode, count: ref.count }
      }
    }
  )
}
