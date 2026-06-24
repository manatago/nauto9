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
  stories: {
    list: () => invoke('stories:list') as Promise<never>,
    create: (name) => invoke('stories:create', name) as Promise<never>,
    rename: (id, name) => invoke('stories:rename', id, name) as Promise<never>,
    update: (id, patch) => invoke('stories:update', id, patch) as Promise<never>,
    delete: (id) => invoke('stories:delete', id) as Promise<never>,
    reorder: (ids) => invoke('stories:reorder', ids) as Promise<never>
  },
  situations: {
    listByStory: (storyId) => invoke('situations:listByStory', storyId) as Promise<never>,
    listAll: () => invoke('situations:listAll') as Promise<never>,
    get: (id) => invoke('situations:get', id) as Promise<never>,
    create: (input) => invoke('situations:create', input) as Promise<never>,
    update: (id, input) => invoke('situations:update', id, input) as Promise<never>,
    delete: (id) => invoke('situations:delete', id) as Promise<never>,
    reorder: (storyId, ids) => invoke('situations:reorder', storyId, ids) as Promise<never>,
    preview: (id) => invoke('situations:preview', id) as Promise<never>
  },
  tags: {
    list: () => invoke('tags:list') as Promise<never>,
    create: (name) => invoke('tags:create', name) as Promise<never>,
    rename: (id, name) => invoke('tags:rename', id, name) as Promise<never>,
    delete: (id) => invoke('tags:delete', id) as Promise<never>
  },
  situationTags: {
    list: () => invoke('situationTags:list') as Promise<never>,
    create: (name) => invoke('situationTags:create', name) as Promise<never>,
    rename: (id, name) => invoke('situationTags:rename', id, name) as Promise<never>,
    delete: (id) => invoke('situationTags:delete', id) as Promise<never>
  },
  batches: {
    list: () => invoke('batches:list') as Promise<never>,
    create: (input) => invoke('batches:create', input) as Promise<never>,
    createScene: (input) => invoke('batches:createScene', input) as Promise<never>,
    delete: (id) => invoke('batches:delete', id) as Promise<never>,
    download: (id) => invoke('batches:download', id) as Promise<never>,
    generateDialogues: (id) => invoke('batches:generateDialogues', id) as Promise<never>
  },
  generations: {
    regenerate: (id) => invoke('generations:regenerate', id) as Promise<never>,
    imageData: (id) => invoke('generations:imageData', id) as Promise<never>,
    saveImage: (id, dataUrl) => invoke('generations:saveImage', id, dataUrl) as Promise<never>,
    inpaint: (id, maskDataUrl, prompt) =>
      invoke('generations:inpaint', id, maskDataUrl, prompt) as Promise<never>,
    generateDialogue: (id) => invoke('generations:generateDialogue', id) as Promise<never>,
    setDialogue: (id, text) => invoke('generations:setDialogue', id, text) as Promise<never>
  },
  articles: {
    compose: (batchId) => invoke('articles:compose', batchId) as Promise<never>,
    regenerate: (input) => invoke('articles:regenerate', input) as Promise<never>,
    post: (input) => invoke('articles:post', input) as Promise<never>,
    save: (input) => invoke('articles:save', input) as Promise<never>,
    list: () => invoke('articles:list') as Promise<never>,
    get: (id) => invoke('articles:get', id) as Promise<never>,
    delete: (id) => invoke('articles:delete', id) as Promise<never>
  },
  wordpress: {
    test: () => invoke('wordpress:test') as Promise<never>
  },
  novelai: {
    anlas: () => invoke('novelai:anlas') as Promise<never>
  },
  grok: {
    test: () => invoke('grok:test') as Promise<never>
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
