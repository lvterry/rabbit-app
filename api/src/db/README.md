# Database Layer

This directory contains database migrations, connection management, and repository implementations.

## ⚠️ Security Notice: Migration Passwords

The passwords in migration files (`*_changeme`) are **for local development with docker-compose ONLY**.

**NEVER use these passwords in production or staging environments.**

### Production Setup

For real environments:
1. **Use environment-injected passwords**: Set `POSTGRES_PASSWORD` via environment variables or secrets management
2. **No LOGIN passwords in SQL**: Use `ALTER ROLE ... LOGIN` without embedding passwords in migration files
3. **Role-level configuration**: Apply `ALTER ROLE app_rw SET timezone = 'UTC'` and other settings via infrastructure code, not migrations
4. **Rotate credentials**: Change default passwords immediately after provisioning

### Local Development (docker-compose)

The `docker-compose.yml` in the project root uses hardcoded passwords for convenience:
- `rabbit_local_password` for the postgres user
- `app_password_changeme` for application roles

These are acceptable for local development only because:
- The database is not exposed to the network
- Data is ephemeral (can be destroyed and recreated)
- No production data ever touches local docker

### Migration Files

Current migrations with embedded passwords:
- `001_initial_schema.sql`: Creates roles with `*_changeme` passwords
- `002_apply_package_transaction_security_definer.sql`: Uses `app_rw` role

When deploying:
1. Replace password literals with environment variable lookups (if your migration runner supports it)
2. OR run role creation separately via infrastructure tooling
3. OR use managed PostgreSQL services that handle role provisioning

## Connection Management

`connection.ts` provides connection pool with:
- **Forced UTC timezone**: Prevents ambient TZ drift affecting timestamptz operations
- Configurable pool size, timeouts
- Singleton pattern for efficient connection reuse

## Repository Implementations

All repository implementations follow these patterns:
- **Transaction boundaries**: Complex operations use explicit `BEGIN`/`COMMIT`/`ROLLBACK`
- **Row locking**: Critical sections use `FOR UPDATE` to prevent race conditions
- **Error handling**: Constraint violations propagate with their native PostgreSQL error codes
- **Type mapping**: Database rows mapped to `@rabbit/shared` types

See individual repository files for detailed documentation.
