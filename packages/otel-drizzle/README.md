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

Simply wrap your database connection pool with `instrumentDrizzle()` before passing it to Drizzle:

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

### Optional Configuration

```typescript
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
```

### Works with All Drizzle-Supported Databases

This package supports **all databases that Drizzle ORM supports**, including PostgreSQL, MySQL, SQLite, Turso, Neon, PlanetScale, and more.

```typescript
// PostgreSQL with node-postgres
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(instrumentDrizzle(pool));

// MySQL with mysql2
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(instrumentDrizzle(connection, { dbSystem: "mysql" }));

// SQLite with better-sqlite3
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
const sqlite = new Database("database.db");
const db = drizzle(instrumentDrizzle(sqlite, { dbSystem: "sqlite" }));
```

## What You Get

Each database query automatically creates a span with rich telemetry data:

- **Span name**: `drizzle.select`, `drizzle.insert`, `drizzle.update`, etc.
- **Operation type**: `db.operation` attribute (SELECT, INSERT, UPDATE, DELETE)
- **SQL query text**: Full query statement captured in `db.statement` (configurable)
- **Database system**: `db.system` attribute (postgresql, mysql, sqlite, etc.)
- **Error tracking**: Exceptions are recorded with stack traces and proper span status
- **Performance metrics**: Duration and timing information for every query

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
