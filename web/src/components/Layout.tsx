import { h, ComponentChildren } from 'preact'
import { route } from 'preact-router'

interface LayoutProps {
  children: ComponentChildren
  currentPath?: string
  hideTabBar?: boolean
}

/**
 * Main layout with bottom tab navigation
 * Exactly 2 tabs: 我的课 / 预约
 */
export function Layout({ children, currentPath = '/', hideTabBar = false }: LayoutProps) {
  const isHomePath = currentPath === '/'
  const isBookPath = currentPath.startsWith('/book')

  return (
    <div style={{
      minHeight: '100vh',
      paddingBottom: hideTabBar ? '0' : 'calc(var(--tab-bar-height) + var(--safe-area-bottom))',
    }}>
      {children}
      
      {!hideTabBar && (
        <nav style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(var(--tab-bar-height) + var(--safe-area-bottom))',
          paddingBottom: 'var(--safe-area-bottom)',
          backgroundColor: var(--color-surface),
          borderTop: '1px solid var(--color-divider)',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'space-around',
          zIndex: 100,
          boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
        }}>
          <button
            onClick={() => route('/')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: isHomePath ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              transition: 'color 0.2s ease',
              padding: '8px',
              minHeight: 'var(--tap-target-min)',
            }}
          >
            <div style={{
              fontSize: '24px',
              lineHeight: 1,
            }}>
              📚
            </div>
            <div style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: isHomePath ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
            }}>
              我的课
            </div>
          </button>
          
          <button
            onClick={() => {
              // If on home, try to get the first available course to book
              // Otherwise just go to booking page (it will handle errors)
              route('/book')
            }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: isBookPath ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              transition: 'color 0.2s ease',
              padding: '8px',
              minHeight: 'var(--tap-target-min)',
            }}
          >
            <div style={{
              fontSize: '24px',
              lineHeight: 1,
            }}>
              📅
            </div>
            <div style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: isBookPath ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
            }}>
              预约
            </div>
          </button>
        </nav>
      )}
    </div>
  )
}

/**
 * Profile header - top right, de-emphasized
 */
interface ProfileHeaderProps {
  teacherName?: string
  onProfileClick?: () => void
}

export function ProfileHeader({ teacherName, onProfileClick }: ProfileHeaderProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 'var(--spacing-md)',
      backgroundColor: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-divider)',
    }}>
      <div style={{
        fontSize: 'var(--font-size-lg)',
        fontWeight: 'var(--font-weight-semibold)',
        color: 'var(--color-text)',
      }}>
        {teacherName || 'Rabbit'}
      </div>
      
      {onProfileClick && (
        <button
          onClick={onProfileClick}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            fontSize: '20px',
            color: 'var(--color-text-secondary)',
            minHeight: 'var(--tap-target-min)',
            minWidth: 'var(--tap-target-min)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-full)',
            transition: 'background-color 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-background-tertiary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          ⚙️
        </button>
      )}
    </div>
  )
}
