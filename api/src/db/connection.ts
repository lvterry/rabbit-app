import { Pool } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || 
      'postgresql://app_rw:app_password_changeme@localhost:5432/rabbit'
    
    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      // Force UTC timezone for all connections (data-model.md §0.4)
      // Prevents ambient TZ from affecting timestamptz operations
      options: '-c TimeZone=UTC',
    })
  }
  
  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
