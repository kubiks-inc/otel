# @kubiks/otel-upstash-queues

OpenTelemetry instrumentation for the [Upstash QStash](https://upstash.com/docs/qstash) Node.js SDK.
Capture spans for every QStash API call, enrich them with operation metadata,
and keep an eye on message queue operations from your traces.

## Installation

```bash
npm install @kubiks/otel-upstash-queues
# or
pnpm add @kubiks/otel-upstash-queues
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `@upstash/qstash` >= 2.0.0

## Quick Start

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

The instrumentation captures message metadata and configuration to help with debugging and monitoring, while avoiding sensitive message content.

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

The `instrumentConsumer` function:
- Extracts QStash headers (message ID, retry count, schedule ID, caller IP)
- Creates a SERVER span for the message processing
- Tracks response status codes
- Captures errors during processing

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

## How It Works

### Publisher Instrumentation

The `instrumentUpstash` function creates OpenTelemetry spans for publishing by:

1. Wrapping the `publishJSON` method of the QStash client
2. Creating a CLIENT span before the operation starts
3. Adding relevant attributes from the request parameters
4. Capturing the message ID from the response
5. Recording any errors that occur
6. Properly closing the span with success or error status

### Consumer Instrumentation

The `instrumentConsumer` function creates OpenTelemetry spans for receiving by:

1. Wrapping your message handler function
2. Creating a SERVER span when a message is received
3. Extracting QStash headers (message ID, retry count, etc.)
4. Executing your handler within the span context
5. Capturing the HTTP response status code
6. Recording any errors during processing
7. Properly closing the span with success or error status

All of this happens automatically once you wrap your client and handlers with the instrumentation functions.

## Best Practices

### Publisher Best Practices

1. **Instrument Early**: Call `instrumentUpstash()` when you create your QStash client, typically at application startup.

2. **Reuse the Client**: Create one instrumented client and reuse it throughout your application.

3. **Use Deduplication IDs**: For idempotent operations, always provide a `deduplicationId` to prevent duplicate processing.

4. **Set Appropriate Retries**: Configure retry counts based on the criticality and nature of your tasks.

### Consumer Best Practices

1. **Instrument Before Verification**: Always wrap your handler with `instrumentConsumer()` before wrapping with `verifySignatureAppRouter()`:
   ```ts
   export const POST = verifySignatureAppRouter(instrumentConsumer(handler));
   ```

2. **Return Proper Status Codes**: Ensure your handler returns appropriate HTTP status codes. Non-2xx status codes will mark the span as an error.

3. **Handle Errors Gracefully**: Let errors bubble up naturally - the instrumentation will capture them and mark the span appropriately.

4. **Monitor Retry Patterns**: Use the `qstash.retried` attribute to track retry patterns and identify problematic messages.

### General Best Practices

1. **Monitor Traces**: Use OpenTelemetry-compatible tracing backends (like Jaeger, Zipkin, or cloud providers) to visualize your message queues.

2. **Correlate Publisher and Consumer**: The `qstash.message_id` attribute allows you to correlate publisher and consumer spans for end-to-end tracing.

## License

MIT