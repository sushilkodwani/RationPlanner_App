/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Stamps each build with one id: baked into the JS and written to dist/version.json (the update prompt compares them). */
function versionStamp(version: string, builtAt: string): Plugin {
  return {
    name: 'version-stamp',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, builtAt }) })
    },
  }
}

// base './' makes the build work under any GitHub Pages sub-path.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const builtAt = new Date().toISOString()
  const version = (env.GITHUB_SHA ?? '').slice(0, 7) || `local-${Date.now().toString(36)}`
  return {
    plugins: [react(), versionStamp(version, builtAt)],
    base: './',
    define: { __APP_VERSION__: JSON.stringify(version), __APP_BUILT_AT__: JSON.stringify(builtAt) },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'notifier/**/*.test.mjs'],
      setupFiles: ['src/test-setup.ts'],
    },
  }
})
