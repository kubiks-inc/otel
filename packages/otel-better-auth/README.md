# @kubiks/otel-better-auth

OpenTelemetry instrumentation for [Better Auth](https://better-auth.com/). One-line setup for complete auth observability across all auth flows.

## Installation

```bash
npm install @kubiks/otel-better-auth
# or
pnpm add @kubiks/otel-better-auth
```

**Peer Dependencies:** `@opentelemetry/api` >= 1.9.0, `better-auth` >= 1.0.0

## Usage

### Quick Start

```typescript
import { betterAuth } from "better-auth";
import { instrumentBetterAuth } from "@kubiks/otel-better-auth";

export const auth = instrumentBetterAuth(
  betterAuth({
    database: db,
    // ... your Better Auth config
  }),
);
```

Instrumenting Better Auth is just a single call—wrap the instance you already
create and every API method invocation is traced automatically. Keep the rest of
your configuration unchanged.

## What Gets Traced

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

**Session Management:**

- `auth.api.get_session` - Get current session with user ID and session ID
- `auth.api.list_sessions` - List all sessions
- `auth.api.revoke_session` - Revoke a session
- `auth.api.revoke_sessions` - Revoke multiple sessions
- `auth.api.revoke_other_sessions` - Revoke all other sessions

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

## Span Attributes

Each span includes:

| Attribute        | Description                      | Example                                      |
| ---------------- | -------------------------------- | -------------------------------------------- |
| `auth.operation` | Type of operation                | `signin`, `signup`, `get_session`, `signout` |
| `auth.method`    | Auth method                      | `email`, `oauth`                             |
| `auth.provider`  | OAuth provider (when applicable) | `google`, `github`                           |
| `auth.success`   | Operation success                | `true`, `false`                              |
| `auth.error`     | Error message (when failed)      | `Invalid credentials`                        |
| `user.id`        | User ID (when available)         | `user_123456`                                |
| `user.email`     | User email (when available)      | `user@example.com`                           |
| `session.id`     | Session ID (when available)      | `session_abcdef`                             |

## Configuration

```typescript
instrumentBetterAuth(authClient, {
  tracerName: "my-app", // Custom tracer name
  tracer: customTracer, // Custom tracer instance
});
```

## Examples

### Basic Instrumentation (Auto Plugin)

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { instrumentBetterAuth } from "@kubiks/otel-better-auth";
import { db } from "./db";

export const auth = instrumentBetterAuth(
  betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, { provider: "pg" }),
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      },
    },
  }),
);

// app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
export { GET, POST } = auth.handler;
```

## License

MIT
