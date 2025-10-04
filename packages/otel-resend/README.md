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

- All top-level Resend client methods (e.g. `resend.ping`)
- Nested resource methods such as `resend.emails.send`, `resend.emails.batch`,
  `resend.domains.create`, `resend.apiKeys.create`, and custom resources
- Both async and sync methods defined on resource instances or their prototypes

## Span Attributes

Each span includes:

| Attribute | Description | Example |
| --- | --- | --- |
| `messaging.system` | Constant value `resend` | `resend` |
| `messaging.operation` | Operation derived from the method name | `send`, `create`, `list` |
| `resend.resource` | Top-level resource name | `emails`, `domains` |
| `resend.target` | Fully-qualified target (resource + method) | `emails.send` |
| `resend.recipient_count` | Total recipients detected in the request payload | `3` |
| `resend.template_id` | Template referenced in the request (when present) | `tmpl_123` |
| `resend.message_id` | Message ID returned by email operations | `email_123` |
| `resend.message_count` | How many message IDs were returned | `2` |
| `resend.resource_id` | Identifier returned by non-email resources | `domain_456` |

Sensitive request payloads are never recorded—only counts and identifiers that
Resend already exposes.

## Configuration

```ts
instrumentResend(resend, {
  tracerName: "my-service",
  captureRequestMetadata: true,
  captureResponseMetadata: true,
  shouldInstrument: (path, method) => !(path[0] === "emails" && method === "list"),
});
```

- `tracerName` / `tracer`: reuse an existing tracer if you have one.
- `captureRequestMetadata`: toggle attributes derived from the request payload
  (recipient counts, template IDs). Enabled by default.
- `captureResponseMetadata`: toggle attributes derived from the response
  (message IDs, resource IDs). Enabled by default.
- `shouldInstrument`: skip specific methods programmatically.

## License

MIT
