import { h, ComponentChildren } from 'preact'

interface LayoutProps {
  children: ComponentChildren
  showHeader?: boolean
}

export function Layout({ children, showHeader = true }: LayoutProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {showHeader && <Header />}
      <main style={{ flex: 1 }}>
        {children}
      </main>
    </div>
  )
}

function Header() {
  return (
    <header style={{
      backgroundColor: 'var(--color-background)',
      borderBottom: '1px solid var(--color-divider)',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <img 
        src="/logo-120.png" 
        alt="排课" 
        style={{
          width: '32px',
          height: '32px',
          display: 'block',
        }}
      />
      <h1 style={{
        fontSize: 'var(--font-size-lg)',
        fontWeight: 600,
        color: 'var(--color-text)',
        margin: 0,
      }}>
        排课
      </h1>
    </header>
  )
}
