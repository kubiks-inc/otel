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

### Server-Side (Recommended)

Wrap your Better Auth server instance to automatically trace all API calls:

```typescript
import { betterAuth } from "better-auth";
import { instrumentBetterAuth } from "@kubiks/otel-better-auth";

export const auth = instrumentBetterAuth(betterAuth({
  database: db,
  // ... your config
}));
```

### Client-Side

Wrap your Better Auth client to trace client operations:

```typescript
import { createAuthClient } from "better-auth/client";
import { instrumentBetterAuth } from "@kubiks/otel-better-auth";

const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
});

instrumentBetterAuth(authClient);

// Now all calls are automatically traced
await authClient.getSession();
await authClient.signIn.email({ email, password });
```

That's it! All auth operations are now traced automatically.

## What Gets Traced

### Server-Side API Methods
- `auth.api.get_session` - Get current session
- `auth.api.signin.email` - Email signin
- `auth.api.signup.email` - Email signup
- `auth.api.signin.social` - OAuth signin
- `auth.api.oauth.callback` - OAuth callback
- `auth.api.signout` - User signout

### Client-Side Methods
- `auth.get_session` - Get current session (includes `user.id` and `session.id` attributes)
- `auth.signup.email` - User signup
- `auth.signin.email` - User signin
- `auth.signin.{provider}` - OAuth sign in (e.g., `auth.signin.google`, `auth.signin.github`)
- `auth.signup.{provider}` - OAuth sign up
- `auth.signout` - User signout

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

### Server-Side (Next.js App Router)

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { instrumentBetterAuth } from "@kubiks/otel-better-auth";
import { db } from "./db";

export const auth = instrumentBetterAuth(betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg" }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },
}));

// app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
export { GET, POST } = auth.handler;
```

### Client-Side (React/Next.js)

```typescript
// lib/auth-client.ts
import { createAuthClient } from "better-auth/client";
import { instrumentBetterAuth } from "@kubiks/otel-better-auth";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
});

instrumentBetterAuth(authClient);
```

```typescript
// components/LoginForm.tsx
import { authClient } from "@/lib/auth-client";

function LoginForm() {
  const handleLogin = async (email: string, password: string) => {
    // This call is automatically traced
    const result = await authClient.signIn.email({ email, password });
    
    if (result.data) {
      console.log("Logged in:", result.data.user);
    }
  };

  return (/* ... */);
}
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

## Trace Example

### Server-Side Trace

When a user signs in via the server API:

```
Span: auth.api.signin.email  [245ms]
├─ auth.operation: signin
├─ auth.method: email
├─ auth.success: true
├─ user.id: user_abc123
├─ user.email: user@example.com
└─ session.id: session_xyz789

Span: auth.api.get_session  [12ms]
├─ auth.operation: get_session
├─ auth.success: true
├─ user.id: user_abc123
└─ session.id: session_xyz789
```

### Client-Side Trace

When a user signs in via the client:

```
Span: auth.signin.email  [245ms]
├─ auth.operation: signin
├─ auth.method: email
├─ auth.success: true
├─ user.id: user_abc123
├─ user.email: user@example.com
└─ session.id: session_xyz789

Span: auth.get_session  [12ms]
├─ auth.operation: get_session
├─ auth.success: true
├─ user.id: user_abc123
└─ session.id: session_xyz789
```

## Framework Support

Works with any JavaScript/TypeScript environment where Better Auth client runs:

✅ Next.js (App Router & Pages Router)
✅ React / React Native
✅ Vue / Nuxt
✅ Svelte / SvelteKit  
✅ Solid.js
✅ Node.js
✅ Any framework with Better Auth client support

## Related

- [`@kubiks/otel-drizzle`](../otel-drizzle) - OpenTelemetry for Drizzle ORM
- [`better-auth`](https://better-auth.com/) - The authentication library for TypeScript

## License

MIT
