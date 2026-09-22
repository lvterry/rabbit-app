import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { StudentHomeView } from '@rabbit/shared'
import * as api from '../api/client'

interface HomeRouteProps {
  path: string
}

export function HomeRoute(_props: HomeRouteProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [home, setHome] = useState<StudentHomeView | null>(null)

  useEffect(() => {
    loadHome()
  }, [])

  async function loadHome() {
    setLoading(true)
    setError(null)

    const response = await api.getStudentHome()

    if (!response.ok) {
      if (response.code === 'UNAUTHENTICATED' || response.code === 'TOKEN_EXPIRED') {
        setError('请从老师分享的邀请链接进入')
      } else {
        setError(response.message)
      }
      setLoading(false)
      return
    }

    setHome(response.data)
    setLoading(false)
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
        <div class="empty-state">
          <div class="empty-state-title">{error}</div>
        </div>
      </div>
    )
  }

  if (!home || home.cards.length === 0) {
    return (
      <div class="container" style={{ paddingTop: '40px' }}>
        <div class="empty-state">
          <div class="empty-state-title">你还没有加入任何老师</div>
          <div class="text-secondary">需要从老师分享的链接进入</div>
        </div>
      </div>
    )
  }

  return (
    <div class="container" style={{ paddingTop: '16px', paddingBottom: '80px' }}>
      <h1 style={{ 
        fontSize: 'var(--font-size-xl)', 
        fontWeight: 'bold', 
        marginBottom: '16px' 
      }}>
        我的课
      </h1>

      {home.cards.map((card) => (
        <div key={card.teacherId} class="card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            {card.teacherAvatarUrl && (
              <img
                src={card.teacherAvatarUrl}
                alt={card.teacherName}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  marginRight: '12px',
                }}
              />
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-size-lg)' }}>
                {card.teacherName}
              </div>
              <div class="text-secondary">
                {card.studentName}
              </div>
            </div>
          </div>

          <div class="divider" />

          {card.courses.map((course) => {
            const canBook = course.allowSelfBooking && course.available > 0 && !course.exhausted

            return (
              <div
                key={course.courseId}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid var(--color-divider)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 600 }}>
                    {course.courseName}
                  </div>
                  <div class="text-secondary">
                    剩余 {course.remaining} 节
                  </div>
                </div>

                {course.nextBooking && (
                  <div class="text-secondary" style={{ marginBottom: '8px' }}>
                    下一节：{course.nextBooking.dateLabel} {course.nextBooking.timeRange}
                  </div>
                )}

                {course.exhausted ? (
                  <div class="text-secondary">
                    当前没有可用课时，请联系老师续课
                  </div>
                ) : course.fullyReserved ? (
                  <div class="text-secondary">
                    你已预约的课程占用了全部剩余课时
                  </div>
                ) : !course.allowSelfBooking ? (
                  <div class="text-secondary">
                    该课程需要联系老师安排
                  </div>
                ) : (
                  <button
                    class="button"
                    style={{ marginTop: '8px' }}
                    onClick={() => {
                      const params = new URLSearchParams({
                        teacherId: card.teacherId,
                        courseId: course.courseId,
                      })
                      route(`/book?${params.toString()}`)
                    }}
                    disabled={!canBook}
                  >
                    预约课程
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}

      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        backgroundColor: 'var(--color-background)',
        borderTop: '1px solid var(--color-divider)',
        padding: '8px 16px',
        gap: '8px',
      }}>
        <button
          class="button button-secondary"
          style={{ flex: 1 }}
          onClick={() => route('/bookings?scope=upcoming')}
        >
          我的预约
        </button>
      </div>
    </div>
  )
}
