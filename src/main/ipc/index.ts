import { BrowserWindow, dialog, ipcMain, nativeImage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { zipSync } from 'fflate'
import type {
  CharacterCreateInput,
  CharacterUpdateInput,
  ImageAddInput,
  ImageUpdateInput,
  PreviewResult,
  SituationCreateInput,
  SituationUpdateInput
} from '@shared/types'
import * as repo from '../db/repo'
import * as sit from '../db/situations'
import * as batchRepo from '../db/batches'
import { enqueueBatch, regenerateGeneration } from '../services/batch'
import { enqueueDialogues, generateDialogueForGeneration } from '../services/dialogue'
import { composeArticle, regenerateArticleBlock } from '../services/article'
import { postArticleToWordpress } from '../services/article-post'
import * as articleRepo from '../db/articles'
import { testConnection, wpConfigFrom } from '../services/wordpress'
import { testApiKey } from '../services/xai'
import { generateImage, getAnlas, inpaint } from '../services/novelai'
import { buildReferenceParams, referenceMode } from '../services/reference'
import { decodeDataUrl, mediaUrl, saveImage, saveImageWithName, thumbKey } from '../services/images'
import { applyCharacterReplacements, replaceXxx, stripEyeTagsIfClosed } from '../services/prompt'
import { generationKey, safeArcName, slug } from '../services/naming'
import { storagePathFor } from '../paths'
import { posix } from 'path'
import type {
  ArticlePostInput,
  ArticleRegenInput,
  ArticleSaveInput,
  BatchCreateInput,
  SceneBatchCreateInput
} from '@shared/types'

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

  // stories
  handle('stories:list', () => sit.listStories())
  handle('stories:create', (name: string) => sit.createStory(name))
  handle('stories:rename', (id: number, name: string) => sit.renameStory(id, name))
  handle('stories:update', (id: number, patch) => sit.updateStory(id, patch))
  handle('stories:delete', (id: number) => sit.deleteStory(id))
  handle('stories:reorder', (ids: number[]) => sit.reorderStories(ids))

  // situations
  handle('situations:listByStory', (storyId: number) => sit.listSituationsByStory(storyId))
  handle('situations:listAll', () => sit.listAllSituations())
  handle('situations:get', (id: number) => sit.getSituation(id))
  handle('situations:create', (input: SituationCreateInput) => sit.createSituation(input))
  handle('situations:update', (id: number, input: SituationUpdateInput) =>
    sit.updateSituation(id, input)
  )
  handle('situations:delete', (id: number) => sit.deleteSituation(id))
  handle('situations:reorder', (storyId: number, ids: number[]) =>
    sit.reorderSituations(storyId, ids)
  )

  // Situation test shot: random character's prompt + this situation -> save as
  // the situation's background image.
  handle('situations:preview', async (situationId: number) => {
    const s = sit.getSituation(situationId)
    if (!s) throw new Error('situation not found')
    const ch = repo.randomCharacter()
    if (!ch) throw new Error('登録されているキャラクターがありません')
    const token = repo.getSetting('NOVELAI_API_TOKEN') ?? ''
    let scene = replaceXxx(s.prompt, ch.name)
    scene = applyCharacterReplacements(scene, ch.prompt_replacements)
    const negative = [s.negative_prompt, ch.negative_prompt].filter((x) => x.trim()).join(', ')
    const png = await generateImage({
      token,
      charPrompt: stripEyeTagsIfClosed(ch.prompt, scene),
      scenePrompt: scene,
      negativePrompt: negative,
      aspect: s.aspect_ratio
    })
    const key = saveImage(`situations/${situationId}`, png, 'png')
    return sit.setSituationPreviewPath(situationId, key)
  })

  // tags (character pool)
  handle('tags:list', () => repo.listTags())
  handle('tags:create', (name: string) => repo.createTag(name))
  handle('tags:rename', (id: number, name: string) => repo.renameTag(id, name))
  handle('tags:delete', (id: number) => repo.deleteTag(id))

  // situation tags (separate pool)
  handle('situationTags:list', () => sit.listSituationTags())
  handle('situationTags:create', (name: string) => sit.createSituationTag(name))
  handle('situationTags:rename', (id: number, name: string) => sit.renameSituationTag(id, name))
  handle('situationTags:delete', (id: number) => sit.deleteSituationTag(id))

  // batches (一括生成)
  handle('batches:list', () => batchRepo.listBatches())
  handle('batches:create', (input: BatchCreateInput) => {
    const b = batchRepo.createBatch(input)
    enqueueBatch(b.id)
    return b
  })
  handle('batches:createScene', (input: SceneBatchCreateInput) => {
    const b = batchRepo.createSceneBatch(input)
    enqueueBatch(b.id)
    return b
  })
  handle('batches:delete', (id: number) => batchRepo.deleteBatch(id))
  handle('batches:generateDialogues', (id: number) => {
    enqueueDialogues(id) // background; renderer polls list for progress
  })
  ipcMain.handle('batches:download', async (e, batchId: number) => {
    const paths = batchRepo.successImagePaths(batchId)
    if (!paths.length) throw new Error('保存できる画像がありません')
    const name = batchRepo.batchName(batchId) ?? 'batch'
    const files: Record<string, Uint8Array> = {}
    const seen = new Set<string>()
    for (const p of paths) {
      let arc = safeArcName(p)
      if (seen.has(arc)) {
        const dot = arc.lastIndexOf('.')
        const stem = dot > 0 ? arc.slice(0, dot) : arc
        const ext = dot > 0 ? arc.slice(dot) : ''
        let i = 2
        while (seen.has(`${stem}_${i}${ext}`)) i++
        arc = `${stem}_${i}${ext}`
      }
      seen.add(arc)
      files[arc] = new Uint8Array(readFileSync(storagePathFor(p)))
    }
    // STORED (level 0) — PNGs are already compressed (matches nauto8).
    const zipped = zipSync(files, { level: 0 })
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      defaultPath: `${slug(name)}.zip`,
      filters: [{ name: 'ZIP', extensions: ['zip'] }]
    }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return { saved: null }
    writeFileSync(res.filePath, Buffer.from(zipped))
    return { saved: res.filePath }
  })

  // single generations (regenerate / mosaic)
  handle('generations:regenerate', async (id: number) => {
    await regenerateGeneration(id)
    return batchRepo.getGeneration(id)
  })
  handle('generations:imageData', (id: number) => {
    const g = batchRepo.getGenerationRow(id)
    if (!g?.image_path) throw new Error('画像がありません')
    const buf = readFileSync(storagePathFor(g.image_path))
    return `data:image/png;base64,${buf.toString('base64')}`
  })
  handle('generations:generateDialogue', async (id: number) => {
    await generateDialogueForGeneration(id)
    return batchRepo.getGeneration(id)
  })
  handle('generations:setDialogue', (id: number, text: string) => {
    batchRepo.setDialogue(id, text)
    return batchRepo.getGeneration(id)
  })

  handle('articles:compose', (batchId: number) => composeArticle(batchId))
  handle('articles:regenerate', (input: ArticleRegenInput) => regenerateArticleBlock(input))
  handle('articles:post', (input: ArticlePostInput) => postArticleToWordpress(input))
  handle('articles:save', (input: ArticleSaveInput) => articleRepo.saveArticle(input))
  handle('articles:list', () => articleRepo.listArticles())
  handle('articles:get', (id: number) => articleRepo.getArticle(id))
  handle('articles:delete', (id: number) => articleRepo.deleteArticle(id))
  handle('novelai:anlas', () => getAnlas(repo.getSetting('NOVELAI_API_TOKEN') ?? ''))
  handle('grok:test', () => testApiKey())
  handle('wordpress:test', () =>
    testConnection(
      wpConfigFrom(
        repo.getSetting('WP_SITE_URL'),
        repo.getSetting('WP_USERNAME'),
        repo.getSetting('WP_APP_PASSWORD')
      )
    )
  )
  handle('generations:saveImage', (id: number, dataUrl: string) => {
    const g = batchRepo.getGenerationRow(id)
    if (!g) throw new Error('生成が見つかりません')
    const name = batchRepo.batchName(g.batch_id) ?? 'batch'
    const { buf } = decodeDataUrl(dataUrl)
    const key = generationKey(name, g.seq, replaceXxx(g.situation_name, g.character_name))
    saveImageWithName(posix.dirname(key), posix.basename(key), buf)
    batchRepo.setGenerationImage(id, key)
    return batchRepo.getGeneration(id)
  })

  // Inpaint: regenerate only the masked region (NovelAI infill). `maskDataUrl` is a
  // black/white PNG (white = redraw); `extraPrompt` adds to the scene for the region.
  handle('generations:inpaint', async (id: number, maskDataUrl: string, extraPrompt: string) => {
    const g = batchRepo.getGeneration(id)
    if (!g || !g.image_path) throw new Error('生成画像が見つかりません')
    const char = g.character_id ? repo.getCharacter(g.character_id) : null
    const s = g.situation_id ? sit.getSituation(g.situation_id) : null
    if (!char) throw new Error('キャラクターが見つかりません（削除された可能性）')
    if (!s) throw new Error('シチュエーションが見つかりません（削除された可能性）')
    const token = repo.getSetting('NOVELAI_API_TOKEN') ?? ''
    const b = batchRepo.getBatchRow(g.batch_id)
    const base = b?.prefix_prompt?.trim() ? `${b.prefix_prompt.trim()}, ${s.prompt}` : s.prompt
    let scene = applyCharacterReplacements(replaceXxx(base, char.name), char.prompt_replacements)
    if ((extraPrompt ?? '').trim()) scene = `${scene}, ${extraPrompt.trim()}`
    const charPrompt = stripEyeTagsIfClosed(char.prompt, scene)
    const negative = [s.negative_prompt, char.negative_prompt]
      .map((x) => x.trim())
      .filter(Boolean)
      .join(', ')

    const srcBuf = readFileSync(storagePathFor(g.image_path))
    const { width, height } = nativeImage.createFromBuffer(srcBuf).getSize()
    const { buf: maskBuf } = decodeDataUrl(maskDataUrl)
    const png = await inpaint({
      token,
      imageBase64: srcBuf.toString('base64'),
      maskBase64: maskBuf.toString('base64'),
      width,
      height,
      charPrompt,
      scenePrompt: scene,
      negativePrompt: negative
    })

    const name = batchRepo.batchName(g.batch_id) ?? 'batch'
    const key = generationKey(name, g.seq, replaceXxx(g.situation_name, g.character_name))
    saveImageWithName(posix.dirname(key), posix.basename(key), png)
    batchRepo.setGenerationImage(id, key)
    return batchRepo.getGeneration(id)
  })

  // settings
  handle('settings:get', (key: string) => repo.getSetting(key))
  handle('settings:set', (key: string, value: string) => repo.setSetting(key, value))

  // preview (NovelAI test shot)
  handle(
    'preview:run',
    async (characterId: number, situationPrompt?: string): Promise<PreviewResult> => {
      const token = repo.getSetting('NOVELAI_API_TOKEN') ?? ''
      const { prompt, negative_prompt } = repo.characterPrompt(characterId)
      // Scene = the (optional) situation prompt + a saved test-shot prompt that
      // the user keeps in settings (e.g. quality tags / a default pose).
      const scene = [situationPrompt, repo.getSetting('PREVIEW_PROMPT')]
        .map((x) => (x ?? '').trim())
        .filter(Boolean)
        .join(', ')
      const ref = token
        ? await buildReferenceParams(characterId, prompt, token)
        : { mode: referenceMode(), count: 0 }
      const png = await generateImage({
        token,
        charPrompt: stripEyeTagsIfClosed(prompt, scene),
        negativePrompt: negative_prompt,
        scenePrompt: scene,
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
