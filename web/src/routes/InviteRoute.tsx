import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { PendingInvitePreview, AcceptedInviteResponse } from '@rabbit/shared'
import { ErrorCode } from '@rabbit/shared'
import * as api from '../api/client'

interface InviteRouteProps {
  token?: string
  path?: string
}

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
        setError('邀请已失效,请联系老师重新发送')
      } else if (response.code === ErrorCode.INVITE_NOT_FOUND) {
        setError('邀请不存在，请联系老师重新发送')
      } else {
        setError(response.message)
      }
      setLoading(false)
      return
    }

    const data = response.data as PendingInvitePreview | AcceptedInviteResponse

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
    
    history.replaceState(null, '', response.data.redirectTo)
    route(response.data.redirectTo, true)

    setTimeout(() => {
      const shouldPrompt = !localStorage.getItem('bookmarkPromptShown')
      if (shouldPrompt) {
        localStorage.setItem('bookmarkPromptShown', 'true')
        alert('提示：把这一页加入书签或添加到主屏幕，下次可以直接进入。')
      }
    }, 500)
  }

  if (loading) {
    return (
      <div class="container">
        <div class="loading">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div class="container" style={{ paddingTop: '40px' }}>
        <div class="card">
          <div class="error" style={{ marginBottom: 0 }}>
            {error}
          </div>
        </div>
      </div>
    )
  }

  if (!preview) {
    return null
  }

  return (
    <div class="container" style={{ paddingTop: '40px' }}>
      <div class="card">
        {preview.teacher.avatarUrl && (
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <img
              src={preview.teacher.avatarUrl}
              alt={preview.teacher.name}
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          </div>
        )}
        
        <h1 style={{ 
          fontSize: 'var(--font-size-xl)', 
          textAlign: 'center', 
          marginBottom: '8px' 
        }}>
          {preview.teacher.name}邀请你加入
        </h1>
        
        <div style={{ 
          textAlign: 'center', 
          color: 'var(--color-text-secondary)', 
          marginBottom: '24px' 
        }}>
          学员：{preview.studentName}
        </div>

        {preview.courses.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              fontWeight: 600, 
              marginBottom: '8px' 
            }}>
              课程
            </div>
            {preview.courses.map((course) => (
              <div
                key={course.courseId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--color-divider)',
                }}
              >
                <span>{course.courseName}</span>
                <span class="text-secondary">剩余 {course.remaining} 节</span>
              </div>
            ))}
          </div>
        )}

        <button
          class="button"
          onClick={handleAccept}
          disabled={accepting}
        >
          {accepting ? '处理中...' : '接受邀请'}
        </button>

        <div style={{
          marginTop: '16px',
          textAlign: 'center',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
        }}>
          到期时间：{new Date(preview.expiresAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  )
}
