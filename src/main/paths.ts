import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

// Data location:
//   - NAUTO9_DATA_DIR env override (used by tests so they NEVER touch real data)
//   - packaged: OS userData directory
//   - dev: ./.dev-data next to the project (easy to inspect)
export function dataRoot(): string {
  if (process.env.NAUTO9_DATA_DIR) return process.env.NAUTO9_DATA_DIR
  if (app.isPackaged) return join(app.getPath('userData'), 'data')
  return join(app.getAppPath(), '.dev-data')
}

export function dbPath(): string {
  const root = dataRoot()
  mkdirSync(root, { recursive: true })
  return join(root, 'nauto9.db')
}

export function storageRoot(): string {
  const root = join(dataRoot(), 'storage')
  mkdirSync(root, { recursive: true })
  return root
}

// Absolute path on disk for a logical storage key like
// "characters/3/2/topless/ab12cd3.png".
export function storagePathFor(logicalKey: string): string {
  return join(storageRoot(), logicalKey)
}

// Bundled read-only resources (models, etc.). asarUnpack ships resources/** to
// app.asar.unpacked in a packaged build; in dev they sit at the project root.
export function resourcePath(...segs: string[]): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar.unpacked', 'resources', ...segs)
  }
  return join(app.getAppPath(), 'resources', ...segs)
}
