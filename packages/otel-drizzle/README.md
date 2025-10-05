# @kubiks/otel-drizzle

OpenTelemetry instrumentation for [Drizzle ORM](https://orm.drizzle.team/). Add distributed tracing to your database queries with a single line of code.

![Drizzle ORM Trace Visualization](https://github.com/kubiks-inc/otel/blob/main/images/otel-drizzle-trace.png)

_Visualize your database queries with detailed span information including operation type, SQL statements, and performance metrics._

## Installation

```bash
npm install @kubiks/otel-drizzle
# or
pnpm add @kubiks/otel-drizzle
# or
yarn add @kubiks/otel-drizzle
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `drizzle-orm` >= 0.28.0

## Supported Frameworks

Works with any TypeScript framework and Node.js runtime that Drizzle supports including:

- Next.js
- Fastify
- NestJS
- Nuxt
- And many more...

## Supported Platforms

Works with any observability platform that supports OpenTelemetry including:

- [Kubiks](https://kubiks.ai)
- [Sentry](https://sentry.io)
- [Axiom](https://axiom.co)
- [Datadog](https://www.datadoghq.com)
- [New Relic](https://newrelic.com)
- [SigNoz](https://signoz.io)
- And others ...

## Usage

### Instrument Your Drizzle Database (Recommended)

Use `instrumentDrizzleClient()` to add tracing to your Drizzle database instance. This is the simplest and most straightforward approach:

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";

// Create your Drizzle database instance as usual
const db = drizzle(process.env.DATABASE_URL!);

// Add instrumentation with a single line
instrumentDrizzleClient(db);

// That's it! All queries are now traced automatically
const users = await db.select().from(usersTable);
```

### Database-Specific Examples

#### PostgreSQL

```typescript
// PostgreSQL with postgres.js
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";

// Using connection string directly
const db = drizzle(process.env.DATABASE_URL!);
instrumentDrizzleClient(db, { dbSystem: "postgresql" });

// Or with a client instance
const queryClient = postgres(process.env.DATABASE_URL!);
const db = drizzle({ client: queryClient });
instrumentDrizzleClient(db, {
  dbSystem: "postgresql",
  dbName: "myapp",
  peerName: "db.example.com",
  peerPort: 5432,
});
```

```typescript
// PostgreSQL with node-postgres (pg)
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";

// Using connection string directly
const db = drizzle(process.env.DATABASE_URL!);
instrumentDrizzleClient(db, { dbSystem: "postgresql" });

// Or with a pool instance
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool });
instrumentDrizzleClient(db, { dbSystem: "postgresql" });
```

#### MySQL

```typescript
// MySQL with mysql2
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";

// Using connection string directly
const db = drizzle(process.env.DATABASE_URL!);
instrumentDrizzleClient(db, { dbSystem: "mysql" });

// Or with a connection instance
const connection = await mysql.createConnection({
  host: "localhost",
  user: "root",
  database: "mydb",
  // ... other connection options
});
const db = drizzle({ client: connection });
instrumentDrizzleClient(db, {
  dbSystem: "mysql",
  dbName: "mydb",
  peerName: "localhost",
  peerPort: 3306,
});
```

#### SQLite

```typescript
// SQLite with better-sqlite3
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";

// Using file path directly
const db = drizzle("sqlite.db");
instrumentDrizzleClient(db, { dbSystem: "sqlite" });

// Or with a Database instance
const sqlite = new Database("sqlite.db");
const db = drizzle({ client: sqlite });
instrumentDrizzleClient(db, { dbSystem: "sqlite" });
```

```typescript
// SQLite with LibSQL/Turso
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";

// Using connection config directly
const db = drizzle({
  connection: {
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  }
});
instrumentDrizzleClient(db, { dbSystem: "sqlite" });

// Or with a client instance
const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
const db = drizzle({ client });
instrumentDrizzleClient(db, { dbSystem: "sqlite" });
```

### Configuration Options

```typescript
instrumentDrizzleClient(db, {
  dbSystem: "postgresql",    // Database type: 'postgresql' | 'mysql' | 'sqlite' (default: 'postgresql')
  dbName: "myapp",           // Database name for spans
  captureQueryText: true,    // Include SQL in traces (default: true)
  maxQueryTextLength: 1000,  // Max SQL length (default: 1000)
  peerName: "db.example.com", // Database server hostname
  peerPort: 5432,           // Database server port
});
```


## What You Get

Each database query automatically creates a span with rich telemetry data:

- **Span name**: `drizzle.select`, `drizzle.insert`, `drizzle.update`, etc.
- **Operation type**: `db.operation` attribute (SELECT, INSERT, UPDATE, DELETE, SET)
- **SQL query text**: Full query statement captured in `db.statement` (configurable)
- **Database system**: `db.system` attribute (postgresql, mysql, sqlite, etc.)
- **Transaction tracking**: Transaction queries are marked with `db.transaction` attribute
- **Error tracking**: Exceptions are recorded with stack traces and proper span status
- **Performance metrics**: Duration and timing information for every query

### Transaction Support

All queries within transactions are automatically traced, including:
- RLS (Row Level Security) queries like `SET LOCAL role` and `set_config()`
- All nested transaction queries
- Transaction rollbacks and commits

### Span Attributes

The instrumentation adds the following attributes to each span following [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/database/):

| Attribute        | Description           | Example                               |
| ---------------- | --------------------- | ------------------------------------- |
| `db.operation`   | SQL operation type    | `SELECT`                              |
| `db.statement`   | Full SQL query        | `select "id", "name" from "users"...` |
| `db.system`      | Database system       | `postgresql`                          |
| `db.name`        | Database name         | `myapp`                               |
| `operation.name` | Client operation name | `kubiks_otel-drizzle.client`          |

## License

MIT
