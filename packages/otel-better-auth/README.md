# @kubiks/otel-better-auth

OpenTelemetry instrumentation for [Better Auth](https://better-auth.com/). One-line setup for complete auth observability on both server and client.

## Installation

```bash
npm install @kubiks/otel-better-auth
# or
pnpm add @kubiks/otel-better-auth
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `better-auth` >= 0.1.0

## Usage

### Server-Side with Plugin (Recommended for HTTP-level tracing)

Use the plugin to trace all HTTP requests, including OAuth callbacks and social sign-ins:

```typescript
import { betterAuth } from "better-auth";
import { otelPlugin } from "@kubiks/otel-better-auth";

export const auth = betterAuth({
  database: db,
  plugins: [otelPlugin()],
  // ... your config
});
```

**This is the recommended approach** as it captures:
- ✅ OAuth callbacks with user ID
- ✅ Social sign-ins with user ID
- ✅ All HTTP-based auth operations
- ✅ Email verification, password reset, etc.

### Server-Side with Wrapper (For direct API calls)

If you call `auth.api.*` methods directly in your code, also wrap the instance:

```typescript
import { betterAuth } from "better-auth";
import { instrumentBetterAuth, otelPlugin } from "@kubiks/otel-better-auth";

export const auth = instrumentBetterAuth(betterAuth({
  database: db,
  plugins: [otelPlugin()], // HTTP-level tracing
  // ... your config
}));

// Now direct API calls are also traced:
// await auth.api.getSession({ headers });
```

That's it! All auth operations are now traced automatically.

## What Gets Traced

### HTTP-Level (Plugin) - Recommended

The `otelPlugin()` traces all HTTP requests with user ID extraction:

**Authentication:**
- `auth.http.oauth.callback.{provider}` - OAuth callback **with user ID** ✅
- `auth.http.signin.email` - Email signin **with user ID**
- `auth.http.signup.email` - Email signup **with user ID**
- `auth.http.oauth.initiate.{provider}` - OAuth initiation
- `auth.http.signout` - User signout
- `auth.http.get_session` - Get session

**Account & Password:**
- `auth.http.verify_email` - Email verification
- `auth.http.forgot_password` - Password reset request
- `auth.http.reset_password` - Password reset

### Server-Side API Methods (Wrapper)

When using `instrumentBetterAuth()`, **all Better Auth server API methods** are instrumented, including:

**Session Management:**
- `auth.api.get_session` - Get current session with user ID and session ID
- `auth.api.list_sessions` - List all sessions
- `auth.api.revoke_session` - Revoke a session
- `auth.api.revoke_sessions` - Revoke multiple sessions
- `auth.api.revoke_other_sessions` - Revoke all other sessions

**Authentication:**
- `auth.api.signin` (email) - Email signin **with user ID**
- `auth.api.signup` (email) - Email signup **with user ID**
- `auth.api.signin` (social) - OAuth signin **with user ID**
- `auth.api.oauth_callback` - OAuth callback **with user ID**
- `auth.api.signout` - User signout

**Account Management:**
- `auth.api.link_social_account` - Link social account
- `auth.api.unlink_account` - Unlink account
- `auth.api.list_user_accounts` - List user accounts
- `auth.api.update_user` - Update user profile
- `auth.api.delete_user` - Delete user account

**Password Management:**
- `auth.api.change_password` - Change password
- `auth.api.set_password` - Set password
- `auth.api.forget_password` - Forgot password request
- `auth.api.reset_password` - Reset password

**Email Management:**
- `auth.api.change_email` - Change email
- `auth.api.verify_email` - Verify email **with user ID**
- `auth.api.send_verification_email` - Send verification email

**Token Management:**
- `auth.api.refresh_token` - Refresh access token
- `auth.api.get_access_token` - Get access token

**Plus any other API methods** - The instrumentation automatically wraps all API methods, including those from plugins!

## Span Attributes

Each span includes:

| Attribute | Description | Example |
|-----------|-------------|---------|
| `auth.operation` | Type of operation | `signin`, `signup`, `get_session`, `signout` |
| `auth.method` | Auth method | `email`, `oauth` |
| `auth.provider` | OAuth provider (when applicable) | `google`, `github` |
| `auth.success` | Operation success | `true`, `false` |
| `auth.error` | Error message (when failed) | `Invalid credentials` |
| `user.id` | User ID (when available) | `user_123456` |
| `user.email` | User email (when available) | `user@example.com` |
| `session.id` | Session ID (when available) | `session_abcdef` |

## Configuration

```typescript
instrumentBetterAuth(authClient, {
  tracerName: "my-app-auth",  // Custom tracer name
  tracer: customTracer,       // Custom tracer instance
})
```

## Examples

### Server-Side with Plugin (Recommended)

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { otelPlugin } from "@kubiks/otel-better-auth";
import { db } from "./db";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg" }),
  plugins: [
    otelPlugin(), // Traces all HTTP requests including OAuth callbacks
  ],
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },
});

// app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
export { GET, POST } = auth.handler;
```

### Complete Example (Plugin + Wrapper)

For maximum observability, use both approaches:

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { instrumentBetterAuth, otelPlugin } from "@kubiks/otel-better-auth";

export const auth = instrumentBetterAuth(
  betterAuth({
    database: db,
    plugins: [otelPlugin()], // Traces HTTP requests (OAuth, etc.)
    // ... your config
  })
);

// Now you get traces for:
// 1. HTTP requests (OAuth callbacks, sign-ins) via otelPlugin
// 2. Direct API calls (auth.api.*) via instrumentBetterAuth
```

### Server API Usage

```typescript
// Server-side route handler
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  // This call is automatically traced with full context
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (session?.user) {
    return Response.json({ user: session.user });
  }
  
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
```

## Trace Examples

### OAuth Sign-In (HTTP Plugin)

When a user signs in with GitHub, you'll see:

```
Span: auth.http.oauth.initiate.github  [15ms]
├─ auth.operation: oauth_initiate
├─ auth.method: oauth
├─ auth.provider: github
└─ auth.success: true

Span: auth.http.oauth.callback.github  [342ms]
├─ auth.operation: oauth_callback
├─ auth.method: oauth
├─ auth.provider: github
├─ auth.success: true
├─ user.id: user_abc123          ← User ID captured! ✅
├─ user.email: user@github.com
└─ session.id: session_xyz789
```

### Email Sign-In (HTTP Plugin)

```
Span: auth.http.signin.email  [245ms]
├─ auth.operation: signin
├─ auth.method: email
├─ auth.success: true
├─ user.id: user_abc123          ← User ID captured! ✅
├─ user.email: user@example.com
└─ session.id: session_xyz789
```

### Direct API Call (Wrapper)

```
Span: auth.api.get_session  [12ms]
├─ auth.operation: get_session
├─ auth.success: true
├─ user.id: user_abc123
└─ session.id: session_xyz789
```

## Framework Support

Works with any JavaScript/TypeScript server environment where Better Auth runs:

✅ Next.js (App Router & Pages Router)
✅ Express
✅ Hono
✅ Fastify
✅ SvelteKit  
✅ Node.js
✅ Any framework supported by Better Auth

## Related

- [`@kubiks/otel-drizzle`](../otel-drizzle) - OpenTelemetry for Drizzle ORM
- [`better-auth`](https://better-auth.com/) - The authentication library for TypeScript

## License

MIT
