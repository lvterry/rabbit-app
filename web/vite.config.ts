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
      closeBundle() {
        const contractsDir = path.resolve(__dirname, '../contracts/fixtures')
        const outDir = path.resolve(__dirname, 'dist/contracts/fixtures')
        
        if (fs.existsSync(contractsDir)) {
          fs.mkdirSync(outDir, { recursive: true })
          
          function copyDir(src: string, dest: string) {
            const entries = fs.readdirSync(src, { withFileTypes: true })
            for (const entry of entries) {
              const srcPath = path.join(src, entry.name)
              const destPath = path.join(dest, entry.name)
              if (entry.isDirectory()) {
                fs.mkdirSync(destPath, { recursive: true })
                copyDir(srcPath, destPath)
              } else {
                fs.copyFileSync(srcPath, destPath)
              }
            }
          }
          
          copyDir(contractsDir, outDir)
          console.log('✓ Copied contracts/fixtures to dist/contracts/fixtures')
        }
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
