# @kubiks/otel-mongodb

OpenTelemetry instrumentation for the [MongoDB Node.js driver](https://www.mongodb.com/docs/drivers/node/current/).
Capture spans for every MongoDB operation, enrich them with query metadata,
and monitor database performance from your traces.

![MongoDB Trace Visualization](https://github.com/kubiks-inc/otel/blob/main/images/otel-mongodb-trace.png)

_Visualize your MongoDB operations with detailed span information including collection names, operation types, and execution metrics._

## Installation

```bash
npm install @kubiks/otel-mongodb
# or
pnpm add @kubiks/otel-mongodb
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `mongodb` >= 5.0.0

## Quick Start

```ts
import { MongoClient } from "mongodb";
import { instrumentMongoClient } from "@kubiks/otel-mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();

instrumentMongoClient(client, {
  captureFilters: true,
  peerName: "mongodb.example.com",
  peerPort: 27017,
});

const db = client.db("myapp");
const users = db.collection("users");
const user = await users.findOne({ email: "user@example.com" });
```

`instrumentMongoClient` wraps the client you already use — no configuration changes
needed. Every database operation creates a client span with useful attributes.

## What Gets Traced

This instrumentation automatically traces all major MongoDB operations including `find`, `findOne`, `insertOne`, `insertMany`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `aggregate`, `countDocuments`, and atomic operations like `findOneAndUpdate`.

## Span Attributes

Each span includes:

| Attribute                   | Description                           | Example                 |
| --------------------------- | ------------------------------------- | ----------------------- |
| `db.system`                 | Constant value `mongodb`              | `mongodb`               |
| `db.operation`              | MongoDB operation type                | `findOne`, `insertMany` |
| `db.mongodb.collection`     | Collection name                       | `users`                 |
| `db.name`                   | Database name                         | `myapp`                 |
| `net.peer.name`             | MongoDB server hostname               | `mongodb.example.com`   |
| `net.peer.port`             | MongoDB server port                   | `27017`                 |
| `mongodb.filter`            | Query filter (when enabled)           | `{"status":"active"}`   |
| `mongodb.result_count`      | Number of documents returned          | `42`                    |
| `mongodb.inserted_count`    | Number of documents inserted          | `5`                     |
| `mongodb.matched_count`     | Number of documents matched (updates) | `10`                    |
| `mongodb.modified_count`    | Number of documents modified          | `8`                     |
| `mongodb.deleted_count`     | Number of documents deleted           | `15`                    |
| `mongodb.execution_time_ms` | Query execution time (when enabled)   | `42.5`                  |
| `mongodb.pipeline`          | Aggregation pipeline                  | `[{"$match":...}]`      |

The instrumentation captures query metadata to help with debugging and monitoring, while optionally capturing filters based on your security requirements.

## License

MIT
