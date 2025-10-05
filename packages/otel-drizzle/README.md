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

There are two ways to instrument Drizzle ORM with OpenTelemetry:

### Option 1: Instrument the Connection Pool (Recommended)

Wrap your database connection pool with `instrumentDrizzle()` before passing it to Drizzle:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { instrumentDrizzle } from "@kubiks/otel-drizzle";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const instrumentedPool = instrumentDrizzle(pool);
const db = drizzle(instrumentedPool);

// That's it! All queries are now traced automatically
const users = await db.select().from(usersTable);
```

### Option 2: Instrument an Existing Drizzle Client

If you already have a Drizzle database instance or don't have access to the underlying pool, use `instrumentDrizzleClient()`. This method instruments the database at the session level, capturing all query operations:

```typescript
// Works with postgres-js (Postgres.js)
import { drizzle } from "drizzle-orm/postgres-js";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";
import * as schema from "./schema";

const db = drizzle(process.env.DATABASE_URL!, { schema });

// Instrument the existing database instance
instrumentDrizzleClient(db);

// All queries are now traced automatically
const users = await db.select().from(schema.users);
// Direct execute calls are also traced
await db.execute("SELECT * FROM users");
// Transactions are also traced
await db.transaction(async (tx) => {
  await tx.insert(schema.users).values({ name: "John" });
});
```

### Optional Configuration

Both instrumentation methods accept the same configuration options:

```typescript
// Option 1: Instrument the pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const instrumentedPool = instrumentDrizzle(pool, {
  dbSystem: "postgresql", // Database type (default: 'postgresql')
  dbName: "myapp", // Database name for spans
  captureQueryText: true, // Include SQL in traces (default: true)
  maxQueryTextLength: 1000, // Max SQL length (default: 1000)
  peerName: "db.example.com", // Database server hostname
  peerPort: 5432, // Database server port
});
const db = drizzle(instrumentedPool);

// Option 2: Instrument the Drizzle client
const db = drizzle(pool, { schema });
instrumentDrizzleClient(db, {
  dbSystem: "postgresql",
  dbName: "myapp",
  captureQueryText: true,
  peerName: "db.example.com",
  peerPort: 5432,
});
```

### Works with All Drizzle-Supported Databases

This package automatically detects and instruments **all databases that Drizzle ORM supports**. It works by detecting whether your database driver uses a `query` or `execute` method and instrumenting it appropriately. This includes:

- **PostgreSQL** (node-postgres, postgres.js, Neon, Vercel Postgres, etc.)
- **MySQL** (mysql2, PlanetScale, TiDB, etc.) 
- **SQLite** (better-sqlite3, LibSQL/Turso, Cloudflare D1, etc.)
- **And any other Drizzle-supported database**

```typescript
// PostgreSQL with postgres-js (Postgres.js) - use instrumentDrizzleClient
import { drizzle } from "drizzle-orm/postgres-js";
const db = drizzle(process.env.DATABASE_URL!);
instrumentDrizzleClient(db);

// PostgreSQL with node-postgres (pg) - use instrumentDrizzle on pool
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(instrumentDrizzle(pool));

// MySQL with mysql2 (uses 'execute' or 'query' method)
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(instrumentDrizzle(connection, { dbSystem: "mysql" }));

// SQLite with better-sqlite3
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
const sqlite = new Database("database.db");
const db = drizzle(instrumentDrizzle(sqlite, { dbSystem: "sqlite" }));

// LibSQL/Turso (uses 'execute' method)
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
const client = createClient({ url: "...", authToken: "..." });
const db = drizzle(instrumentDrizzle(client, { dbSystem: "sqlite" }));
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
