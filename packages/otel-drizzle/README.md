# @kubiks/otel-drizzle

OpenTelemetry instrumentation for [Drizzle ORM](https://orm.drizzle.team/). Add distributed tracing to your database queries with a single line of code.

## Installation

```bash
npm install @kubiks/otel-drizzle
# or
pnpm add @kubiks/otel-drizzle
# or
yarn add @kubiks/otel-drizzle
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `drizzle-orm` >= 0.28.0

## Usage

Simply wrap your Drizzle client with `instrumentDrizzle()`:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { instrumentDrizzle } from "@kubiks/otel-drizzle";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = instrumentDrizzle(drizzle(pool));

// That's it! All queries are now traced automatically
const users = await db.select().from(usersTable);
```

### Optional Configuration

```typescript
instrumentDrizzle(db, {
  dbSystem: "postgresql", // Database type (default: 'postgresql')
  dbName: "myapp", // Database name for spans
  captureQueryText: true, // Include SQL in traces (default: true)
  maxQueryTextLength: 1000, // Max SQL length (default: 1000)
});
```

### Works with Any Database

```typescript
// PostgreSQL
import { drizzle } from "drizzle-orm/node-postgres";
const db = instrumentDrizzle(drizzle(pool));

// MySQL
import { drizzle } from "drizzle-orm/mysql2";
const db = instrumentDrizzle(drizzle(connection), { dbSystem: "mysql" });

// SQLite
import { drizzle } from "drizzle-orm/better-sqlite3";
const db = instrumentDrizzle(drizzle(sqlite), { dbSystem: "sqlite" });
```

## What You Get

Each database query automatically creates a span with:

- **Span name**: `drizzle.select`, `drizzle.insert`, `drizzle.update`, etc.
- **SQL operation**: Extracted from query (SELECT, INSERT, UPDATE, DELETE)
- **Full SQL query**: Captured and sanitized (configurable)
- **Error tracking**: Exceptions are recorded with stack traces
- **Database metadata**: System, name, host, and port information

Follows [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/database/) for database instrumentation.

## License

MIT
