# @kubiks/otel-autumn

OpenTelemetry instrumentation for the [Autumn](https://useautumn.com) billing SDK.
Capture spans for every billing operation including feature checks, usage tracking, checkout flows, product attachments, and cancellations with detailed metadata.

## Installation

```bash
npm install @kubiks/otel-autumn
# or
pnpm add @kubiks/otel-autumn
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `autumn-js` >= 0.1.0

## Quick Start

```ts
import { Autumn } from "autumn-js";
import { instrumentAutumn } from "@kubiks/otel-autumn";

const autumn = instrumentAutumn(
  new Autumn({
    secretKey: process.env.AUTUMN_SECRET_KEY!,
  })
);

// All operations are now automatically traced
const checkResult = await autumn.check({
  customer_id: "user_123",
  feature_id: "messages",
});

await autumn.track({
  customer_id: "user_123",
  feature_id: "messages",
  value: 1,
});
```

`instrumentAutumn` wraps your Autumn client instance — no configuration changes needed. Every SDK call creates a client span with detailed billing attributes.

## What Gets Traced

This instrumentation wraps the core Autumn billing methods:

- **`check`** - Feature access and product status checks
- **`track`** - Usage event tracking
- **`checkout`** - Checkout session creation
- **`attach`** - Product attachment to customers
- **`cancel`** - Product cancellation

Each operation creates a dedicated span with operation-specific attributes.

## Span Attributes

### Common Attributes (All Operations)

| Attribute               | Description                         | Example            |
| ----------------------- | ----------------------------------- | ------------------ |
| `billing.system`        | Constant value `autumn`             | `autumn`           |
| `billing.operation`     | Operation type                      | `check`, `track`   |
| `autumn.resource`       | Resource being accessed             | `features`, `products` |
| `autumn.target`         | Full operation target               | `features.check`   |
| `autumn.customer_id`    | Customer ID                         | `user_123`         |
| `autumn.entity_id`      | Entity ID (if applicable)           | `org_456`          |

### Check Operation

| Attribute                 | Description                       | Example      |
| ------------------------- | --------------------------------- | ------------ |
| `autumn.feature_id`       | Feature being checked             | `messages`   |
| `autumn.product_id`       | Product being checked             | `pro`        |
| `autumn.allowed`          | Whether access is allowed         | `true`       |
| `autumn.balance`          | Current balance/remaining uses    | `42`         |
| `autumn.usage`            | Current usage                     | `8`          |
| `autumn.included_usage`   | Included usage in plan            | `50`         |
| `autumn.unlimited`        | Whether usage is unlimited        | `false`      |
| `autumn.required_balance` | Required balance for operation    | `1`          |

### Track Operation

| Attribute                  | Description                    | Example           |
| -------------------------- | ------------------------------ | ----------------- |
| `autumn.feature_id`        | Feature being tracked          | `messages`        |
| `autumn.event_name`        | Custom event name              | `message_sent`    |
| `autumn.value`             | Usage value tracked            | `1`               |
| `autumn.event_id`          | Generated event ID             | `evt_123`         |
| `autumn.idempotency_key`   | Idempotency key for dedup      | `msg_456`         |

### Checkout Operation

| Attribute                   | Description                        | Example                   |
| --------------------------- | ---------------------------------- | ------------------------- |
| `autumn.product_id`         | Product being purchased            | `pro`                     |
| `autumn.product_ids`        | Multiple products (comma-separated)| `pro, addon_analytics`    |
| `autumn.checkout_url`       | Stripe checkout URL                | `https://checkout.stripe.com/...` |
| `autumn.has_prorations`     | Whether prorations apply           | `true`                    |
| `autumn.total_amount`       | Total checkout amount              | `2000` (cents)            |
| `autumn.currency`           | Currency code                      | `usd`                     |
| `autumn.force_checkout`     | Whether to force Stripe checkout   | `false`                   |
| `autumn.invoice`            | Whether to create invoice          | `true`                    |

### Attach Operation

| Attribute                | Description                     | Example                          |
| ------------------------ | ------------------------------- | -------------------------------- |
| `autumn.product_id`      | Product being attached          | `pro`                            |
| `autumn.success`         | Whether attachment succeeded    | `true`                           |
| `autumn.checkout_url`    | Checkout URL if payment needed  | `https://checkout.stripe.com/...`|

### Cancel Operation

| Attribute              | Description                      | Example    |
| ---------------------- | -------------------------------- | ---------- |
| `autumn.product_id`    | Product being cancelled          | `pro`      |
| `autumn.success`       | Whether cancellation succeeded   | `true`     |

## Configuration

You can optionally configure the instrumentation:

```ts
import { instrumentAutumn } from "@kubiks/otel-autumn";

const autumn = instrumentAutumn(client, {
  // Capture customer data in spans (default: false)
  captureCustomerData: true,
  
  // Capture product options/configuration (default: false)
  captureOptions: true,
});
```

## Usage Examples

### Feature Access Control

```ts
const autumn = instrumentAutumn(new Autumn({ secretKey: process.env.AUTUMN_SECRET_KEY! }));

// Check if user can access a feature
const result = await autumn.check({
  customer_id: "user_123",
  feature_id: "messages",
  required_balance: 1,
});

if (result.data?.allowed) {
  // User has access
  console.log(`Remaining: ${result.data.balance}`);
}
```

### Usage Tracking

```ts
// Track feature usage
await autumn.track({
  customer_id: "user_123",
  feature_id: "messages",
  value: 1,
  idempotency_key: `msg_${messageId}`, // Prevent double-counting
});
```

### Checkout Flow

```ts
// Create a checkout session for a product
const result = await autumn.checkout({
  customer_id: "user_123",
  product_id: "pro",
  force_checkout: false, // Use billing portal if payment method exists
});

if (result.data?.url) {
  // Redirect to Stripe checkout
  console.log(`Checkout URL: ${result.data.url}`);
}
```

### Product Management

```ts
// Attach a free product
const attachResult = await autumn.attach({
  customer_id: "user_123",
  product_id: "free",
});

// Cancel a subscription
const cancelResult = await autumn.cancel({
  customer_id: "user_123",
  product_id: "pro",
});
```

## Observability Benefits

This instrumentation helps you:

- **Monitor billing operations** - Track success rates, latencies, and errors for all billing calls
- **Debug checkout issues** - See complete checkout flows including prorations and payment failures
- **Analyze feature usage** - Understand which features are being checked and tracked most
- **Track customer journey** - Follow customers through check → track → checkout flows
- **Identify bottlenecks** - Find slow billing operations impacting user experience
- **Audit billing events** - Complete trace of all billing-related operations

## Best Practices

1. **Always track server-side** - Use `check` and `track` on the backend for security
2. **Use idempotency keys** - Prevent duplicate tracking with `idempotency_key`
3. **Monitor check failures** - Alert on high rates of `allowed: false` checks
4. **Track checkout abandonment** - Monitor spans where checkout URLs are generated but not completed
5. **Correlate with business metrics** - Link billing spans to revenue and conversion metrics

## License

MIT
