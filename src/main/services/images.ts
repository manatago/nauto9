import { nativeImage } from 'electron'
import { randomBytes } from 'crypto'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { dirname, posix } from 'path'
import { storagePathFor } from '../paths'

const THUMB_WIDTH = 400

// Logical key (POSIX-style) for the thumbnail of an image key:
//   characters/3/2/topless/abc12345.png
// -> characters/3/2/topless/thumbnails/abc12345.jpg
export function thumbKey(imageKey: string): string {
  const dir = posix.dirname(imageKey)
  const base = posix.basename(imageKey).replace(/\.[^.]+$/, '')
  return posix.join(dir, 'thumbnails', `${base}.jpg`)
}

export function mediaUrl(logicalKey: string): string {
  // media://<logicalKey> — encode each segment but keep slashes.
  return 'media://' + logicalKey.split('/').map(encodeURIComponent).join('/')
}

function writeFileEnsured(absPath: string, buf: Buffer): void {
  mkdirSync(dirname(absPath), { recursive: true })
  writeFileSync(absPath, buf)
}

function makeThumbnail(buf: Buffer, thumbAbsPath: string): void {
  try {
    const img = nativeImage.createFromBuffer(buf)
    if (img.isEmpty()) return
    const { width } = img.getSize()
    const resized = width > THUMB_WIDTH ? img.resize({ width: THUMB_WIDTH }) : img
    writeFileEnsured(thumbAbsPath, resized.toJPEG(82))
  } catch {
    // Thumbnail is best-effort; the original still serves via media://.
  }
}

// Persist an image buffer under `logicalDir` with a fresh random filename and
// build its thumbnail. Returns the image's logical key.
export function saveImage(logicalDir: string, buf: Buffer, ext = 'png'): string {
  const name = `${randomBytes(5).toString('hex')}.${ext}`
  const imageKey = posix.join(logicalDir, name)
  writeFileEnsured(storagePathFor(imageKey), buf)
  makeThumbnail(buf, storagePathFor(thumbKey(imageKey)))
  return imageKey
}

// Persist a buffer at an EXACT logical key (dir + filename), building its
// thumbnail. Used by batch generation where the filename follows a convention.
export function saveImageWithName(logicalDir: string, filename: string, buf: Buffer): string {
  const imageKey = posix.join(logicalDir, filename)
  writeFileEnsured(storagePathFor(imageKey), buf)
  makeThumbnail(buf, storagePathFor(thumbKey(imageKey)))
  return imageKey
}

export function deleteImage(imageKey: string): void {
  for (const key of [imageKey, thumbKey(imageKey)]) {
    const abs = storagePathFor(key)
    if (existsSync(abs)) rmSync(abs, { force: true })
  }
}

// Decode a `data:` URL into a Buffer plus its file extension.
export function decodeDataUrl(dataUrl: string): { buf: Buffer; ext: string } {
  const match = /^data:(?<mime>[^;]+);base64,(?<data>.+)$/s.exec(dataUrl)
  if (!match?.groups) throw new Error('invalid data URL')
  const mime = match.groups.mime
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
  return { buf: Buffer.from(match.groups.data, 'base64'), ext }
}
