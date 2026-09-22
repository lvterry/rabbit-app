import { h } from 'preact'

interface SuccessScreenProps {
  title: string
  message?: string
  onContinue: () => void
  continueText?: string
}

/**
 * Success screen with green check mark
 * Used for booking confirmation and other success states
 */
export function SuccessScreen({ title, message, onContinue, continueText = '返回首页' }: SuccessScreenProps) {
  return (
    <div class="container" style={{ 
      paddingTop: 'var(--spacing-2xl)',
      paddingBottom: 'var(--spacing-2xl)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
    }}>
      {/* Green check mark */}
      <div style={{
        width: '80px',
        height: '80px',
        borderRadius: 'var(--radius-full)',
        backgroundColor: 'var(--color-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 'var(--spacing-xl)',
        animation: 'scaleIn 0.3s ease-out',
      }}>
        <svg 
          width="48" 
          height="48" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="white" 
          stroke-width="3" 
          stroke-linecap="round" 
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h1 style={{
        fontSize: 'var(--font-size-2xl)',
        fontWeight: 'var(--font-weight-bold)',
        color: 'var(--color-text)',
        marginBottom: 'var(--spacing-md)',
        textAlign: 'center',
      }}>
        {title}
      </h1>

      {message && (
        <p style={{
          fontSize: 'var(--font-size-md)',
          color: 'var(--color-text-secondary)',
          textAlign: 'center',
          marginBottom: 'var(--spacing-xl)',
          lineHeight: 'var(--line-height-relaxed)',
        }}>
          {message}
        </p>
      )}

      <button 
        class="button" 
        onClick={onContinue}
        style={{
          maxWidth: '280px',
        }}
      >
        {continueText}
      </button>

      <style>{`
        @keyframes scaleIn {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

/**
 * Calendar date picker with highlighted available days
 */
interface CalendarDay {
  date: string
  dateLabel: string
  weekdayLabel: string
  slotCount: number
  available: boolean
}

interface DatePickerProps {
  days: CalendarDay[]
  onSelectDate: (date: string) => void
  selectedDate?: string
}

export function DatePicker({ days, onSelectDate, selectedDate }: DatePickerProps) {
  return (
    <div class="card" style={{
      padding: 'var(--spacing-sm)',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
        gap: 'var(--spacing-sm)',
      }}>
        {days.map((day) => (
          <button
            key={day.date}
            onClick={() => day.available && onSelectDate(day.date)}
            disabled={!day.available}
            style={{
              padding: 'var(--spacing-md)',
              border: selectedDate === day.date 
                ? '2px solid var(--color-primary)' 
                : '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              background: day.available 
                ? (selectedDate === day.date ? 'var(--color-primary-light)' : 'var(--color-surface)') 
                : 'var(--color-background-tertiary)',
              cursor: day.available ? 'pointer' : 'not-allowed',
              minHeight: 'var(--tap-target-min)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
              opacity: day.available ? 1 : 0.4,
            }}
          >
            <div style={{
              fontSize: 'var(--font-size-lg)',
              fontWeight: 'var(--font-weight-semibold)',
              color: selectedDate === day.date 
                ? 'var(--color-primary)' 
                : (day.available ? 'var(--color-text)' : 'var(--color-text-tertiary)'),
            }}>
              {day.dateLabel.split(' ')[1] || day.dateLabel}
            </div>
            <div style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
            }}>
              {day.weekdayLabel}
            </div>
            {day.available && day.slotCount > 0 && (
              <div style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-primary)',
                fontWeight: 'var(--font-weight-medium)',
              }}>
                {day.slotCount}个
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Empty state with optional action
 */
interface EmptyStateProps {
  title: string
  message?: string
  action?: {
    text: string
    onClick: () => void
  }
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div class="empty-state" style={{
      minHeight: '300px',
    }}>
      <div class="empty-state-title">
        {title}
      </div>
      
      {message && (
        <div class="text-secondary" style={{
          marginTop: 'var(--spacing-sm)',
          maxWidth: '300px',
        }}>
          {message}
        </div>
      )}
      
      {action && (
        <button 
          class="button" 
          onClick={action.onClick}
          style={{
            marginTop: 'var(--spacing-lg)',
            maxWidth: '280px',
          }}
        >
          {action.text}
        </button>
      )}
    </div>
  )
}

/**
 * Serious/clear messaging for deduction rules
 */
interface InfoBoxProps {
  type: 'info' | 'warning' | 'danger'
  title?: string
  message: string
}

export function InfoBox({ type, title, message }: InfoBoxProps) {
  const styles = {
    info: {
      bg: 'var(--color-primary-light)',
      border: 'var(--color-primary)',
      color: 'var(--color-text)',
    },
    warning: {
      bg: 'var(--color-yellow-light)',
      border: 'var(--color-warning)',
      color: 'var(--color-text)',
    },
    danger: {
      bg: 'rgba(255, 59, 48, 0.1)',
      border: 'var(--color-danger)',
      color: 'var(--color-danger)',
    },
  }

  const style = styles[type]

  return (
    <div style={{
      padding: 'var(--spacing-md)',
      backgroundColor: style.bg,
      border: `2px solid ${style.border}`,
      borderRadius: 'var(--radius-md)',
      marginBottom: 'var(--spacing-md)',
    }}>
      {title && (
        <div style={{
          fontWeight: 'var(--font-weight-semibold)',
          color: style.color,
          marginBottom: 'var(--spacing-xs)',
        }}>
          {title}
        </div>
      )}
      <div style={{
        fontSize: 'var(--font-size-sm)',
        color: style.color,
        lineHeight: 'var(--line-height-relaxed)',
      }}>
        {message}
      </div>
    </div>
  )
}
