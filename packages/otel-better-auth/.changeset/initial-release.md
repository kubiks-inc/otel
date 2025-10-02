---
"@kubiks/otel-better-auth": major
---

Initial release of @kubiks/otel-better-auth

🎉 First release of OpenTelemetry instrumentation for Better Auth!

## Features

- **Plugin-based integration**: Clean one-line setup using Better Auth's native plugin system
- **Comprehensive auth event tracing**: Automatic instrumentation for signup, signin, OAuth, password reset, and more
- **Privacy-first design**: Email capture is opt-in, passwords never captured
- **Rich telemetry**: Captures user IDs, session IDs, auth methods, and success/failure status
- **Semantic conventions**: Follows OpenTelemetry standards with meaningful span attributes
- **Zero configuration**: Works out of the box with sensible defaults

## Supported Auth Operations

- User signup (email/password, OAuth, magic link)
- User signin (all authentication methods)
- Password reset flows (forgot password, reset password)
- Email verification
- Session management
- OAuth callbacks (Google, GitHub, Facebook, and more)
- Sign out

## Usage

```typescript
import { betterAuth } from "better-auth";
import { otelPlugin } from "@kubiks/otel-better-auth";

export const auth = betterAuth({
  database: db,
  emailAndPassword: { enabled: true },
}).use(otelPlugin());
```

That's it! All your authentication operations are now traced with OpenTelemetry.
