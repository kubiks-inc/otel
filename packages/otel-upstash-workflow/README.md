# @kubiks/otel-upstash-workflow

OpenTelemetry instrumentation for the [Upstash Workflow](https://upstash.com/docs/workflow) Node.js SDK.
Capture spans for every workflow execution and step, enrich them with operation metadata,
and keep an eye on workflow operations from your traces.

> **Note:** This package instruments the Upstash Workflow SDK, which is currently in pre-release. The API may change as the Workflow SDK evolves.

## Installation

```bash
npm install @kubiks/otel-upstash-workflow
# or
pnpm add @kubiks/otel-upstash-workflow
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `@upstash/workflow` >= 0.0.0

## Quick Start

### Instrumenting Workflow Handlers

```ts
import { serve as originalServe } from "@upstash/workflow";
import { instrumentWorkflowServe } from "@kubiks/otel-upstash-workflow";

// Instrument the serve function
const serve = instrumentWorkflowServe(originalServe);

export const POST = serve(async (context) => {
  const result1 = await context.run("step-1", async () => {
    return await processData();
  });

  await context.sleep("wait-5s", 5);

  const result2 = await context.run("step-2", async () => {
    return await saveResults(result1);
  });

  return result2;
});
```

`instrumentWorkflowServe` wraps the `serve` function to trace the entire workflow execution and all steps — no configuration changes needed. Every workflow execution creates a server span with child spans for each step.

### Instrumenting Workflow Client

```ts
import { Client } from "@upstash/workflow";
import { instrumentWorkflowClient } from "@kubiks/otel-upstash-workflow";

const client = instrumentWorkflowClient(
  new Client({ baseUrl: process.env.QSTASH_URL!, token: process.env.QSTASH_TOKEN! })
);

await client.trigger({
  url: "https://your-app.com/api/workflow",
  body: { data: "example" },
});
```

`instrumentWorkflowClient` wraps the workflow client to trace workflow triggers, creating client spans for each trigger operation.

### With Step Data Capture

Optionally capture step inputs and outputs for debugging:

```ts
const serve = instrumentWorkflowServe(originalServe, {
  captureStepData: true,       // Enable step data capture (default: false)
  maxStepDataLength: 2048,     // Max characters to capture (default: 1024)
});

export const POST = serve(async (context) => {
  // Your workflow - all steps are traced with input/output capture
});
```

## What Gets Traced

This instrumentation provides two main functions:

1. **`instrumentWorkflowClient`** - Wraps the Workflow Client to trace workflow triggers
2. **`instrumentWorkflowServe`** - Wraps the `serve` function to trace execution and all workflow steps

### Workflow Handler Instrumentation

The `instrumentWorkflowServe` function wraps the `serve` function, creating a span with `SpanKind.SERVER` for the entire workflow execution. All workflow steps (context.run, context.sleep, etc.) automatically create child spans.

### Client Instrumentation

The `instrumentWorkflowClient` function wraps the client's `trigger` method, creating a span with `SpanKind.CLIENT` for each workflow trigger operation.

## Span Hierarchy

The instrumentation creates the following span hierarchy:

```
[SERVER] workflow.execute
  ├─ [INTERNAL] workflow.step.step-1 (context.run)
  ├─ [INTERNAL] workflow.step.wait-5s (context.sleep)
  ├─ [CLIENT] workflow.step.api-call (context.call)
  └─ [INTERNAL] workflow.step.wait-event (context.waitForEvent)
```

Separate client-side triggers create independent traces:

```
[CLIENT] workflow.trigger
```

## Span Attributes

### Workflow Handler Spans (instrumentWorkflowServe)

| Attribute | Description | Example |
| --- | --- | --- |
| `workflow.system` | Constant value `upstash` | `upstash` |
| `workflow.operation` | Operation type | `execute` |
| `workflow.id` | Workflow ID from headers | `wf_123` |
| `workflow.run_id` | Workflow run ID from headers | `run_456` |
| `workflow.url` | Workflow URL from headers | `https://example.com/api/workflow` |
| `http.status_code` | HTTP response status | `200` |

### Client Trigger Spans (instrumentWorkflowClient)

| Attribute | Description | Example |
| --- | --- | --- |
| `workflow.system` | Constant value `upstash` | `upstash` |
| `workflow.operation` | Operation type | `trigger` |
| `workflow.url` | Target workflow URL | `https://example.com/api/workflow` |
| `workflow.id` | Workflow ID from response | `wf_123` |
| `workflow.run_id` | Workflow run ID from response | `run_456` |

### Step Spans (context.run)

| Attribute | Description | Example |
| --- | --- | --- |
| `workflow.system` | Constant value `upstash` | `upstash` |
| `workflow.operation` | Operation type | `step` |
| `workflow.step.name` | Step name | `step-1` |
| `workflow.step.type` | Step type | `run` |
| `workflow.step.duration_ms` | Step execution time in ms | `150` |
| `workflow.step.output` | Step output (if enabled) | `{"result":"success"}` |

### Sleep Spans (context.sleep, context.sleepFor, context.sleepUntil)

| Attribute | Description | Example |
| --- | --- | --- |
| `workflow.system` | Constant value `upstash` | `upstash` |
| `workflow.operation` | Operation type | `step` |
| `workflow.step.name` | Step name (if named sleep) | `wait-5s` |
| `workflow.step.type` | Step type | `sleep` |
| `workflow.sleep.duration_ms` | Sleep duration in ms | `5000` |
| `workflow.sleep.until_timestamp` | Target timestamp (sleepUntil) | `1704067200000` |

### Call Spans (context.call)

| Attribute | Description | Example |
| --- | --- | --- |
| `workflow.system` | Constant value `upstash` | `upstash` |
| `workflow.operation` | Operation type | `step` |
| `workflow.step.name` | Step name | `api-call` |
| `workflow.step.type` | Step type | `call` |
| `workflow.call.url` | Target URL | `https://api.example.com/data` |
| `workflow.call.method` | HTTP method | `POST` |
| `workflow.call.status_code` | Response status code | `200` |
| `workflow.step.input` | Request body (if enabled) | `{"userId":"123"}` |
| `workflow.step.output` | Response data (if enabled) | `{"status":"ok"}` |

### Event Spans (context.waitForEvent)

| Attribute | Description | Example |
| --- | --- | --- |
| `workflow.system` | Constant value `upstash` | `upstash` |
| `workflow.operation` | Operation type | `step` |
| `workflow.step.name` | Step name | `wait-event` |
| `workflow.step.type` | Step type | `waitForEvent` |
| `workflow.event.id` | Event ID | `evt_123` |
| `workflow.event.timeout_ms` | Timeout in ms | `60000` |
| `workflow.step.output` | Event data (if enabled) | `{"received":true}` |

### Step Data Attributes (Optional)

When `captureStepData` is enabled in configuration:

| Attribute | Description | Captured By |
| --- | --- | --- |
| `workflow.step.input` | Step input data | Client trigger, context.call |
| `workflow.step.output` | Step output data | All context methods |

The instrumentation captures workflow metadata and step details to help with debugging and monitoring. Step data capture is **disabled by default** to protect sensitive data.

## Usage Examples

### Basic Workflow Execution

```ts
import { serve as originalServe } from "@upstash/workflow";
import { instrumentWorkflowServe } from "@kubiks/otel-upstash-workflow";

const serve = instrumentWorkflowServe(originalServe);

export const POST = serve(async (context) => {
  // Each step is automatically traced
  const data = await context.run("fetch-data", async () => {
    return await fetchFromDatabase();
  });

  const processed = await context.run("process-data", async () => {
    return await processData(data);
  });

  return { success: true, result: processed };
});
```

### Workflow with Sleep

```ts
const serve = instrumentWorkflowServe(originalServe);

export const POST = serve(async (context) => {
  await context.run("send-email", async () => {
    await sendEmail();
  });

  // Sleep for 5 seconds
  await context.sleep("wait-5s", 5);

  await context.run("check-status", async () => {
    return await checkEmailStatus();
  });

  return { done: true };
});
```

### Workflow with External API Calls

```ts
const serve = instrumentWorkflowServe(originalServe);

export const POST = serve(async (context) => {
  // External HTTP call is traced
  const apiResponse = await context.call("fetch-user", "https://api.example.com/users/123", {
    method: "GET",
  });

  const result = await context.run("process-user", async () => {
    return await processUser(apiResponse);
  });

  return result;
});
```

### Workflow with Event Waiting

```ts
const serve = instrumentWorkflowServe(originalServe);

export const POST = serve(async (context) => {
  await context.run("start-process", async () => {
    await startLongRunningProcess();
  });

  // Wait for an event with timeout
  const event = await context.waitForEvent("process-complete", "evt_123", 60000);

  await context.run("finalize", async () => {
    return await finalizeProcess(event);
  });

  return { success: true };
});
```

### Client Triggering Workflows

```ts
import { Client } from "@upstash/workflow";
import { instrumentWorkflowClient } from "@kubiks/otel-upstash-workflow";

const client = instrumentWorkflowClient(
  new Client({
    baseUrl: process.env.QSTASH_URL!,
    token: process.env.QSTASH_TOKEN!,
  })
);

// Trigger a workflow
const result = await client.trigger({
  url: "https://your-app.vercel.app/api/workflow",
  body: {
    userId: "user_123",
    action: "process_data",
  },
});

console.log("Workflow triggered:", result.workflowId);
```

### With Step Data Capture

```ts
const serve = instrumentWorkflowServe(originalServe, {
  captureStepData: true,      // Enable input/output capture
  maxStepDataLength: 2048,    // Increase truncation limit
});

export const POST = serve(async (context) => {
  const result = await context.run("complex-calculation", async () => {
    return {
      value: 42,
      timestamp: Date.now(),
      metadata: { processed: true },
    };
  });

  return result;
});
```

### Complete Next.js Integration Example

**Workflow handler:**

```ts
// app/api/workflow/route.ts
import { serve as originalServe } from "@upstash/workflow";
import { instrumentWorkflowServe } from "@kubiks/otel-upstash-workflow";

const serve = instrumentWorkflowServe(originalServe);

async function processOrder(orderId: string) {
  // Your business logic
  return { orderId, status: "processed" };
}

async function sendNotification(orderId: string) {
  // Send notification
  return { sent: true };
}

export const POST = serve(async (context) => {
  const orderId = context.requestPayload.orderId;

  // Process the order
  const result = await context.run("process-order", async () => {
    return await processOrder(orderId);
  });

  // Wait before sending notification
  await context.sleep("wait-1-minute", 60);

  // Send notification
  await context.run("send-notification", async () => {
    return await sendNotification(orderId);
  });

  return { success: true, order: result };
});
```

**Triggering workflows:**

```ts
// app/actions.ts
"use server";
import { Client } from "@upstash/workflow";
import { instrumentWorkflowClient } from "@kubiks/otel-upstash-workflow";

const workflowClient = instrumentWorkflowClient(
  new Client({
    baseUrl: process.env.QSTASH_URL!,
    token: process.env.QSTASH_TOKEN!,
  })
);

export async function createOrder(orderId: string) {
  const result = await workflowClient.trigger({
    url: "https://your-app.vercel.app/api/workflow",
    body: { orderId },
  });

  return {
    workflowId: result.workflowId,
    runId: result.workflowRunId,
  };
}
```

## Configuration Options

### InstrumentationConfig

```typescript
interface InstrumentationConfig {
  /**
   * Whether to capture step inputs/outputs in spans.
   * @default false
   */
  captureStepData?: boolean;

  /**
   * Maximum length of step input/output to capture.
   * Data longer than this will be truncated.
   * @default 1024
   */
  maxStepDataLength?: number;

  /**
   * Custom tracer name.
   * @default "@kubiks/otel-upstash-workflow"
   */
  tracerName?: string;
}
```

## Best Practices

1. **Step Data Capture**: Only enable `captureStepData` in development or when debugging specific issues. Capturing step data can expose sensitive information and increase trace size.

2. **Step Naming**: Use descriptive step names that clearly indicate what the step does. This makes traces easier to understand.

3. **Error Handling**: The instrumentation automatically captures errors. Make sure your workflow handlers have proper error handling.

4. **Idempotency**: The instrumentation functions are idempotent — calling them multiple times on the same handler/client has no additional effect.

## License

MIT
