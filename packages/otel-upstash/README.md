# @kubiks/otel-upstash

OpenTelemetry instrumentation for the [Upstash QStash](https://upstash.com/docs/qstash) Node.js SDK.
Capture spans for every QStash API call, enrich them with operation metadata,
and keep an eye on message queue operations from your traces.

## Installation

```bash
npm install @kubiks/otel-upstash
# or
pnpm add @kubiks/otel-upstash
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `@upstash/qstash` >= 2.0.0

## Quick Start

```ts
import { Client } from "@upstash/qstash";
import { instrumentUpstash } from "@kubiks/otel-upstash";

const client = instrumentUpstash(
  new Client({ token: process.env.QSTASH_TOKEN! })
);

await client.publishJSON({
  url: "https://your-api-endpoint.com/process-image",
  body: { imageId: "123" },
});
```

`instrumentUpstash` wraps the QStash client instance you already use — no configuration changes
needed. Every SDK call creates a client span with useful attributes.

## What Gets Traced

This instrumentation specifically wraps the `client.publishJSON` method, creating a single clean span for each message publish operation.

## Span Attributes

Each span includes:

| Attribute                      | Description                                 | Example                                      |
| ------------------------------ | ------------------------------------------- | -------------------------------------------- |
| `messaging.system`             | Constant value `qstash`                     | `qstash`                                     |
| `messaging.operation`          | Operation type                              | `publish`                                    |
| `qstash.resource`              | Resource name                               | `messages`                                   |
| `qstash.target`                | Full operation target                       | `messages.publish`                           |
| `qstash.url`                   | Target URL for the message                  | `https://example.com/api/process`            |
| `qstash.method`                | HTTP method (default: POST)                 | `POST`, `PUT`, `GET`                         |
| `qstash.message_id`            | Message ID returned by QStash               | `msg_123`                                    |
| `qstash.delay`                 | Delay before processing (seconds or string) | `60` or `"1h"`                               |
| `qstash.not_before`            | Unix timestamp for earliest processing      | `1672531200`                                 |
| `qstash.deduplication_id`      | Deduplication ID for idempotent operations  | `unique-id-123`                              |
| `qstash.retries`               | Number of retry attempts                    | `3`                                          |
| `qstash.callback_url`          | Success callback URL                        | `https://example.com/callback`               |
| `qstash.failure_callback_url`  | Failure callback URL                        | `https://example.com/failure`                |

The instrumentation captures message metadata and configuration to help with debugging and monitoring, while avoiding sensitive message content.

## Usage Examples

### Basic Message Publishing

```ts
import { Client } from "@upstash/qstash";
import { instrumentUpstash } from "@kubiks/otel-upstash";

const client = instrumentUpstash(
  new Client({ token: process.env.QSTASH_TOKEN! })
);

// Publish a message
await client.publishJSON({
  url: "https://your-api.com/webhook",
  body: {
    userId: "user_123",
    action: "process_data",
  },
});
```

### Delayed Message Publishing

```ts
// Delay message processing by 60 seconds
await client.publishJSON({
  url: "https://your-api.com/delayed-task",
  body: { taskId: "task_456" },
  delay: 60,
});

// Or use a human-readable delay
await client.publishJSON({
  url: "https://your-api.com/delayed-task",
  body: { taskId: "task_789" },
  delay: "1h", // 1 hour
});
```

### Message with Callbacks

```ts
await client.publishJSON({
  url: "https://your-api.com/process",
  body: { orderId: "order_123" },
  callback: "https://your-api.com/success",
  failureCallback: "https://your-api.com/failure",
});
```

### Message with Retries and Deduplication

```ts
await client.publishJSON({
  url: "https://your-api.com/critical-task",
  body: { taskId: "critical_123" },
  retries: 5,
  deduplicationId: "task-critical-123",
});
```

### Scheduled Message

```ts
// Schedule for a specific time
const scheduledTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

await client.publishJSON({
  url: "https://your-api.com/scheduled-task",
  body: { reportId: "report_456" },
  notBefore: scheduledTime,
});
```

### Next.js Integration Example

```ts
// app/actions.ts
"use server";
import { Client } from "@upstash/qstash";
import { instrumentUpstash } from "@kubiks/otel-upstash";

const qstashClient = instrumentUpstash(
  new Client({
    token: process.env.QSTASH_TOKEN!,
  })
);

export async function startBackgroundJob() {
  await qstashClient.publishJSON({
    url: "https://your-app.vercel.app/api/process",
    body: {
      userId: "user_123",
      timestamp: Date.now(),
    },
  });
}
```

## How It Works

The instrumentation creates OpenTelemetry spans for QStash operations by:

1. Wrapping the `publishJSON` method of the QStash client
2. Creating a span before the operation starts
3. Adding relevant attributes from the request parameters
4. Capturing the message ID from the response
5. Recording any errors that occur
6. Properly closing the span with success or error status

All of this happens automatically once you wrap your client with `instrumentUpstash()`.

## Best Practices

1. **Instrument Early**: Call `instrumentUpstash()` when you create your QStash client, typically at application startup.

2. **Reuse the Client**: Create one instrumented client and reuse it throughout your application.

3. **Use Deduplication IDs**: For idempotent operations, always provide a `deduplicationId` to prevent duplicate processing.

4. **Monitor Traces**: Use OpenTelemetry-compatible tracing backends (like Jaeger, Zipkin, or cloud providers) to visualize your message queues.

5. **Set Appropriate Retries**: Configure retry counts based on the criticality and nature of your tasks.

## License

MIT