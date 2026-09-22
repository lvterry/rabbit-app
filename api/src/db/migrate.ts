import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const { Pool } = pg

export async function runMigrations() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://app_migrator:migrator_password_changeme@localhost:5432/rabbit'
  
  const pool = new Pool({
    connectionString,
    // Use app_migrator role for migrations
  })

  try {
    const client = await pool.connect()
    
    try {
      // Create migrations table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
      
      // Get list of migration files
      const migrationsDir = path.join(__dirname, 'migrations')
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort()
      
      console.log(`Found ${files.length} migration files`)
      
      for (const file of files) {
        // Extract version number from filename (e.g., 001_initial_schema.sql -> 1)
        const match = file.match(/^(\d+)_/)
        if (!match) {
          console.log(`Skipping ${file} - invalid filename format`)
          continue
        }
        
        const version = parseInt(match[1], 10)
        
        // Check if already applied
        const { rows } = await client.query(
          'SELECT version FROM schema_migrations WHERE version = $1',
          [version]
        )
        
        if (rows.length > 0) {
          console.log(`Migration ${version} (${file}) already applied, skipping`)
          continue
        }
        
        // Read and execute migration
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
        
        console.log(`Applying migration ${version} (${file})...`)
        
        await client.query('BEGIN')
        try {
          await client.query(sql)
          await client.query(
            'INSERT INTO schema_migrations (version) VALUES ($1)',
            [version]
          )
          await client.query('COMMIT')
          console.log(`Migration ${version} applied successfully`)
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        }
      }
      
      console.log('All migrations completed successfully')
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error)
      process.exit(1)
    })
}
