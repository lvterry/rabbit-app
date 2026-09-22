import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { StudentHomeView } from '@rabbit/shared'
import * as api from '../api/client'
import { Layout } from '../components/Layout'
import { EmptyState } from '../components/UIComponents'

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
      <Layout currentPath="/" hideTabBar>
        <div class="container">
          <div class="loading">加载中...</div>
        </div>
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout currentPath="/" hideTabBar>
        <EmptyState
          title={error}
          message="需要从老师分享的链接进入"
        />
      </Layout>
    )
  }

  if (!home || home.cards.length === 0) {
    return (
      <Layout currentPath="/" hideTabBar>
        <EmptyState
          title="你还没有加入任何老师"
          message="需要从老师分享的链接进入"
          playful
        />
      </Layout>
    )
  }

  return (
    <Layout currentPath="/">
      <div class="container" style={{ paddingTop: 'var(--spacing-md)' }}>
        <h1 style={{ 
          fontSize: 'var(--font-size-2xl)', 
          fontWeight: 'var(--font-weight-bold)', 
          marginBottom: 'var(--spacing-lg)',
          color: 'var(--color-text)',
        }}>
          我的课
        </h1>

        {home.cards.map((card) => (
          <div key={card.teacherId} class="card">
            {/* Teacher header */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              marginBottom: 'var(--spacing-lg)',
              paddingBottom: 'var(--spacing-md)',
              borderBottom: '1px solid var(--color-divider)',
            }}>
              {card.teacherAvatarUrl && (
                <img
                  src={card.teacherAvatarUrl}
                  alt={card.teacherName}
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: 'var(--radius-full)',
                    objectFit: 'cover',
                    marginRight: 'var(--spacing-md)',
                    border: '2px solid var(--color-divider)',
                  }}
                />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ 
                  fontWeight: 'var(--font-weight-semibold)', 
                  fontSize: 'var(--font-size-lg)',
                  marginBottom: '4px',
                }}>
                  {card.teacherName}
                </div>
                <div class="text-secondary" style={{ 
                  fontSize: 'var(--font-size-sm)',
                }}>
                  {card.studentName}
                </div>
              </div>
            </div>

            {/* Courses */}
            {card.courses.map((course, index) => {
              const canBook = course.allowSelfBooking && course.available > 0 && !course.exhausted

              return (
                <div
                  key={course.courseId}
                  style={{
                    padding: 'var(--spacing-md) 0',
                    borderBottom: index < card.courses.length - 1 
                      ? '1px solid var(--color-divider)' 
                      : 'none',
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: 'var(--spacing-sm)',
                  }}>
                    <div style={{ 
                      fontWeight: 'var(--font-weight-semibold)',
                      fontSize: 'var(--font-size-md)',
                    }}>
                      {course.courseName}
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: course.remaining > 0 
                        ? 'var(--color-primary-light)' 
                        : 'var(--color-background-tertiary)',
                      color: course.remaining > 0 
                        ? 'var(--color-primary)' 
                        : 'var(--color-text-tertiary)',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 'var(--font-weight-medium)',
                    }}>
                      剩余 {course.remaining} 节
                    </div>
                  </div>

                  {course.nextBooking && (
                    <div class="text-secondary" style={{ 
                      marginBottom: 'var(--spacing-sm)',
                      fontSize: 'var(--font-size-sm)',
                    }}>
                      下一节：{course.nextBooking.dateLabel} {course.nextBooking.timeRange}
                    </div>
                  )}

                  {course.exhausted ? (
                    <div class="text-secondary" style={{ 
                      fontSize: 'var(--font-size-sm)',
                      fontStyle: 'italic',
                    }}>
                      当前没有可用课时，请联系老师续课
                    </div>
                  ) : course.fullyReserved ? (
                    <div class="text-secondary" style={{ 
                      fontSize: 'var(--font-size-sm)',
                      fontStyle: 'italic',
                    }}>
                      你已预约的课程占用了全部剩余课时
                    </div>
                  ) : !course.allowSelfBooking ? (
                    <div class="text-secondary" style={{ 
                      fontSize: 'var(--font-size-sm)',
                      fontStyle: 'italic',
                    }}>
                      该课程需要联系老师安排
                    </div>
                  ) : (
                    <button
                      class="button"
                      style={{ marginTop: 'var(--spacing-sm)' }}
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
      </div>
    </Layout>
  )
}
