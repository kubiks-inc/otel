# @kubiks/otel-polar

OpenTelemetry instrumentation for the [Polar.sh](https://polar.sh) Node.js SDK.
Capture spans for every Polar API call, enrich them with operation metadata,
and keep an eye on your billing, subscriptions, and customer operations from your traces.

![Polar Trace Visualization](https://github.com/kubiks-inc/otel/blob/main/images/otel-polar-trace.png)

_Visualize your Polar operations with detailed span information including resource IDs, organization IDs, and operation metadata._

## Installation

```bash
npm install @kubiks/otel-polar
# or
pnpm add @kubiks/otel-polar
# or
yarn add @kubiks/otel-polar
# or
bun add @kubiks/otel-polar
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `@polar-sh/sdk` >= 0.11.0

## Quick Start

```ts
import { Polar } from "@polar-sh/sdk";
import { instrumentPolar } from "@kubiks/otel-polar";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
});

// Instrument the client - all operations are now traced!
instrumentPolar(polar);

// Use the SDK normally - traces are automatically created
await polar.benefits.list({ organizationId: "org_123" });
await polar.customers.create({
  email: "customer@example.com",
  organizationId: "org_123",
});
```

`instrumentPolar` wraps the Polar SDK instance you already use — no configuration changes needed. Every SDK call creates a client span with useful attributes.

## What Gets Traced

This instrumentation automatically wraps **all** Polar SDK methods across all resources, including:

### Core Resources
- **Benefits** - `list`, `create`, `get`, `update`, `delete`
- **Benefit Grants** - `list`, `create`, `get`, `update`
- **Checkouts** - `list`, `create`, `get`, `update`
- **Checkout Links** - `list`, `create`, `get`, `update`, `delete`
- **Customers** - `list`, `create`, `get`, `update`, `delete`
- **Customer Meters** - Track usage metrics
- **Customer Seats** - Manage seat assignments
- **Customer Sessions** - Session management
- **Discounts** - `list`, `create`, `get`, `update`, `delete`
- **Events** - `list`, `ingest`
- **Files** - `list`, `create`, `upload`
- **License Keys** - `list`, `get`, `update`, `validate`, `activate`, `deactivate`
- **Organizations** - `list`, `create`, `get`, `update`
- **Orders** - `list`, `get`
- **Products** - `list`, `create`, `get`, `update`, `delete`
- **Subscriptions** - `list`, `create`, `get`, `update`, `export`
- **Wallets** - Access wallet information
- **Custom Fields** - Define custom data fields
- **Metrics** - Access analytics and metrics
- **OAuth2** - `authorize`, `token`, `revoke`, `introspect`

### Customer Portal Resources
All customer-facing operations under `polar.customerPortal.*`:
- `benefitGrants`
- `customerMeters`
- `customers`
- `customerSession`
- `downloadables`
- `licenseKeys`
- `orders`
- `organizations`
- `seats`
- `subscriptions`
- `wallets`

### Webhook Validation
- `webhooks.validate` - Validate webhook signatures

## Configuration

The instrumentation can be customized with configuration options:

```ts
import { instrumentPolar } from "@kubiks/otel-polar";

instrumentPolar(polar, {
  // Custom tracer name (default: "@kubiks/otel-polar")
  tracerName: "my-custom-tracer",

  // Capture resource IDs from requests and responses (default: true)
  captureResourceIds: true,

  // Capture organization IDs from requests (default: true)
  captureOrganizationIds: true,

  // Instrument customer portal operations (default: true)
  instrumentCustomerPortal: true,
});
```

## Span Attributes

Each span includes comprehensive attributes to help with debugging and monitoring:

### Common Attributes

| Attribute | Description | Example |
|-----------|-------------|---------|
| `polar.operation` | Full operation name | `benefits.list`, `customers.create` |
| `polar.resource` | Resource type being accessed | `benefits`, `customers`, `checkouts` |
| `polar.resource_id` | ID of the specific resource (when available) | `benefit_123`, `cust_456` |

### Resource-Specific Attributes

Depending on the operation, additional attributes are captured:

| Attribute | Description | Example |
|-----------|-------------|---------|
| `polar.organization_id` | Organization ID from request | `org_123` |
| `polar.customer_id` | Customer ID | `cust_456` |
| `polar.product_id` | Product ID | `prod_789` |
| `polar.subscription_id` | Subscription ID | `sub_abc` |
| `polar.checkout_id` | Checkout session ID | `checkout_xyz` |
| `polar.order_id` | Order ID | `order_123` |
| `polar.benefit_id` | Benefit ID | `benefit_456` |
| `polar.license_key_id` | License key ID | `lic_789` |
| `polar.file_id` | File ID | `file_abc` |
| `polar.event_id` | Event ID | `evt_xyz` |
| `polar.discount_id` | Discount code ID | `disc_123` |

### Webhook Attributes

For webhook validation operations:

| Attribute | Description | Example |
|-----------|-------------|---------|
| `polar.webhook.event_type` | Type of webhook event | `checkout.created`, `subscription.updated` |
| `polar.webhook.valid` | Whether validation succeeded | `true`, `false` |

## Usage Examples

### Basic Operations

```ts
import { Polar } from "@polar-sh/sdk";
import { instrumentPolar } from "@kubiks/otel-polar";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
});

