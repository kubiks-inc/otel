# @kubiks/otel-drizzle

OpenTelemetry instrumentation for [Drizzle ORM](https://orm.drizzle.team/).

## Installation

```bash
npm install @kubiks/otel-drizzle
# or
pnpm add @kubiks/otel-drizzle
# or
yarn add @kubiks/otel-drizzle
```

## Peer Dependencies

This package requires:
- `@opentelemetry/api` >= 1.9.0
- `drizzle-orm` >= 0.28.0

## Usage

### Basic Usage

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { instrumentDrizzle } from '@kubiks/otel-drizzle';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

// Instrument the Drizzle client
instrumentDrizzle(db);

// All queries will now be traced
const users = await db.select().from(usersTable);
```

### With Configuration

```typescript
import { instrumentDrizzle } from '@kubiks/otel-drizzle';

instrumentDrizzle(db, {
  // Custom tracer name (default: "@kubiks/otel-drizzle")
  tracerName: 'my-app-drizzle',
  
  // Database system (default: "postgresql")
  dbSystem: 'postgresql',
  
  // Database name to include in spans
  dbName: 'myapp_production',
  
  // Whether to capture SQL query text (default: true)
  captureQueryText: true,
  
  // Maximum query text length (default: 1000)
  maxQueryTextLength: 500,
  
  // Remote hostname or IP address of the database server
  peerName: 'db.example.com',
  
  // Remote port number of the database server
  peerPort: 5432,
});
```

### With Different Database Drivers

#### PostgreSQL

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({ 
  host: 'db.example.com',
  port: 5432,
  database: 'myapp',
});
const db = instrumentDrizzle(drizzle(pool), {
  dbSystem: 'postgresql',
  peerName: 'db.example.com',
  peerPort: 5432,
});
```

#### MySQL

```typescript
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  port: 3306,
  user: 'root',
  database: 'test',
});

const db = instrumentDrizzle(drizzle(connection), {
  dbSystem: 'mysql',
  peerName: 'localhost',
  peerPort: 3306,
});
```

#### SQLite

```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('sqlite.db');
const db = instrumentDrizzle(drizzle(sqlite), {
  dbSystem: 'sqlite',
});
```

### With Vercel OTel SDK

```typescript
// instrumentation.ts
import { registerOTel } from '@vercel/otel';
import { drizzle } from 'drizzle-orm/node-postgres';
import { instrumentDrizzle } from '@kubiks/otel-drizzle';
import { pool } from './db';

export function register() {
  registerOTel({
    serviceName: 'my-app',
  });

  // Instrument your Drizzle client
  const db = drizzle(pool);
  instrumentDrizzle(db, {
    dbName: process.env.DATABASE_NAME,
  });
}
```

## Features

### Automatic Span Creation

The instrumentation automatically creates spans for all database queries with:
- **Span name**: `drizzle.{operation}` (e.g., `drizzle.select`, `drizzle.insert`)
- **Span kind**: `CLIENT`
- **Status**: `OK` for successful queries, `ERROR` for failed queries

### Captured Attributes

Each span includes the following attributes following [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/database/):

| Attribute | Description | Example |
|-----------|-------------|---------|
| `db.system` | Database system identifier | `postgresql`, `mysql`, `sqlite` |
| `db.operation` | SQL operation type | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| `db.statement` | Full SQL query (sanitized and truncated) | `SELECT * FROM users WHERE id = $1` |
| `db.name` | Database name (if configured) | `myapp_production` |
| `net.peer.name` | Remote hostname or IP address (if configured) | `db.example.com`, `192.168.1.100` |
| `net.peer.port` | Remote port number (if configured) | `5432`, `3306` |

### Error Tracking

When queries fail, the instrumentation:
- Records the exception with full stack trace
- Sets span status to `ERROR`
- Propagates the error to your application

### Performance

The instrumentation is designed to be lightweight:
- Minimal overhead on query execution
- No blocking operations
- Efficient span creation and finalization

## Configuration Options

### `InstrumentDrizzleConfig`

```typescript
interface InstrumentDrizzleConfig {
  /**
   * Custom tracer name.
   * @default "@kubiks/otel-drizzle"
   */
  tracerName?: string;

  /**
   * Database system identifier (e.g., "postgresql", "mysql", "sqlite").
   * @default "postgresql"
   */
  dbSystem?: string;

  /**
   * Database name to include in spans.
   */
  dbName?: string;

  /**
   * Whether to capture full SQL query text in spans.
   * @default true
   */
  captureQueryText?: boolean;

  /**
   * Maximum length for captured query text.
   * Queries longer than this will be truncated.
   * @default 1000
   */
  maxQueryTextLength?: number;

  /**
   * Remote hostname or IP address of the database server.
   * Example: "db.example.com" or "192.168.1.100"
   */
  peerName?: string;

  /**
   * Remote port number of the database server.
   * Example: 5432 for PostgreSQL, 3306 for MySQL
   */
  peerPort?: number;
}
```

## Best Practices

### 1. Security - Query Text Sanitization

By default, the instrumentation captures full SQL queries. If your queries contain sensitive data:

```typescript
instrumentDrizzle(db, {
  // Disable query text capture
  captureQueryText: false,
  
  // Or limit query length
  maxQueryTextLength: 100,
});
```

### 2. Performance - Instrumentation Timing

Instrument your Drizzle client **once** at application startup:

```typescript
// ✅ Good: Instrument once
const db = drizzle(pool);
instrumentDrizzle(db);

// ❌ Bad: Don't instrument on every request
app.get('/users', async (req, res) => {
  instrumentDrizzle(db); // Unnecessary
  const users = await db.select().from(usersTable);
});
```

### 3. Multiple Clients

If you have multiple Drizzle clients, instrument each one:

```typescript
const mainDb = instrumentDrizzle(drizzle(mainPool), {
  dbName: 'main',
});

const analyticsDb = instrumentDrizzle(drizzle(analyticsPool), {
  dbName: 'analytics',
});
```

## Compatibility

- **Drizzle ORM**: >= 0.28.0
- **Node.js**: >= 18.19.0 || >= 20.6.0
- **OpenTelemetry API**: >= 1.9.0

## License

MIT

## Related Packages

- [@vercel/otel](https://www.npmjs.com/package/@vercel/otel) - Vercel's OpenTelemetry SDK
- [@kubiks/otel-drizzle](https://www.npmjs.com/package/@kubiks/otel-drizzle) - This package
- [drizzle-orm](https://www.npmjs.com/package/drizzle-orm) - Drizzle ORM
