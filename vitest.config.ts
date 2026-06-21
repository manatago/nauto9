import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Unit tests cover the PURE logic in src (no Electron / DB / network). The
// electron import is stubbed so main-process modules can be imported.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      electron: resolve(__dirname, 'test/stubs/electron.ts')
    }
  }
})
