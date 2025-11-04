# @kubiks/otel-clickhouse

OpenTelemetry instrumentation for [ClickHouse](https://clickhouse.com/). Add distributed tracing to your database queries with detailed execution metrics including read/written rows, bytes, and timing information.

![ClickHouse Trace Visualization](https://github.com/kubiks-inc/otel/blob/main/images/otel-clickhouse-trace.png)

_Visualize your ClickHouse queries with detailed span information including operation type, execution metrics, and performance statistics._

## Features

- ?? **Automatic Query Tracing** - All queries are automatically traced with detailed span information
- ?? **Rich Execution Metrics** - Capture read/written rows, bytes, elapsed time, and more from ClickHouse response headers
- ?? **Operation Detection** - Automatically detects query operation types (SELECT, INSERT, etc.)
- ?? **Configurable Query Capture** - Control whether to include full SQL queries in traces
- ?? **Network Metadata** - Track database server hostname and port
- ? **Zero Overhead** - Minimal performance impact with efficient instrumentation
- ?? **Idempotent** - Safe to call multiple times on the same client

## Installation

```bash
npm install @kubiks/otel-clickhouse
# or
pnpm add @kubiks/otel-clickhouse
# or
yarn add @kubiks/otel-clickhouse
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `@clickhouse/client` >= 0.2.0

## Supported Frameworks

Works with any TypeScript framework and Node.js runtime including:

- Next.js
- Express
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

### Basic Usage

```typescript
import { createClient } from '@clickhouse/client';
import { instrumentClickHouse } from '@kubiks/otel-clickhouse';

// Create your ClickHouse client as usual
const client = createClient({
  host: 'http://localhost:8123',
  username: 'default',
  password: '',
});

// Add instrumentation with a single line
instrumentClickHouse(client);

// That's it! All queries are now traced automatically
const result = await client.query({
  query: 'SELECT * FROM users WHERE id = {id:UInt32}',
  query_params: { id: 1 },
});
```

### With Configuration

```typescript
import { createClient } from '@clickhouse/client';
import { instrumentClickHouse } from '@kubiks/otel-clickhouse';

const client = createClient({
  host: 'http://localhost:8123',
  username: 'default',
  password: '',
});

instrumentClickHouse(client, {
  dbName: 'default',              // Database name for spans
  captureQueryText: true,         // Include SQL in traces (default: true)
  maxQueryTextLength: 1000,       // Max SQL length (default: 1000)
  captureExecutionStats: true,    // Capture execution metrics (default: true)
  peerName: 'localhost',          // Database server hostname
  peerPort: 8123,                 // Database server port
});
```

### ClickHouse Cloud

```typescript
import { createClient } from '@clickhouse/client';
import { instrumentClickHouse } from '@kubiks/otel-clickhouse';

const client = createClient({
  host: 'https://your-instance.clickhouse.cloud:8443',
  username: 'default',
  password: 'your-password',
});

instrumentClickHouse(client, {
  dbName: 'default',
  peerName: 'your-instance.clickhouse.cloud',
  peerPort: 8443,
});

// All queries are now traced with detailed metrics
const result = await client.query({
  query: 'SELECT count() FROM system.tables',
});
```

### With Query Parameters

```typescript
// Parameterized queries are fully supported
const result = await client.query({
  query: `
    SELECT *
    FROM users
    WHERE age > {minAge:UInt8}
      AND city = {city:String}
  `,
  query_params: {
    minAge: 18,
    city: 'New York',
  },
});
```

### Insert Operations

```typescript
// Inserts are automatically traced
await client.insert({
  table: 'users',
  values: [
    { id: 1, name: 'Alice', age: 30 },
    { id: 2, name: 'Bob', age: 25 },
  ],
  format: 'JSONEachRow',
});
```

## Configuration Options

```typescript
interface InstrumentClickHouseConfig {
  /**
   * Custom tracer name. Defaults to "@kubiks/otel-clickhouse".
   */
  tracerName?: string;

  /**
   * Database name to include in spans.
   */
  dbName?: string;

  /**
   * Whether to capture full SQL query text in spans.
   * Defaults to true.
   */
  captureQueryText?: boolean;

  /**
   * Maximum length for captured query text. Queries longer than this
   * will be truncated. Defaults to 1000 characters.
   */
  maxQueryTextLength?: number;

  /**
   * Remote hostname or IP address of the ClickHouse server.
   * Example: "clickhouse.example.com" or "192.168.1.100"
   */
  peerName?: string;

  /**
   * Remote port number of the ClickHouse server.
   * Example: 8123 for HTTP, 9000 for native protocol
   */
  peerPort?: number;

  /**
   * Whether to capture ClickHouse execution statistics from response headers.
   * This includes read/written rows, bytes, elapsed time, etc.
   * Defaults to true.
   */
  captureExecutionStats?: boolean;
}
```

## What You Get

Each database query automatically creates a span with rich telemetry data:

### Basic Attributes

- **Span name**: `clickhouse.select`, `clickhouse.insert`, `clickhouse.update`, etc.
- **Operation type**: `db.operation` attribute (SELECT, INSERT, UPDATE, DELETE, ALTER, etc.)
- **SQL query text**: Full query statement captured in `db.statement` (configurable)
- **Database system**: `db.system` attribute (always "clickhouse")
- **Database name**: `db.name` attribute (if configured)
- **Network info**: `net.peer.name` and `net.peer.port` attributes (if configured)

### ClickHouse Execution Metrics

When `captureExecutionStats` is enabled (default), the following metrics are captured from ClickHouse response headers:

| Attribute                              | Description                                      | Example   |
| -------------------------------------- | ------------------------------------------------ | --------- |
| `clickhouse.read_rows`                 | Number of rows read from tables                  | `1000`    |
| `clickhouse.read_bytes`                | Number of bytes read from tables                 | `8192`    |
| `clickhouse.written_rows`              | Number of rows written to tables                 | `100`     |
| `clickhouse.written_bytes`             | Number of bytes written to tables                | `4096`    |
| `clickhouse.total_rows_to_read`        | Total number of rows to be read                  | `1000`    |
| `clickhouse.result_rows`               | Number of rows in the result set                 | `50`      |
| `clickhouse.result_bytes`              | Number of bytes in the result set                | `2048`    |
| `clickhouse.elapsed_ns`                | Query execution time in nanoseconds              | `1500000` |
| `clickhouse.real_time_microseconds`    | Real execution time in microseconds (CH 24.9+)   | `1500`    |

### Error Tracking

- Exceptions are recorded with stack traces
- Proper span status codes (OK or ERROR)
- Full error context for debugging

### Performance Metrics

- Duration and timing information for every query
- Detailed execution statistics from ClickHouse
- Network latency insights

## Span Attributes Reference

The instrumentation adds the following attributes to each span following [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/database/):

### Standard Database Attributes

| Attribute        | Description           | Example                                    |
| ---------------- | --------------------- | ------------------------------------------ |
| `db.system`      | Database system       | `clickhouse`                               |
| `db.operation`   | SQL operation type    | `SELECT`                                   |
| `db.statement`   | Full SQL query        | `SELECT * FROM users WHERE id = 1`         |
| `db.name`        | Database name         | `default`                                  |
| `net.peer.name`  | Server hostname       | `clickhouse.example.com`                   |
| `net.peer.port`  | Server port           | `8123`                                     |

### ClickHouse-Specific Attributes

All ClickHouse execution metrics are captured as attributes (see table above).

## Example Trace Output

```json
{
  "name": "clickhouse.select",
  "kind": "CLIENT",
  "status": "OK",
  "attributes": {
    "db.system": "clickhouse",
    "db.operation": "SELECT",
    "db.statement": "SELECT * FROM users WHERE age > 18",
    "db.name": "default",
    "net.peer.name": "localhost",
    "net.peer.port": 8123,
    "clickhouse.read_rows": 1000,
    "clickhouse.read_bytes": 8192,
    "clickhouse.result_rows": 50,
    "clickhouse.result_bytes": 2048,
    "clickhouse.elapsed_ns": 1500000
  }
}
```

## Best Practices

### 1. Configure Database Name

Always set the `dbName` option to help identify which database queries are targeting:

```typescript
instrumentClickHouse(client, {
  dbName: 'analytics',
});
```

### 2. Set Network Information

Include `peerName` and `peerPort` for better observability:

```typescript
instrumentClickHouse(client, {
  peerName: 'clickhouse.prod.example.com',
  peerPort: 8123,
});
```

### 3. Control Query Text Capture

For sensitive queries, you can disable query text capture:

```typescript
instrumentClickHouse(client, {
  captureQueryText: false,
});
```

Or limit the query length:

```typescript
instrumentClickHouse(client, {
  maxQueryTextLength: 500,
});
```

### 4. Use with OpenTelemetry SDK

Make sure to set up the OpenTelemetry SDK before instrumenting:

```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

// Set up the tracer provider
const provider = new NodeTracerProvider();
provider.register();

// Then instrument your ClickHouse client
instrumentClickHouse(client);
```

## Troubleshooting

### No spans are being created

Make sure you have:
1. Set up the OpenTelemetry SDK properly
2. Registered a tracer provider
3. Configured an exporter
4. Called `instrumentClickHouse()` after creating the client

### Execution stats are not captured

The ClickHouse client must return response headers with the query summary. This is the default behavior for the official `@clickhouse/client` package.

If you're not seeing execution stats:
1. Verify you're using `@clickhouse/client` >= 0.2.0
2. Check that `captureExecutionStats` is not set to `false`
3. Ensure the query is actually executing (not cached or erroring)

## License

MIT
