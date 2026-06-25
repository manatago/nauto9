import { app, BrowserWindow, dialog } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { dataRoot } from '../paths'
import { closeDb } from '../db'

const run = promisify(execFile)

// Timestamp like 20260625-115900 for backup filenames / aside folders.
function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}

// The whole data directory (DB + image storage) is bundled into one .zip.
// We shell out to macOS `ditto`, which streams to disk — safe for the multi-GB
// image library that an in-memory zip would choke on. PNGs are already
// compressed, so STORED-style packaging is fine.
export async function exportData(win: BrowserWindow | null): Promise<{ saved: string | null }> {
  const root = dataRoot()
  if (!existsSync(join(root, 'nauto9.db'))) throw new Error('エクスポートできるデータがありません')

  const defaultPath = `nauto9-backup-${stamp()}.zip`
  const opts = { defaultPath, filters: [{ name: 'ZIP', extensions: ['zip'] }] }
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return { saved: null }

  // --keepParent nests everything under the data dir's basename inside the zip;
  // import locates nauto9.db within the extracted tree regardless of that name.
  await run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', root, res.filePath], {
    maxBuffer: 1024 * 1024
  })
  return { saved: res.filePath }
}

// Depth-first search for the directory that holds nauto9.db inside an extracted
// backup (its name depends on which machine produced the zip).
function findDbDir(dir: string): string | null {
  if (existsSync(join(dir, 'nauto9.db'))) return dir
  for (const entry of readdirSync(dir)) {
    const child = join(dir, entry)
    if (statSync(child).isDirectory()) {
      const found = findDbDir(child)
      if (found) return found
    }
  }
  return null
}

// Replace the current data directory with the contents of a backup .zip, then
// relaunch so the DB reopens against the imported data. The previous data is
// renamed aside (never deleted) so a mistaken import is recoverable.
export async function importData(win: BrowserWindow | null): Promise<{ imported: boolean }> {
  const opts = {
    properties: ['openFile' as const],
    filters: [{ name: 'ZIP', extensions: ['zip'] }]
  }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled || !res.filePaths[0]) return { imported: false }
  const zip = res.filePaths[0]

  const root = dataRoot()
  const parent = dirname(root)
  const tmp = join(parent, `.import-tmp-${stamp()}`)
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(parent, { recursive: true })

  try {
    await run('ditto', ['-x', '-k', zip, tmp], { maxBuffer: 1024 * 1024 })
    const newRoot = findDbDir(tmp)
    if (!newRoot) throw new Error('バックアップに nauto9.db が見つかりません')

    // Close the DB so the file handle is released before we move directories.
    closeDb()
    if (existsSync(root)) renameSync(root, `${root}.pre-import-${stamp()}`)
    renameSync(newRoot, root)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  // The running process now points at a closed DB and swapped storage; restart.
  if (app.isPackaged) {
    app.relaunch()
    app.exit(0)
  } else {
    if (win) {
      await dialog.showMessageBox(win, {
        type: 'info',
        message: 'インポートが完了しました',
        detail: 'アプリを終了します。`npm run dev` で再起動してください。'
      })
    }
    app.exit(0)
  }
  return { imported: true }
}
