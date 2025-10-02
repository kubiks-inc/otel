# @kubiks/otel-better-auth

OpenTelemetry instrumentation for [Better Auth](https://better-auth.com/). Add distributed tracing to your authentication flows with a single line of code.

## 🚀 Features

- **🔌 Plugin-based**: Clean integration using Better Auth's native plugin system
- **📊 Comprehensive Coverage**: Traces all auth operations (signup, signin, OAuth, password reset, etc.)
- **🎯 Semantic Conventions**: Follows OpenTelemetry standards with meaningful attributes
- **🔐 Privacy-First**: Email capture is opt-in by default
- **⚡ Zero Config**: Works out of the box with sensible defaults
- **🎨 Rich Telemetry**: Captures user IDs, session IDs, auth methods, and success/failure status

## Installation

```bash
npm install @kubiks/otel-better-auth
# or
pnpm add @kubiks/otel-better-auth
# or
yarn add @kubiks/otel-better-auth
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `better-auth` >= 0.1.0

## Usage

### Basic Setup (One Line!)

Simply add the plugin to your Better Auth configuration:

```typescript
import { betterAuth } from "better-auth";
import { otelPlugin } from "@kubiks/otel-better-auth";

export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
  },
}).use(otelPlugin());

// That's it! All auth operations are now traced automatically ✨
```

### With Custom Configuration

```typescript
import { betterAuth } from "better-auth";
import { otelPlugin } from "@kubiks/otel-better-auth";

export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },
}).use(
  otelPlugin({
    tracerName: "my-app-auth", // Custom tracer name
    captureEmail: true, // Include email addresses in traces (default: false)
    captureErrors: true, // Capture detailed error messages (default: true)
  })
);
```

### Full Example with OpenTelemetry Setup

```typescript
// instrumentation.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// auth.ts
import { betterAuth } from "better-auth";
import { otelPlugin } from "@kubiks/otel-better-auth";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
}).use(otelPlugin());

// app.ts
import "./instrumentation"; // Must be imported first!
import { auth } from "./auth";

// Your auth is now fully instrumented!
```

## What You Get

The plugin automatically traces the following authentication events:

### 📝 Signup Operations

- Email/password signup
- OAuth provider signup
- Magic link signup
- Automatic user ID capture

**Span name**: `auth.signup` or `auth.signup.email`

### 🔑 Signin Operations

- Email/password signin
- OAuth provider signin (Google, GitHub, Facebook, etc.)
- Magic link signin
- Session creation tracking

**Span name**: `auth.signin`, `auth.signin.email`, or `auth.oauth.{provider}`

### 🔒 Password Management

- Forgot password requests
- Password reset flows
- Email verification

**Span names**: `auth.forgot_password`, `auth.reset_password`, `auth.verify_email`

### 🚪 Signout

- Session termination tracking

**Span name**: `auth.signout`

### 🌐 OAuth Flows

- Automatic provider detection (Google, GitHub, Facebook, etc.)
- Callback tracking
- Success/failure monitoring

**Span name**: `auth.oauth.{provider}`

## Span Attributes

Each traced operation includes rich telemetry data following OpenTelemetry semantic conventions:

| Attribute          | Description                    | Example                  |
| ------------------ | ------------------------------ | ------------------------ |
| `auth.operation`   | Type of auth operation         | `signin`, `signup`       |
| `auth.method`      | Authentication method          | `password`, `oauth`      |
| `auth.provider`    | OAuth provider (if applicable) | `google`, `github`       |
| `auth.success`     | Whether operation succeeded    | `true`, `false`          |
| `auth.error`       | Error message (if failed)      | `Invalid credentials`    |
| `user.id`          | User identifier                | `user_123456`            |
| `user.email`       | User email (opt-in)            | `user@example.com`       |
| `session.id`       | Session identifier             | `session_789012`         |

## Configuration Options

### `tracerName`

- **Type**: `string`
- **Default**: `"@kubiks/otel-better-auth"`
- **Description**: Custom name for the tracer

### `captureEmail`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Whether to include user email addresses in span attributes. **Note**: Email addresses are PII (Personally Identifiable Information). Only enable this if your tracing backend is compliant with your privacy requirements.

### `captureErrors`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Whether to capture detailed error messages in spans

### `tracer`

- **Type**: `Tracer`
- **Default**: `undefined`
- **Description**: Custom OpenTelemetry tracer instance. If not provided, the plugin will obtain a tracer using `trace.getTracer(tracerName)`.

## Privacy & Security

By default, the plugin is designed with privacy in mind:

- ✅ User emails are **NOT** captured by default
- ✅ Passwords are **NEVER** captured
- ✅ Only operation metadata and success/failure status are traced
- ⚠️ Enable `captureEmail: true` only if your infrastructure is compliant with privacy regulations (GDPR, CCPA, etc.)

## Architecture

The plugin leverages Better Auth's powerful plugin API to hook into:

1. **Lifecycle Hooks**: `user.create`, `session.create` for core auth events
2. **Endpoint Hooks**: All auth endpoints (`signInEmail`, `signUpEmail`, `forgetPassword`, etc.)
3. **Request/Response Hooks**: For OAuth callback detection and tracing

This provides comprehensive coverage of all authentication flows without any code changes to your application.

## Visualizing Traces

When integrated with a tracing backend (Jaeger, Zipkin, Honeycomb, Datadog, etc.), you'll see:

- 📊 End-to-end auth flow visualization
- ⏱️ Performance metrics for each auth operation
- 🔍 Detailed attributes for debugging
- 🚨 Error tracking with stack traces
- 📈 Success/failure rates across auth methods

## Examples

### Next.js App Router

```typescript
// app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth.handler);
```

### Express

```typescript
import express from "express";
import { auth } from "./auth";

const app = express();

app.all("/api/auth/*", auth.handler);

app.listen(3000);
```

### SvelteKit

```typescript
// src/hooks.server.ts
import { auth } from "$lib/auth";
import { svelteKitHandler } from "better-auth/svelte-kit";

export const handle = svelteKitHandler(auth);
```

## Compatibility

- ✅ Works with all Better Auth adapters (Drizzle, Prisma, Kysely, etc.)
- ✅ Compatible with all Better Auth plugins
- ✅ Framework agnostic (Next.js, Express, SvelteKit, etc.)
- ✅ Supports all authentication methods (email/password, OAuth, magic link)

## Best Practices

1. **Initialize OpenTelemetry early**: Import your instrumentation file before any other code
2. **Use environment-based configuration**: Enable `captureEmail` only in development/staging
3. **Combine with other instrumentation**: Use alongside `@kubiks/otel-drizzle` for database query tracing
4. **Monitor performance**: Set up alerts for slow auth operations or high failure rates
5. **Respect privacy**: Be mindful of what PII you capture in production traces

## Related Packages

- [`@kubiks/otel-drizzle`](https://www.npmjs.com/package/@kubiks/otel-drizzle) - OpenTelemetry instrumentation for Drizzle ORM
- [`better-auth`](https://better-auth.com/) - The best authentication library for TypeScript

## Contributing

We welcome contributions! Please check out our [GitHub repository](https://github.com/kubiks-inc/otel) for issues and pull requests.

## License

MIT

---

Made with ❤️ by [Kubiks](https://github.com/kubiks-inc)
