# @kubiks/otel-resend

OpenTelemetry instrumentation for the [Resend](https://resend.com) Node.js SDK.
Capture spans for every Resend API call, enrich them with operation metadata,
and keep an eye on message delivery from your traces.

## Installation

```bash
npm install @kubiks/otel-resend
# or
pnpm add @kubiks/otel-resend
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `resend` >= 3.0.0

## Quick Start

```ts
import { Resend } from "resend";
import { instrumentResend } from "@kubiks/otel-resend";

const resend = instrumentResend(new Resend(process.env.RESEND_API_KEY!));

await resend.emails.send({
  from: "hello@example.com",
  to: ["user@example.com"],
  subject: "Welcome",
  html: "<p>Hello world</p>",
});
```

`instrumentResend` wraps the instance you already use—no configuration changes
needed. Every SDK call creates a client span with useful attributes.

## What Gets Traced

This instrumentation specifically wraps the `resend.emails.send` method (and its alias `resend.emails.create`), creating a single clean span for each email send operation.

## Span Attributes

Each span includes:

| Attribute | Description | Example |
| --- | --- | --- |
| `messaging.system` | Constant value `resend` | `resend` |
| `messaging.operation` | Operation type | `send` |
| `resend.resource` | Resource name | `emails` |
| `resend.target` | Full operation target | `emails.send` |
| `resend.to_addresses` | Comma-separated TO addresses | `user@example.com, another@example.com` |
| `resend.cc_addresses` | Comma-separated CC addresses (if present) | `cc@example.com` |
| `resend.bcc_addresses` | Comma-separated BCC addresses (if present) | `bcc@example.com` |
| `resend.recipient_count` | Total number of recipients | `3` |
| `resend.from` | Sender email address | `noreply@example.com` |
| `resend.subject` | Email subject | `Welcome to our service` |
| `resend.template_id` | Template ID (if using templates) | `tmpl_123` |
| `resend.message_id` | Message ID returned by Resend | `email_123` |
| `resend.message_count` | Number of messages sent (always 1 for single sends) | `1` |

The instrumentation captures email addresses and metadata to help with debugging and monitoring, while avoiding sensitive email content.

## Configuration

```ts
instrumentResend(resend, {
  tracerName: "my-service",
  tracer: myCustomTracer,  // optional: bring your own tracer
});
```

- `tracerName`: Custom name for the tracer (defaults to `@kubiks/otel-resend`)
- `tracer`: Use an existing tracer instance instead of creating a new one

## License

MIT
