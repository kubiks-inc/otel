# @kubiks/otel-mongodb

OpenTelemetry instrumentation for the [MongoDB Node.js driver](https://www.mongodb.com/docs/drivers/node/current/). Add distributed tracing to your MongoDB queries with a single line of code.

![MongoDB Trace Visualization](https://github.com/kubiks-inc/otel/blob/main/images/otel-mongodb-trace.png)

_Visualize your MongoDB operations with detailed span information including collection names, operation types, and performance metrics._

## Installation

```bash
npm install @kubiks/otel-mongodb
# or
pnpm add @kubiks/otel-mongodb
# or
yarn add @kubiks/otel-mongodb
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `mongodb` >= 5.0.0

## Supported Frameworks

Works with any TypeScript/JavaScript framework and Node.js runtime including:

- Next.js
- Express
- Fastify
- NestJS
- Koa
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

## Quick Start

### Basic Instrumentation (Recommended)

Use `instrumentMongoClient()` to add tracing to your MongoDB client. This automatically instruments all databases and collections accessed through the client:

```typescript
import { MongoClient } from "mongodb";
import { instrumentMongoClient } from "@kubiks/otel-mongodb";

// Create your MongoDB client as usual
const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();

// Add instrumentation with a single line
instrumentMongoClient(client, {
  captureFilters: true,
  peerName: "mongodb.example.com",
  peerPort: 27017,
});

// That's it! All queries are now traced automatically
const db = client.db("myapp");
const users = db.collection("users");
const user = await users.findOne({ email: "user@example.com" });
```

### With Execution Stats (Performance Monitoring)

To capture execution time and performance metrics, enable command monitoring:

```typescript
import { MongoClient } from "mongodb";
import { instrumentMongoClient } from "@kubiks/otel-mongodb";

// IMPORTANT: You must enable monitorCommands for execution stats
const client = new MongoClient(process.env.MONGODB_URI!, {
  monitorCommands: true, // Required for captureExecutionStats
});
await client.connect();

instrumentMongoClient(client, {
  captureExecutionStats: true, // Now this will work!
  captureFilters: true,
});

// All queries now include execution_time_ms in spans
const db = client.db("myapp");
const users = db.collection("users");
const user = await users.findOne({ email: "user@example.com" });
```

**Advanced Usage:** For fine-grained control, you can also instrument at the database level with `instrumentDb()` or at the collection level with `instrumentCollection()`. See the Configuration section for details.

## What Gets Traced

This instrumentation automatically traces all major MongoDB operations:

### Query Operations

- `find()` - Find documents (traced when `toArray()` is called)
- `findOne()` - Find a single document
- `countDocuments()` - Count matching documents
- `aggregate()` - Aggregation pipeline (traced when `toArray()` is called)

### Write Operations

- `insertOne()` - Insert a single document
- `insertMany()` - Insert multiple documents
- `updateOne()` - Update a single document
- `updateMany()` - Update multiple documents
- `replaceOne()` - Replace an entire document
- `deleteOne()` - Delete a single document
- `deleteMany()` - Delete multiple documents

### Atomic Operations

- `findOneAndUpdate()` - Atomically find and update a document
- `findOneAndDelete()` - Atomically find and delete a document
- `findOneAndReplace()` - Atomically find and replace a document

Each operation creates a span with rich telemetry data including collection name, operation type, result counts, and optional query filters.

**Note on Cursors**: For `find()` and `aggregate()`, the span is created when you call `.toArray()` to fetch results, not when the cursor is created. This ensures accurate timing and prevents memory leaks from unclosed cursors.

## Span Attributes

The instrumentation adds the following attributes to each span following [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/database/):

### Common Attributes (All Operations)

| Attribute               | Description             | Example                 |
| ----------------------- | ----------------------- | ----------------------- |
| `db.system`             | Database system         | `mongodb`               |
| `db.operation`          | MongoDB operation type  | `findOne`, `insertMany` |
| `db.mongodb.collection` | Collection name         | `users`                 |
| `db.name`               | Database name           | `myapp`                 |
| `net.peer.name`         | MongoDB server hostname | `mongodb.example.com`   |
| `net.peer.port`         | MongoDB server port     | `27017`                 |

### Operation-Specific Attributes

| Attribute                | Operations            | Description                    | Example                  |
| ------------------------ | --------------------- | ------------------------------ | ------------------------ |
| `mongodb.filter`         | Query, Update, Delete | Query filter (when enabled)    | `{"status":"active"}`    |
| `db.statement`           | Query, Update, Delete | Query statement (when enabled) | `filter: {"status":...}` |
| `mongodb.result_count`   | Query                 | Number of documents returned   | `42`                     |
| `mongodb.inserted_count` | Insert                | Number of documents inserted   | `5`                      |
| `mongodb.matched_count`  | Update                | Number of documents matched    | `10`                     |
| `mongodb.modified_count` | Update                | Number of documents modified   | `8`                      |
| `mongodb.upserted_count` | Update                | Number of documents upserted   | `2`                      |
| `mongodb.deleted_count`  | Delete                | Number of documents deleted    | `15`                     |
| `mongodb.pipeline`       | Aggregation           | Aggregation pipeline           | `[{"$match":...}]`       |

### Execution Stats (Optional)

When `captureExecutionStats` is enabled with `monitorCommands: true`:

| Attribute                   | Description                              | Example |
| --------------------------- | ---------------------------------------- | ------- |
| `mongodb.execution_time_ms` | Query execution time in milliseconds     | `42.5`  |
| `mongodb.reply_count`       | Count from server reply (when present)   | `10`    |
| `mongodb.reply_modified`    | Modified count from reply (when present) | `5`     |

**Note**: Detailed query analysis stats like `docs_examined` and `keys_examined` are only available in MongoDB's `system.profile` collection and must be queried separately when profiling is enabled.

## Configuration Options

All instrumentation functions accept an optional configuration object:

```typescript
interface InstrumentMongoDBConfig {
  /**
   * Custom tracer name. Defaults to "@kubiks/otel-mongodb".
   */
  tracerName?: string;

  /**
   * Database name to include in spans.
   * Auto-populated from the database when using instrumentDb.
   */
  dbName?: string;

  /**
   * Whether to capture query filters in spans.
   * Defaults to false for security (filters may contain sensitive data).
   */
  captureFilters?: boolean;

  /**
   * Maximum length for captured filter text.
   * Filters longer than this will be truncated.
   * Defaults to 500 characters.
   */
  maxFilterLength?: number;

  /**
   * Whether to capture execution statistics from command monitoring.
   * This captures execution time for all queries.
   *
   * IMPORTANT: Requires MongoClient to be created with monitorCommands: true
   * Example: new MongoClient(uri, { monitorCommands: true })
   *
   * Only works when instrumenting the MongoClient. Defaults to false.
   */
  captureExecutionStats?: boolean;

  /**
   * Remote hostname or IP address of the MongoDB server.
   * Example: "mongodb.example.com" or "192.168.1.100"
   */
  peerName?: string;

  /**
   * Remote port number of the MongoDB server.
   * Example: 27017
   */
  peerPort?: number;
}
```

### Example with Common Options

```typescript
instrumentMongoClient(client, {
  tracerName: "my-app-mongodb",
  captureFilters: true,
  maxFilterLength: 1000,
  captureExecutionStats: true,
  peerName: "mongodb-prod.example.com",
  peerPort: 27017,
});
```

## Usage Examples

### Basic Query and Write Operations

```typescript
import { MongoClient } from "mongodb";
import { instrumentMongoClient } from "@kubiks/otel-mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
instrumentMongoClient(client);

const db = client.db("myapp");
const users = db.collection("users");

// Query operations
const user = await users.findOne({ email: "user@example.com" });
const activeUsers = await users.find({ status: "active" }).toArray();
const count = await users.countDocuments({ status: "active" });

// Write operations
await users.insertOne({ name: "Jane", email: "jane@example.com" });
await users.updateOne(
  { email: "user@example.com" },
  { $set: { status: "inactive" } }
);
await users.deleteMany({ status: "deleted" });
```

### Next.js Integration

```typescript
// lib/mongodb.ts
import { MongoClient } from "mongodb";
import { instrumentMongoClient } from "@kubiks/otel-mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error("Please add your MongoDB URI to .env.local");
}

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  // In development, use a global variable to preserve the client across hot reloads
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    instrumentMongoClient(client, {
      captureFilters: process.env.NODE_ENV === "development",
    });
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // In production, create a new client
  client = new MongoClient(uri, options);
  instrumentMongoClient(client, {
    peerName: process.env.MONGODB_HOST,
    peerPort: parseInt(process.env.MONGODB_PORT || "27017"),
  });
  clientPromise = client.connect();
}

