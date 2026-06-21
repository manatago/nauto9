// Minimal electron stub so pure helpers in main modules (which import electron at
// the top level) can be imported under vitest without the real runtime.
export const nativeImage = {
  createFromBuffer: () => ({ resize: () => ({ toPNG: () => Buffer.alloc(0) }) })
}
export const app = {}
export const ipcMain = {}
export const protocol = {}
export const BrowserWindow = class {}