instrumentPolar(polar);

// Create a benefit
const benefit = await polar.benefits.create({
  organizationId: "org_123",
  type: "custom",
  description: "Premium Support",
});

// List customers
const customers = await polar.customers.list({
  organizationId: "org_123",
});

// Create a checkout session
const checkout = await polar.checkouts.create({
  productId: "prod_456",
  successUrl: "https://example.com/success",
});
```

### Customer Portal Operations

```ts
// Customer portal operations are automatically instrumented
const subscriptions = await polar.customerPortal.subscriptions.list({
  customerId: "cust_789",
});

const licenseKey = await polar.customerPortal.licenseKeys.validate({
  key: "lic_key_value",
});
```

### Webhook Handling

```ts
import { instrumentPolar } from "@kubiks/otel-polar";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
});

instrumentPolar(polar);

// Webhook validation is automatically traced
app.post("/webhooks/polar", async (req, res) => {
  try {
    const event = await polar.webhooks.validate({
      body: req.body,
      signature: req.headers["polar-signature"],
      secret: process.env.POLAR_WEBHOOK_SECRET!,
    });

    // Handle the event
    console.log("Received event:", event.type);

    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ error: "Invalid signature" });
  }
});
```

### Error Handling

Errors are automatically captured in spans with full exception details:

```ts
try {
  await polar.customers.get("invalid_id");
} catch (error) {
  // Span will be marked as failed with exception details
  console.error("Failed to get customer:", error);
}
```

### Advanced Configuration

```ts
import { instrumentPolar } from "@kubiks/otel-polar";
import { trace } from "@opentelemetry/api";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
});

// Use custom configuration for fine-grained control
instrumentPolar(polar, {
  tracerName: "my-app-polar-tracer",
  captureResourceIds: true,
  captureOrganizationIds: true,
  instrumentCustomerPortal: true,
});

// Create a custom span around multiple operations
const tracer = trace.getTracer("my-app");
const span = tracer.startSpan("create-subscription-flow");

await trace.setSpan(context.active(), span).with(async () => {
  const customer = await polar.customers.create({
    email: "user@example.com",
    organizationId: "org_123",
  });

  const subscription = await polar.subscriptions.create({
    customerId: customer.data.id,
    productId: "prod_456",
  });

  span.end();
});
```

## Integration with OpenTelemetry

This instrumentation integrates seamlessly with your existing OpenTelemetry setup:

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { Polar } from "@polar-sh/sdk";
import { instrumentPolar } from "@kubiks/otel-polar";

// Initialize OpenTelemetry
const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: "my-app",
  }),
  traceExporter: new ConsoleSpanExporter(),
});

sdk.start();

// Instrument Polar client
const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
});

instrumentPolar(polar);

// All Polar operations now appear in your traces!
```

## Best Practices

1. **Instrument Early**: Call `instrumentPolar()` once when initializing your Polar client
2. **Reuse Clients**: Instrument a single Polar client instance and reuse it throughout your app
3. **Context Propagation**: The instrumentation automatically propagates context for distributed tracing
4. **Error Tracking**: Errors are automatically captured - no need for manual exception recording
5. **Resource IDs**: Keep `captureResourceIds` enabled to track specific resources in your spans

## Framework Integration

This instrumentation works with any Node.js framework:

### Express

```ts
import express from "express";
import { Polar } from "@polar-sh/sdk";
import { instrumentPolar } from "@kubiks/otel-polar";

const app = express();
const polar = instrumentPolar(new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN! }));

app.get("/benefits", async (req, res) => {
  const benefits = await polar.benefits.list({
    organizationId: req.query.orgId,
  });
  res.json(benefits);
});
```

### Next.js

```ts
// lib/polar.ts
import { Polar } from "@polar-sh/sdk";
import { instrumentPolar } from "@kubiks/otel-polar";

export const polar = instrumentPolar(
  new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
  })
);

// app/api/benefits/route.ts
import { polar } from "@/lib/polar";

export async function GET(request: Request) {
  const benefits = await polar.benefits.list({
    organizationId: "org_123",
  });
  return Response.json(benefits);
}
```

### Fastify

```ts
import Fastify from "fastify";
import { Polar } from "@polar-sh/sdk";
import { instrumentPolar } from "@kubiks/otel-polar";

const fastify = Fastify();
const polar = instrumentPolar(new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN! }));

fastify.get("/customers", async (request, reply) => {
  const customers = await polar.customers.list({});
  return customers;
});
```

## TypeScript Support

This package includes full TypeScript definitions. The instrumentation preserves all type information from the Polar SDK:

```ts
import { Polar } from "@polar-sh/sdk";
import { instrumentPolar } from "@kubiks/otel-polar";

const polar = instrumentPolar(new Polar({ accessToken: "..." }));

// Full type safety is preserved
const benefit = await polar.benefits.create({
  organizationId: "org_123",
  type: "custom", // TypeScript knows the valid types
  description: "Premium Support",
});

// TypeScript error: Property 'invalidMethod' does not exist
// polar.benefits.invalidMethod();
```

## License

MIT
