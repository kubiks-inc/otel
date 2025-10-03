# @kubiks/otel-better-auth

## 2.0.0

### Major Changes

- [#6](https://github.com/kubiks-inc/otel/pull/6) [`9da64d2`](https://github.com/kubiks-inc/otel/commit/9da64d25ba4d72fa1ee1646e40876a8fb3ef1487) Thanks [@alex-holovach](https://github.com/alex-holovach)! - Initial release of @kubiks/otel-better-auth

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
  import { instrumentBetterAuth } from "@kubiks/otel-better-auth";

  export const auth = instrumentBetterAuth(
    betterAuth({
      database: db,
      // ... your Better Auth config
    }),
  );
  ```

  That's it! All your authentication operations are now traced with OpenTelemetry.

- [#6](https://github.com/kubiks-inc/otel/pull/6) [`27b7dd4`](https://github.com/kubiks-inc/otel/commit/27b7dd40f7cc45acc95320ca7b0a716f2f3416a6) Thanks [@alex-holovach](https://github.com/alex-holovach)! - bump version
