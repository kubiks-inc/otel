# @kubiks/otel-upstash-queues

OpenTelemetry instrumentation for the [Upstash QStash](https://upstash.com/docs/qstash) Node.js SDK.
Capture spans for every QStash API call, enrich them with operation metadata,
and keep an eye on message queue operations from your traces.

![Upstash QStash Trace Visualization](https://github.com/kubiks-inc/otel/blob/main/images/otel-upstash-queue-trace.png)

_Visualize your message queue operations with detailed span information including message publishing, callbacks, and delivery tracking._

## Installation

```bash
npm install @kubiks/otel-upstash-queues
# or
pnpm add @kubiks/otel-upstash-queues
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `@upstash/qstash` >= 2.0.0

## Quick Start

### Publishing Messages

```ts
import { Client } from "@upstash/qstash";
import { instrumentUpstash } from "@kubiks/otel-upstash-queues";

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

### Consuming Messages

```ts
// app/api/process/route.ts
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { instrumentConsumer } from "@kubiks/otel-upstash-queues";

async function handler(request: Request) {
  const data = await request.json();
  
  // Process your message
  await processImage(data.imageId);
  
  return Response.json({ success: true });
}

// Instrument first, then verify signature
export const POST = verifySignatureAppRouter(instrumentConsumer(handler));
```

`instrumentConsumer` wraps your message handler to trace message consumption, creating a SERVER span for each message received and processed.

### With Body Capture

Optionally capture request/response bodies for debugging:

```ts
const client = instrumentUpstash(
  new Client({ token: process.env.QSTASH_TOKEN! }),
  {
    captureBody: true,      // Enable body capture (default: false)
    maxBodyLength: 2048,    // Max characters to capture (default: 1024)
  }
);
```

## What Gets Traced

This instrumentation provides two main functions:

1. **`instrumentUpstash`** - Wraps the QStash client to trace message publishing
2. **`instrumentConsumer`** - Wraps your message handler to trace message consumption

### Publisher Instrumentation

The `instrumentUpstash` function wraps the `client.publishJSON` method, creating a span with `SpanKind.CLIENT` for each message publish operation.

### Consumer Instrumentation  

The `instrumentConsumer` function wraps your message handler, creating a span with `SpanKind.SERVER` for each message received and processed.

## Span Attributes

### Publisher Spans (`instrumentUpstash`)

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
| `qstash.retries`               | Number of retry attempts (max)              | `3`                                          |
| `qstash.callback_url`          | Success callback URL                        | `https://example.com/callback`               |
| `qstash.failure_callback_url`  | Failure callback URL                        | `https://example.com/failure`                |

### Consumer Spans (`instrumentConsumer`)

| Attribute                      | Description                                 | Example                                      |
| ------------------------------ | ------------------------------------------- | -------------------------------------------- |
| `messaging.system`             | Constant value `qstash`                     | `qstash`                                     |
| `messaging.operation`          | Operation type                              | `receive`                                    |
| `qstash.resource`              | Resource name                               | `messages`                                   |
| `qstash.target`                | Full operation target                       | `messages.receive`                           |
| `qstash.message_id`            | Message ID from QStash                      | `msg_456`                                    |
| `qstash.retried`               | Number of times retried (actual count)      | `2`                                          |
| `qstash.schedule_id`           | Schedule ID (if from scheduled message)     | `schedule_123`                               |
| `qstash.caller_ip`             | IP address of the caller                    | `192.168.1.1`                                |
| `http.status_code`             | HTTP response status code                   | `200`                                        |

### Body/Payload Attributes (Optional)

When `captureBody` is enabled in configuration:

| Attribute                      | Description                                 | Captured By                                  |
| ------------------------------ | ------------------------------------------- | -------------------------------------------- |
| `qstash.request.body`          | Request/message body content                | Both publisher and consumer                  |
| `qstash.response.body`         | Response body content                       | Consumer only                                |

The instrumentation captures message metadata and configuration to help with debugging and monitoring. Body capture is **disabled by default** to protect sensitive data.

## Usage Examples

### Basic Message Publishing

```ts
import { Client } from "@upstash/qstash";
import { instrumentUpstash } from "@kubiks/otel-upstash-queues";

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

### Message Consumer Instrumentation

Use `instrumentConsumer` to trace your message handler that receives QStash messages:

```ts
// app/api/process/route.ts
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { instrumentConsumer } from "@kubiks/otel-upstash-queues";

async function handler(request: Request) {
  const data = await request.json();
  
  // Process your message
  await processImage(data.imageId);
  
  return Response.json({ success: true });
}

// Instrument first, then verify signature
export const POST = verifySignatureAppRouter(instrumentConsumer(handler));
```

**With body capture:**

```ts
export const POST = verifySignatureAppRouter(
  instrumentConsumer(handler, {
    captureBody: true,
    maxBodyLength: 2048,
  })
);
```

The `instrumentConsumer` function:
- Extracts QStash headers (message ID, retry count, schedule ID, caller IP)
- Creates a SERVER span for the message processing
- Tracks response status codes
- Captures errors during processing
- Optionally captures request and response bodies (when configured)

### Complete Next.js Integration Example

**Publishing messages:**
```ts
// app/actions.ts
"use server";
import { Client } from "@upstash/qstash";
import { instrumentUpstash } from "@kubiks/otel-upstash-queues";

const qstashClient = instrumentUpstash(
  new Client({
    token: process.env.QSTASH_TOKEN!,
  })
);

export async function startBackgroundJob(imageId: string) {
  await qstashClient.publishJSON({
    url: "https://your-app.vercel.app/api/process",
    body: { imageId },
  });
}
```

**Receiving messages:**
```ts
// app/api/process/route.ts
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { instrumentConsumer } from "@kubiks/otel-upstash-queues";

async function handler(request: Request) {
  const { imageId } = await request.json();
  
  // Your processing logic
  await processImage(imageId);
  
  return Response.json({ success: true });
}

export const POST = verifySignatureAppRouter(instrumentConsumer(handler));
```

## License

MIT