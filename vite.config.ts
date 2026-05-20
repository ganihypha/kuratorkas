import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@sparkmind/core': path.resolve(__dirname, './packages/core/src/index.ts'),
      '@sparkmind/auth': path.resolve(__dirname, './packages/auth/src/index.ts'),
      '@sparkmind/ui-kit': path.resolve(__dirname, './packages/ui-kit/src/index.ts'),
      '@sparkmind/curator-os': path.resolve(__dirname, './packages/curator-os/src/index.ts'),
      '@sparkmind/pg-router': path.resolve(__dirname, './packages/pg-router/src/index.ts'),
      '@sparkmind/analytics': path.resolve(__dirname, './packages/analytics/src/index.ts'),
    },
  },
  plugins: [
    build(),
    devServer({
      adapter,
      entry: 'src/index.tsx',
    }),
  ],
})
