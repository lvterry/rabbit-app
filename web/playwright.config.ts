import { defineConfig, devices } from '@playwright/test'
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 1ae2983 (Update E2E setup to align with Maya's seed contract)
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(__dirname, '.env.test') })
<<<<<<< HEAD
=======
>>>>>>> 080a3dc (Add Playwright E2E tests for student web flow)
=======
>>>>>>> 1ae2983 (Update E2E setup to align with Maya's seed contract)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.WEB_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: undefined,
})