export default clientPromise;
```

```typescript
// app/api/users/route.ts
import clientPromise from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("myapp");
    const users = await db
      .collection("users")
      .find({ status: "active" })
      .limit(10)
      .toArray();

    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
```

## Security Considerations

### Filter Capture

By default, `captureFilters` is set to `false` because query filters may contain sensitive information such as user IDs, email addresses, PII, API keys, or private business logic.

**Enable filter capture only in development or with proper data sanitization:**

```typescript
instrumentMongoClient(client, {
  // Enable in development for debugging
  captureFilters: process.env.NODE_ENV === "development",
  // Limit captured data
  maxFilterLength: 500,
});
```

**Best Practices:**

- Use environment-specific configuration (enable detailed tracing in development only)
- Review captured data to ensure no sensitive information leaks into traces
- Use `maxFilterLength` to prevent large payloads
- Monitor trace storage costs as filter capture increases trace size

## Performance Considerations

This instrumentation adds minimal overhead to your MongoDB operations:

- **Span creation**: ~0.1-0.5ms per operation
- **Attribute collection**: ~0.05ms per operation
- **Filter serialization**: ~0.1-1ms (only when `captureFilters` is enabled)
- **Command monitoring**: ~0.05ms per operation (only when `captureExecutionStats` is enabled)

The instrumentation is:

- **Non-blocking**: All tracing happens asynchronously
- **Error-safe**: Instrumentation errors never affect your queries
- **Idempotent**: Safe to call multiple times on the same client/database/collection

## Troubleshooting

### No spans appearing

1. Ensure you've configured an OpenTelemetry SDK and exporter
2. Verify the client is instrumented before making queries
3. Check that your observability platform is receiving traces

### Execution stats not captured

If you enabled `captureExecutionStats` but don't see `mongodb.execution_time_ms` in your spans:

1. **Most common issue**: MongoClient wasn't created with `monitorCommands: true`

   ```typescript
   // ❌ Wrong - command monitoring disabled
   const client = new MongoClient(uri);

   // ✅ Correct - command monitoring enabled
   const client = new MongoClient(uri, { monitorCommands: true });
   ```

2. Ensure you're using `instrumentMongoClient()` (not `instrumentDb` or `instrumentCollection`)

3. Verify `captureExecutionStats: true` is in your config:
   ```typescript
   instrumentMongoClient(client, { captureExecutionStats: true });
   ```

### Detailed query analysis stats not in traces

Stats like `docs_examined`, `keys_examined`, and `index_name` are not automatically captured. These are only available in MongoDB's `system.profile` collection.

To access these metrics:

1. Enable profiling: `await db.command({ profile: 1, slowms: 100 })`
2. Query the profile collection separately for detailed analysis:
   ```typescript
   const slowQueries = await db
     .collection("system.profile")
     .find({ millis: { $gte: 100 } })
     .sort({ ts: -1 })
     .limit(10)
     .toArray();
   ```

This is intentional to avoid performance overhead of querying `system.profile` on every operation.

### Filters not captured

Ensure `captureFilters` is set to `true` in the configuration:

```typescript
instrumentMongoClient(client, { captureFilters: true });
```

### Missing database name

The database name is automatically populated when using `instrumentDb` or `instrumentMongoClient`. For `instrumentCollection`, provide it explicitly:

```typescript
instrumentCollection(collection, { dbName: "myapp" });
```

## License

MIT
