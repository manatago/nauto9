import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '@shared/types'

const invoke = (channel: string, ...args: unknown[]): Promise<unknown> =>
  ipcRenderer.invoke(channel, ...args)

const api: Api = {
  characters: {
    list: () => invoke('characters:list') as Promise<never>,
    get: (id) => invoke('characters:get', id) as Promise<never>,
    create: (input) => invoke('characters:create', input) as Promise<never>,
    update: (id, input) => invoke('characters:update', id, input) as Promise<never>,
    delete: (id) => invoke('characters:delete', id) as Promise<never>
  },
  characterImages: {
    add: (input) => invoke('characterImages:add', input) as Promise<never>,
    delete: (imageId) => invoke('characterImages:delete', imageId) as Promise<never>,
    update: (imageId, patch) => invoke('characterImages:update', imageId, patch) as Promise<never>,
    toggleReference: (imageId) => invoke('characterImages:toggleReference', imageId) as Promise<never>,
    reorder: (characterId, imageIds) =>
      invoke('characterImages:reorder', characterId, imageIds) as Promise<never>,
    saveFromPath: (characterId, imagePath) =>
      invoke('characterImages:saveFromPath', characterId, imagePath) as Promise<never>,
    dragOut: (imagePath) => ipcRenderer.send('characterImages:dragOut', imagePath)
  },
  tags: {
    list: () => invoke('tags:list') as Promise<never>,
    create: (name) => invoke('tags:create', name) as Promise<never>,
    rename: (id, name) => invoke('tags:rename', id, name) as Promise<never>,
    delete: (id) => invoke('tags:delete', id) as Promise<never>
  },
  settings: {
    get: (key) => invoke('settings:get', key) as Promise<never>,
    set: (key, value) => invoke('settings:set', key, value) as Promise<never>
  },
  preview: {
    run: (characterId, situationPrompt) =>
      invoke('preview:run', characterId, situationPrompt) as Promise<never>
  }
}

contextBridge.exposeInMainWorld('api', api)
