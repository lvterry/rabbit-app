import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { PendingInvitePreview, AcceptedInviteResponse } from '@rabbit/shared'
import { ErrorCode } from '@rabbit/shared'
import * as api from '../api/client'
import { EmptyState } from '../components/UIComponents'

interface InviteRouteProps {
  token?: string
  path?: string
}

/**
 * S05 Invite Route - Optimized for fast first screen and WeChat in-app browser
 * Requirements:
 * - Fast first screen (minimize time to "X 老师邀请你加入")
 * - WeChat safe: safe-area support, ≥44px tap targets
 * - No dependency on Service Worker / Push
 */
export function InviteRoute({ token: tokenProp }: InviteRouteProps) {
  const token = tokenProp || ''
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PendingInvitePreview | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    loadInvite()
  }, [token])

  async function loadInvite() {
    setLoading(true)
    setError(null)

    const response = await api.getInvite(token)

    if (!response.ok) {
      if (response.code === ErrorCode.INVITE_CONSUMED) {
        setError('该邀请已被使用，请联系老师重新发送')
      } else if (response.code === ErrorCode.INVITE_EXPIRED) {
        setError('邀请已过期，请联系老师重新发送')
      } else if (response.code === ErrorCode.INVITE_REVOKED) {
        setError('邀请已失效，请联系老师重新发送')
      } else if (response.code === ErrorCode.INVITE_NOT_FOUND) {
        setError('邀请不存在，请联系老师重新发送')
      } else {
        setError(response.message)
      }
      setLoading(false)
      return
    }

    const data = response.data as PendingInvitePreview | AcceptedInviteResponse

    // If already accepted and this is the same student, redirect to home
    if ('alreadyAccepted' in data && data.alreadyAccepted) {
      history.replaceState(null, '', data.redirectTo)
      route(data.redirectTo, true)
      return
    }

    setPreview(data as PendingInvitePreview)
    setLoading(false)
  }

  async function handleAccept() {
    if (!preview) return

    setAccepting(true)
    setError(null)

    const response = await api.acceptInvite(token)

    if (!response.ok) {
      setError(response.message)
      setAccepting(false)
      return
    }

    api.setAccessToken(response.data.accessToken)
    
    // Replace URL to / immediately (don't keep token in URL)
    history.replaceState(null, '', response.data.redirectTo)
    route(response.data.redirectTo, true)

    // Show bookmark prompt once
    setTimeout(() => {
      const shouldPrompt = !localStorage.getItem('bookmarkPromptShown')
      if (shouldPrompt) {
        localStorage.setItem('bookmarkPromptShown', 'true')
        // Simple closeable prompt instead of alert
        const overlay = document.createElement('div')
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: var(--spacing-lg);
        `
        overlay.innerHTML = `
          <div style="
            background: var(--color-surface);
            border-radius: var(--radius-lg);
            padding: var(--spacing-xl);
            max-width: 320px;
            text-align: center;
            box-shadow: var(--shadow-lg);
          ">
            <div style="font-size: 40px; margin-bottom: var(--spacing-md);">🔖</div>
            <div style="
              font-size: var(--font-size-lg);
              font-weight: var(--font-weight-semibold);
              margin-bottom: var(--spacing-sm);
            ">加入书签</div>
            <div style="
              font-size: var(--font-size-sm);
              color: var(--color-text-secondary);
              margin-bottom: var(--spacing-lg);
              line-height: var(--line-height-relaxed);
            ">把这一页加入书签或添加到主屏幕，下次可以直接进入</div>
            <button style="
              width: 100%;
              padding: var(--spacing-md);
              background: var(--color-primary);
              color: white;
              border: none;
              border-radius: var(--radius-md);
              font-weight: var(--font-weight-semibold);
              cursor: pointer;
              min-height: var(--tap-target-min);
            " onclick="this.parentElement.parentElement.remove()">知道了</button>
          </div>
        `
        document.body.appendChild(overlay)
      }
    }, 500)
  }

  if (loading) {
    return (
      <div class="container" style={{ 
        paddingTop: 'var(--spacing-2xl)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div class="loading">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--spacing-lg)',
      }}>
        <EmptyState
          title={error}
          message="如需帮助，请联系老师"
        />
      </div>
    )
  }

  if (!preview) {
    return null
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--spacing-lg)',
      paddingTop: 'calc(var(--spacing-2xl) + var(--safe-area-top))',
      paddingBottom: 'calc(var(--spacing-2xl) + var(--safe-area-bottom))',
    }}>
      <div style={{ 
        maxWidth: '400px',
        width: '100%',
      }}>
        <div class="card" style={{
          textAlign: 'center',
          padding: 'var(--spacing-xl)',
        }}>
          {preview.teacher.avatarUrl && (
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
              <img
                src={preview.teacher.avatarUrl}
                alt={preview.teacher.name}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: 'var(--radius-full)',
                  objectFit: 'cover',
                  border: '3px solid var(--color-divider)',
                }}
              />
            </div>
          )}
          
          <h1 style={{ 
            fontSize: 'var(--font-size-2xl)', 
            fontWeight: 'var(--font-weight-bold)',
            marginBottom: 'var(--spacing-sm)',
            color: 'var(--color-text)',
          }}>
            {preview.teacher.name} 邀请你加入
          </h1>
          
          <div style={{ 
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-text-secondary)', 
            marginBottom: 'var(--spacing-xl)',
          }}>
            学员：{preview.studentName}
          </div>

          {preview.courses.length > 0 && (
            <div style={{ 
              marginBottom: 'var(--spacing-xl)',
              textAlign: 'left',
              padding: 'var(--spacing-md)',
              backgroundColor: 'var(--color-background-secondary)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{ 
                fontWeight: 'var(--font-weight-semibold)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--spacing-sm)',
              }}>
                课程
              </div>
              {preview.courses.map((course) => (
                <div
                  key={course.courseId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 'var(--spacing-sm) 0',
                    borderBottom: '1px solid var(--color-divider)',
                  }}
                >
                  <span style={{ 
                    fontWeight: 'var(--font-weight-medium)',
                  }}>
                    {course.courseName}
                  </span>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--color-primary-light)',
                    color: 'var(--color-primary)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}>
                    {course.remaining} 节
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            class="button"
            onClick={handleAccept}
            disabled={accepting}
            style={{
              fontSize: 'var(--font-size-lg)',
            }}
          >
            {accepting ? '处理中...' : '接受邀请'}
          </button>

          <div style={{
            marginTop: 'var(--spacing-lg)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
          }}>
            到期时间：{preview.expiresAt}
          </div>
        </div>
      </div>
    </div>
  )
}
