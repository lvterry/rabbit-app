import { test, expect } from '@playwright/test'

test.describe('Student Web Flow - Real Stack', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`Browser console error: ${msg.text()}`)
      }
    })
  })

  test('complete student flow: invite → home → book → cancel', async ({ page }) => {
    const inviteToken = process.env.INVITE_TOKEN
    
    if (!inviteToken) {
      test.skip(true, 'INVITE_TOKEN environment variable not set. Wait for Maya\'s seed PR (api/test/e2e/seed-stabilization.ts)')
    }

    await test.step('1. Enter via invite link', async () => {
      await page.goto(`/i/${inviteToken}`)

      await expect(page.getByRole('heading', { name: /邀请你加入/ })).toBeVisible()
      
      await expect(page.locator('text=学员：')).toBeVisible()

      const coursesSection = page.locator('text=课程').locator('..')
      await expect(coursesSection).toBeVisible()
      
      const remainingText = page.locator('.text-secondary', { hasText: '剩余' }).first()
      await expect(remainingText).toBeVisible()

      await page.click('button:has-text("接受邀请")')
      
      await page.waitForURL('/', { timeout: 10000 })
    })

    await test.step('2. Student-home shows course credits (cards/bound)', async () => {
      await expect(page.getByRole('heading', { name: '我的课' })).toBeVisible()

      const card = page.locator('.card').first()
      await expect(card).toBeVisible()
      await expect(card.getByText('E2E Teacher')).toBeVisible()
      await expect(card.getByText('E2E Student')).toBeVisible()
      await expect(card.getByText(/剩余\s*\d+\s*节/)).toBeVisible()

      const bookButton = card.getByRole('button', { name: '预约课程' })
      await expect(bookButton).toBeVisible()
      await expect(bookButton).toBeEnabled()
    })

    await test.step('3. Self-book a session', async () => {
      const card = page.locator('.card').first()
      await card.locator('button:has-text("预约课程")').click()

      await expect(page.locator('h1:has-text("选择日期")')).toBeVisible()

      const firstDate = page.locator('button.list-item').first()
      await expect(firstDate).toBeVisible()
      await firstDate.click()

      await expect(page.locator('h1:has-text("选择时间")')).toBeVisible()

      const firstTimeSlot = page.locator('button.list-item').first()
      await expect(firstTimeSlot).toBeVisible()
      await firstTimeSlot.click()

      await expect(page.locator('h1:has-text("确认预约")')).toBeVisible()

      await expect(page.locator('text=日期')).toBeVisible()
      await expect(page.locator('text=时间')).toBeVisible()

      await page.click('button:has-text("确认预约")')

      await page.waitForURL('/', { timeout: 10000 })

      await expect(page.locator('h1:has-text("我的课")')).toBeVisible()
    })

    await test.step('4. Navigate to bookings and cancel a booking', async () => {
      await page.click('button:has-text("我的预约")')

      await page.waitForURL(/\/bookings/, { timeout: 10000 })

      await expect(page.locator('h1:has-text("我的课程")')).toBeVisible()

      await expect(page.locator('button:has-text("进行中")')).toBeVisible()

      const firstBooking = page.locator('.list-item').first()
      await expect(firstBooking).toBeVisible()
      await firstBooking.click()

      await page.waitForURL(/\/bookings\/[^/]+$/, { timeout: 10000 })

      await expect(page.locator('h1:has-text("课程详情")')).toBeVisible()

      await expect(page.locator('text=日期')).toBeVisible()
      await expect(page.locator('text=时间')).toBeVisible()
      await expect(page.locator('text=时长')).toBeVisible()

      const cancelButton = page.locator('button.button-danger:has-text("取消预约")')
      await expect(cancelButton).toBeVisible({ timeout: 5000 })
      await expect(cancelButton).toBeEnabled()

      await cancelButton.click()

      await expect(page.locator('h2:has-text("确认取消")')).toBeVisible()

      const confirmButton = page.locator('button.button-danger:has-text("确认取消")')
      await expect(confirmButton).toBeVisible()
      await confirmButton.click()

      await expect(page.locator('text=已取消')).toBeVisible({ timeout: 10000 })
    })
  })

  test('verify student-home bound field and empty state', async ({ page }) => {
    const inviteToken = process.env.INVITE_TOKEN
    
    if (!inviteToken) {
      test.skip(true, 'INVITE_TOKEN environment variable not set. Wait for Maya\'s seed PR (api/test/e2e/seed-stabilization.ts)')
    }

    await page.goto('/')

    const errorState = page.locator('.empty-state')
    const homeCards = page.locator('.card')

    if (await errorState.isVisible()) {
      await expect(errorState).toContainText('请从老师分享的邀请链接进入')
    } else {
      await expect(homeCards.first()).toBeVisible()
    }
  })
})
