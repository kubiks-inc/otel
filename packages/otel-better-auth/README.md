# @kubiks/otel-better-auth

OpenTelemetry instrumentation for [Better Auth](https://better-auth.com/). One-line setup for complete auth observability.

## Installation

```bash
npm install @kubiks/otel-better-auth
# or
pnpm add @kubiks/otel-better-auth
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `better-auth` >= 0.1.0

## Usage

Add the plugin to your Better Auth configuration:

```typescript
import { betterAuth } from "better-auth";
import { otelPlugin } from "@kubiks/otel-better-auth";

export const auth = betterAuth({
  database: db,
  // ... your config
}).use(otelPlugin());
```

That's it! All auth operations are now traced automatically.

## What Gets Traced

### Email/Password Auth
- `auth.signup.email` - User signup
- `auth.signin.email` - User signin

### OAuth
- `auth.oauth.{provider}.initiate` - User clicks "Sign in with..."
- `auth.oauth.{provider}` - OAuth callback processing

### Password Management
- `auth.forgot_password` - Forgot password request
- `auth.reset_password` - Password reset
- `auth.verify_email` - Email verification

### Session
- `auth.signout` - User signout

## Span Attributes

Each span includes:

| Attribute | Description | Example |
|-----------|-------------|---------|
| `auth.operation` | Type of operation | `signin`, `signup`, `oauth_callback` |
| `auth.method` | Auth method | `password`, `oauth` |
| `auth.provider` | OAuth provider | `google`, `github` |
| `auth.success` | Operation success | `true`, `false` |
| `auth.error` | Error message | `HTTP 401` |

## Configuration

```typescript
otelPlugin({
  tracerName: "my-app-auth",  // Custom tracer name
  tracer: customTracer,       // Custom tracer instance
})
```

## Examples

### Next.js

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { otelPlugin } from "@kubiks/otel-better-auth";

export const auth = betterAuth({
  database: db,
  socialProviders: {
    github: { clientId: "...", clientSecret: "..." },
    google: { clientId: "...", clientSecret: "..." },
  },
}).use(otelPlugin());
```

### With Other Plugins

```typescript
import { organization, admin } from "better-auth/plugins";
import { otelPlugin } from "@kubiks/otel-better-auth";

export const auth = betterAuth({
  database: db,
}).use(
  organization(),
  admin(),
  otelPlugin()  // Works with any Better Auth plugin
);
```

## Trace Example

When a user signs in with GitHub:

```
Span: auth.oauth.github.initiate  [12ms]
├─ auth.operation: oauth_initiate
├─ auth.method: oauth
├─ auth.provider: github
└─ auth.success: true

Span: auth.oauth.github  [245ms]
├─ auth.operation: oauth_callback
├─ auth.method: oauth
├─ auth.provider: github
└─ auth.success: true
```

## Framework Support

✅ Next.js (App Router & Pages Router)
✅ Express
✅ SvelteKit  
✅ Any framework supported by Better Auth

## Related

- [`@kubiks/otel-drizzle`](../otel-drizzle) - OpenTelemetry for Drizzle ORM
- [`better-auth`](https://better-auth.com/) - The authentication library for TypeScript

## License

MIT
