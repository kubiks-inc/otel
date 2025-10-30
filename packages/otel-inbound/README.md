# @kubiks/otel-inbound

OpenTelemetry instrumentation for the [Inbound](https://inbound.new) email API SDK.
Capture spans for every Inbound API operation, enrich them with detailed metadata,
and monitor your complete email workflow from traces.

![Inbound Trace Visualization](https://github.com/kubiks-inc/otel/blob/main/images/otel-inbound-trace.png)

_Visualize your email operations with detailed span information including recipients, subjects, scheduling, and webhook processing._

## Installation

```bash
npm install @kubiks/otel-inbound
# or
pnpm add @kubiks/otel-inbound
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `@inboundemail/sdk` >= 4.0.0

## Quick Start

```ts
import { Inbound } from "@inboundemail/sdk";
import { instrumentInbound } from "@kubiks/otel-inbound";

const inbound = instrumentInbound(new Inbound(process.env.INBOUND_API_KEY!));

await inbound.emails.send({
  from: "hello@example.com",
  to: ["user@example.com"],
  subject: "Welcome",
  html: "<p>Hello world</p>",
});
```

`instrumentInbound` wraps the instance you already use — no configuration changes
needed. Every SDK call creates a client span with useful attributes.

## What Gets Traced

This instrumentation wraps all Inbound API operations, creating spans for each:

### Email Operations
- `emails.send()` - Send email
- `emails.schedule()` - Schedule email for later delivery
- `emails.reply()` - Reply to an existing email thread
- `emails.retrieve()` - Retrieve email details
- `emails.listScheduled()` - List scheduled emails
- `emails.getScheduled()` - Get specific scheduled email
- `emails.cancelScheduled()` - Cancel a scheduled email

### Management Operations
- **Endpoints**: `list()`, `create()`, `get()`, `update()`, `delete()`
- **Addresses**: `list()`, `create()`, `get()`, `update()`, `delete()`
- **Domains**: `list()`, `create()`, `get()`, `update()`, `delete()`, `getDNS()`

### Thread & Attachment Operations
- **Threads**: `list()`, `get()`, `actions()`, `statistics()`
- **Attachments**: `download()`

### Webhook Receivers
- Incoming email webhooks (via `instrumentInboundWebhook`)

## Span Attributes

Each span includes relevant attributes based on the operation type:

### Base Attributes (All Operations)

| Attribute               | Description                  | Example                  |
| ----------------------- | ---------------------------- | ------------------------ |
| `messaging.system`      | Constant value `inbound`     | `inbound`                |
| `messaging.operation`   | Operation type               | `send`, `schedule`, etc. |
| `inbound.resource`      | Resource being accessed      | `emails`, `endpoints`    |
| `inbound.target`        | Full operation target        | `emails.send`            |

### Email Attributes

| Attribute                   | Description                       | Example                                 |
| --------------------------- | --------------------------------- | --------------------------------------- |
| `inbound.message_id`        | Message ID returned by Inbound    | `msg_123`                               |
| `inbound.to_addresses`      | Comma-separated TO addresses      | `user@example.com, another@example.com` |
| `inbound.cc_addresses`      | Comma-separated CC addresses      | `cc@example.com`                        |
| `inbound.bcc_addresses`     | Comma-separated BCC addresses     | `bcc@example.com`                       |
| `inbound.recipient_count`   | Total number of recipients        | `3`                                     |
| `inbound.from`              | Sender email address              | `noreply@example.com`                   |
| `inbound.subject`           | Email subject line                | `Welcome to our service`                |
| `inbound.html_content`      | HTML content (if capture enabled) | `<p>Hello</p>`                          |
| `inbound.text_content`      | Text content (if capture enabled) | `Hello`                                 |

### Scheduling Attributes

| Attribute               | Description                  | Example                  |
| ----------------------- | ---------------------------- | ------------------------ |
| `inbound.scheduled_at`  | Scheduled delivery time      | `2025-01-01T00:00:00Z`   |
| `inbound.schedule_id`   | Schedule ID from API         | `sched_123`              |

### Management Attributes

| Attribute              | Description               | Example      |
| ---------------------- | ------------------------- | ------------ |
| `inbound.endpoint_id`  | Endpoint identifier       | `ep_123`     |
| `inbound.domain_id`    | Domain identifier         | `dom_123`    |
| `inbound.address_id`   | Email address identifier  | `addr_123`   |

### Thread & Attachment Attributes

| Attribute                | Description                | Example        |
| ------------------------ | -------------------------- | -------------- |
| `inbound.thread_id`      | Email thread identifier    | `thread_123`   |
| `inbound.attachment_id`  | Attachment identifier      | `attach_123`   |

### Webhook Attributes

| Attribute              | Description                    | Example          |
| ---------------------- | ------------------------------ | ---------------- |
| `inbound.webhook_id`   | Webhook identifier from header | `webhook_123`    |
| `http.status_code`     | HTTP response status code      | `200`            |

## Advanced Usage

### Webhook Receiver Instrumentation

Instrument Next.js route handlers that receive incoming emails:

```ts
import { instrumentInboundWebhook } from "@kubiks/otel-inbound";

export const POST = instrumentInboundWebhook(async (request: Request) => {
  const email = await request.json();
  
  // Process incoming email
  console.log('Received email from:', email.from);
  console.log('Subject:', email.subject);
  
  // Your email processing logic here
  await processIncomingEmail(email);
  
  return Response.json({ success: true });
});
```

This creates SERVER spans (SpanKind.SERVER) that automatically capture:
- Email metadata from webhook payload
- Webhook headers
- Response status
- Any errors during processing

### Configuration Options

Control what data is captured in your spans:

```ts
import { instrumentInbound, type InstrumentInboundConfig } from "@kubiks/otel-inbound";

const config: InstrumentInboundConfig = {
  // Capture email HTML/text content in spans (default: false)
  captureEmailContent: true,
  
  // Maximum content length before truncation (default: 1024)
  maxContentLength: 2048,
};

const inbound = instrumentInbound(
  new Inbound(process.env.INBOUND_API_KEY!),
  config
);
```

**Note:** Be cautious when enabling `captureEmailContent` as it may capture sensitive information in your traces.

### Scheduling Emails

```ts
await inbound.emails.schedule({
  from: "noreply@example.com",
  to: "user@example.com",
  subject: "Scheduled Newsletter",
  html: "<p>Weekly update</p>",
  scheduledAt: "2025-01-01T09:00:00Z",
});

// List all scheduled emails
const scheduled = await inbound.emails.listScheduled();

// Cancel a scheduled email
await inbound.emails.cancelScheduled("sched_123");
```

### Reply to Emails

```ts
await inbound.emails.reply({
  from: "support@example.com",
  to: "customer@example.com",
  subject: "Re: Support Request",
  html: "<p>Thanks for reaching out!</p>",
  threadId: "thread_123", // Thread ID from webhook payload
});
```

### Domain Management

```ts
// Create a domain
const domain = await inbound.domains.create({
  domain: "yourdomain.com",
});

// Get DNS records for verification
const dns = await inbound.domains.getDNS(domain.data.id);
console.log("Add these DNS records:", dns.data.records);

// List all domains
const domains = await inbound.domains.list();
```

### Endpoint Management

```ts
// Create webhook endpoint
const endpoint = await inbound.endpoints.create({
  url: "https://yourdomain.com/webhook",
  events: ["email.received"],
});

// Update endpoint
await inbound.endpoints.update(endpoint.data.id, {
  url: "https://yourdomain.com/new-webhook",
});

// Delete endpoint
await inbound.endpoints.delete(endpoint.data.id);
```

### Complete Example with Webhook

```ts
import { Inbound } from "@inboundemail/sdk";
import { instrumentInbound, instrumentInboundWebhook } from "@kubiks/otel-inbound";

// Instrument the Inbound client
const inbound = instrumentInbound(
  new Inbound(process.env.INBOUND_API_KEY!),
  { captureEmailContent: true }
);

// Send an email
await inbound.emails.send({
  from: "hello@yourdomain.com",
  to: "user@example.com",
  subject: "Welcome!",
  html: "<p>Thanks for signing up!</p>",
});

// Webhook handler for receiving emails
export const POST = instrumentInboundWebhook(
  async (request: Request) => {
    const email = await request.json();
    
    // Automatically reply to incoming emails
    await inbound.emails.reply({
      from: email.to,
      to: email.from,
      subject: `Re: ${email.subject}`,
      html: "<p>Thanks for your email! We'll get back to you soon.</p>",
      threadId: email.threadId,
    });
    
    return Response.json({ processed: true });
  },
  { captureEmailContent: true }
);
```

## License

MIT

