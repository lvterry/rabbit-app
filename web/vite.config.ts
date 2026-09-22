import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [
    preact(),
    {
      name: 'contracts-fixtures',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/contracts/fixtures/')) {
            const filePath = path.resolve(__dirname, '..', req.url.slice(1))
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/json')
              res.end(fs.readFileSync(filePath, 'utf-8'))
              return
            }
          }
          next()
        })
      },
    },
  ],
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
})
