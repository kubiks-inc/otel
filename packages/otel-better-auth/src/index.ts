import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import type { createAuthClient } from "better-auth/client";
import type { Auth } from "better-auth";

const DEFAULT_TRACER_NAME = "@kubiks/otel-better-auth";
const INSTRUMENTED_FLAG = "__kubiksOtelBetterAuthInstrumented" as const;

// Semantic conventions for auth attributes
export const SEMATTRS_AUTH_OPERATION = "auth.operation";
export const SEMATTRS_AUTH_METHOD = "auth.method";
export const SEMATTRS_AUTH_PROVIDER = "auth.provider";
export const SEMATTRS_USER_ID = "user.id";
export const SEMATTRS_USER_EMAIL = "user.email";
export const SEMATTRS_SESSION_ID = "session.id";
export const SEMATTRS_AUTH_SUCCESS = "auth.success";
export const SEMATTRS_AUTH_ERROR = "auth.error";

/**
 * Configuration options for Better Auth OpenTelemetry instrumentation.
 */
export interface InstrumentBetterAuthConfig {
  /**
   * Custom tracer name. Defaults to "@kubiks/otel-better-auth".
   */
  tracerName?: string;

  /**
   * Custom tracer instance. If not provided, will use trace.getTracer().
   */
  tracer?: Tracer;
}

/**
 * Type representing a Better Auth client instance.
 */
type BetterAuthClient = ReturnType<typeof createAuthClient>;

/**
 * Type representing a Better Auth server instance.
 */
type BetterAuthServer = Auth<any>;

interface InstrumentedClient {
  [INSTRUMENTED_FLAG]?: true;
}

/**
 * Finalizes a span with status, timing, and optional error.
 */
function finalizeSpan(span: Span, error?: unknown): void {
  if (error) {
    if (error instanceof Error) {
      span.recordException(error);
    } else {
      span.recordException(new Error(String(error)));
    }
    span.setStatus({ code: SpanStatusCode.ERROR });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

/**
 * Wraps an async function with OpenTelemetry tracing.
 */
function wrapAuthMethod<T extends (...args: any[]) => Promise<any>>(
  originalFn: T,
  spanName: string,
  attributes: Record<string, string>,
  tracer: Tracer,
): T {
  return (async function instrumented(
    this: any,
    ...args: Parameters<T>
  ): Promise<any> {
    const span = tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
      attributes,
    });
    span.setAttribute(SEMATTRS_AUTH_SUCCESS, true);

    const activeContext = trace.setSpan(context.active(), span);

    return context.with(activeContext, async () => {
      try {
        const result = await originalFn.apply(this, args);

        // Extract user and session info from successful results
        if (result) {
          if (result.data) {
            // Handle Better Fetch response format { data, error }
            if (result.data.user?.id) {
              span.setAttribute(SEMATTRS_USER_ID, result.data.user.id);
            }
            if (result.data.user?.email) {
              span.setAttribute(SEMATTRS_USER_EMAIL, result.data.user.email);
            }
            if (result.data.session?.id) {
              span.setAttribute(SEMATTRS_SESSION_ID, result.data.session.id);
            }

            // Check for errors in the response
            if (result.error) {
              span.setAttribute(SEMATTRS_AUTH_SUCCESS, false);
              span.setAttribute(
                SEMATTRS_AUTH_ERROR,
                result.error.message || "Unknown error",
              );
              span.setStatus({ code: SpanStatusCode.ERROR });
            }
          } else {
            // Handle direct response format (server API)
            if (result.user?.id) {
              span.setAttribute(SEMATTRS_USER_ID, result.user.id);
            }
            if (result.user?.email) {
              span.setAttribute(SEMATTRS_USER_EMAIL, result.user.email);
            }
            if (result.session?.id) {
              span.setAttribute(SEMATTRS_SESSION_ID, result.session.id);
            }
          }
        }

        finalizeSpan(span);
        return result;
      } catch (error) {
        span.setAttribute(SEMATTRS_AUTH_SUCCESS, false);
        finalizeSpan(span, error);
        throw error;
      }
    });
  }) as T;
}

/**
 * Checks if the given object is a Better Auth server instance.
 */
function isBetterAuthServer(
  instance: any,
): instance is BetterAuthServer {
  return (
    instance &&
    typeof instance === "object" &&
    typeof instance.handler === "function" &&
    typeof instance.api === "object"
  );
}

/**
 * Checks if the given object is a Better Auth client instance.
 */
function isBetterAuthClient(
  instance: any,
): instance is BetterAuthClient {
  return (
    instance &&
    typeof instance === "object" &&
    !instance.handler && // Server has handler, client doesn't
    (typeof instance.getSession === "function" ||
      typeof instance.signOut === "function" ||
      typeof instance.signIn === "object" ||
      typeof instance.signUp === "object")
  );
}

/**
 * Instruments a Better Auth client with OpenTelemetry tracing.
 */
function instrumentClient<TClient extends BetterAuthClient>(
  client: TClient,
  tracer: Tracer,
): TClient {
  // Instrument getSession
  if (typeof client.getSession === "function") {
    const originalGetSession = client.getSession;
    client.getSession = wrapAuthMethod(
      originalGetSession,
      "auth.get_session",
      { [SEMATTRS_AUTH_OPERATION]: "get_session" },
      tracer,
    );
  }

  // Instrument signOut
  if (typeof client.signOut === "function") {
    const originalSignOut = client.signOut;
    client.signOut = wrapAuthMethod(
      originalSignOut,
      "auth.signout",
      { [SEMATTRS_AUTH_OPERATION]: "signout" },
      tracer,
    );
  }

  // Instrument signIn methods
  if (client.signIn && typeof client.signIn === "object") {
    if (typeof client.signIn.email === "function") {
      const originalSignInEmail = client.signIn.email;
      client.signIn.email = wrapAuthMethod(
        originalSignInEmail,
        "auth.signin.email",
        {
          [SEMATTRS_AUTH_OPERATION]: "signin",
          [SEMATTRS_AUTH_METHOD]: "email",
        },
        tracer,
      );
    }

    // Instrument OAuth sign-in methods
    for (const [provider, method] of Object.entries(client.signIn)) {
      if (
        provider !== "email" &&
        typeof method === "function" &&
        !method.name.includes("bound instrumented")
      ) {
        client.signIn[provider] = wrapAuthMethod(
          method,
          `auth.signin.${provider}`,
          {
            [SEMATTRS_AUTH_OPERATION]: "signin",
            [SEMATTRS_AUTH_METHOD]: "oauth",
            [SEMATTRS_AUTH_PROVIDER]: provider,
          },
          tracer,
        );
      }
    }
  }

  // Instrument signUp methods
  if (client.signUp && typeof client.signUp === "object") {
    if (typeof client.signUp.email === "function") {
      const originalSignUpEmail = client.signUp.email;
      client.signUp.email = wrapAuthMethod(
        originalSignUpEmail,
        "auth.signup.email",
        {
          [SEMATTRS_AUTH_OPERATION]: "signup",
          [SEMATTRS_AUTH_METHOD]: "email",
        },
        tracer,
      );
    }

    // Instrument OAuth sign-up methods (if any)
    for (const [provider, method] of Object.entries(client.signUp)) {
      if (
        provider !== "email" &&
        typeof method === "function" &&
        !method.name.includes("bound instrumented")
      ) {
        client.signUp[provider] = wrapAuthMethod(
          method,
          `auth.signup.${provider}`,
          {
            [SEMATTRS_AUTH_OPERATION]: "signup",
            [SEMATTRS_AUTH_METHOD]: "oauth",
            [SEMATTRS_AUTH_PROVIDER]: provider,
          },
          tracer,
        );
      }
    }
  }

  return client;
}

/**
 * Instruments a Better Auth server instance with OpenTelemetry tracing.
 */
function instrumentServer<TServer extends BetterAuthServer>(
  server: TServer,
  tracer: Tracer,
): TServer {
  const api = server.api as any; // Cast to any to allow property assignment

  // Instrument getSession API
  if (typeof api.getSession === "function") {
    const originalGetSession = api.getSession;
    api.getSession = wrapAuthMethod(
      originalGetSession,
      "auth.api.get_session",
      { [SEMATTRS_AUTH_OPERATION]: "get_session" },
      tracer,
    );
  }

  // Instrument signOut API
  if (typeof api.signOut === "function") {
    const originalSignOut = api.signOut;
    api.signOut = wrapAuthMethod(
      originalSignOut,
      "auth.api.signout",
      { [SEMATTRS_AUTH_OPERATION]: "signout" },
      tracer,
    );
  }

  // Instrument signInEmail API
  if (typeof api.signInEmail === "function") {
    const originalSignInEmail = api.signInEmail;
    api.signInEmail = wrapAuthMethod(
      originalSignInEmail,
      "auth.api.signin.email",
      {
        [SEMATTRS_AUTH_OPERATION]: "signin",
        [SEMATTRS_AUTH_METHOD]: "email",
      },
      tracer,
    );
  }

  // Instrument signUpEmail API
  if (typeof api.signUpEmail === "function") {
    const originalSignUpEmail = api.signUpEmail;
    api.signUpEmail = wrapAuthMethod(
      originalSignUpEmail,
      "auth.api.signup.email",
      {
        [SEMATTRS_AUTH_OPERATION]: "signup",
        [SEMATTRS_AUTH_METHOD]: "email",
      },
      tracer,
    );
  }

  // Instrument signInSocial API (OAuth)
  if (typeof api.signInSocial === "function") {
    const originalSignInSocial = api.signInSocial;
    api.signInSocial = wrapAuthMethod(
      originalSignInSocial,
      "auth.api.signin.social",
      {
        [SEMATTRS_AUTH_OPERATION]: "signin",
        [SEMATTRS_AUTH_METHOD]: "oauth",
      },
      tracer,
    );
  }

  // Instrument callbackOAuth API
  if (typeof api.callbackOAuth === "function") {
    const originalCallbackOAuth = api.callbackOAuth;
    api.callbackOAuth = wrapAuthMethod(
      originalCallbackOAuth,
      "auth.api.oauth.callback",
      {
        [SEMATTRS_AUTH_OPERATION]: "oauth_callback",
        [SEMATTRS_AUTH_METHOD]: "oauth",
      },
      tracer,
    );
  }

  return server;
}

/**
 * Instruments a Better Auth instance (client or server) with OpenTelemetry tracing.
 *
 * This function automatically detects whether you're instrumenting a client
 * (from `createAuthClient`) or server (from `betterAuth`) instance and applies
 * the appropriate instrumentation.
 *
 * For client instances, it wraps methods like `getSession`, `signIn.email`, etc.
 * For server instances, it wraps API methods like `api.getSession`, `api.signInEmail`, etc.
 *
 * The instrumentation captures user IDs, session IDs, and auth status in span attributes.
 * The instrumentation is idempotent - calling it multiple times on the same
 * instance will only instrument it once.
 *
 * @typeParam T - The type of the Better Auth instance (client or server)
 * @param instance - The Better Auth instance to instrument
 * @param config - Optional configuration for instrumentation behavior
 * @returns The instrumented instance (same instance, modified in place)
 *
 * @example
 * ```typescript
 * // Server-side (Next.js, Express, etc.)
 * import { betterAuth } from "better-auth";
 * import { instrumentBetterAuth } from "@kubiks/otel-better-auth";
 *
 * export const auth = instrumentBetterAuth(betterAuth({
 *   database: db,
 *   // ... your config
 * }));
 * ```
 *
 * @example
 * ```typescript
 * // Client-side (React, Vue, etc.)
 * import { createAuthClient } from "better-auth/client";
 * import { instrumentBetterAuth } from "@kubiks/otel-better-auth";
 *
 * const authClient = createAuthClient({
 *   baseURL: process.env.BETTER_AUTH_URL,
 * });
 *
 * instrumentBetterAuth(authClient);
 *
 * // Now all calls are traced
 * await authClient.getSession();
 * await authClient.signIn.email({ email, password });
 * ```
 */
export function instrumentBetterAuth<
  T extends BetterAuthClient | BetterAuthServer,
>(instance: T, config?: InstrumentBetterAuthConfig): T {
  if (!instance || typeof instance !== "object") {
    return instance;
  }

  if ((instance as T & InstrumentedClient)[INSTRUMENTED_FLAG]) {
    return instance;
  }

  const { tracerName = DEFAULT_TRACER_NAME, tracer: customTracer } =
    config ?? {};

  const tracer = customTracer ?? trace.getTracer(tracerName);

  // Detect instance type and apply appropriate instrumentation
  if (isBetterAuthServer(instance)) {
    instrumentServer(instance, tracer);
  } else if (isBetterAuthClient(instance)) {
    instrumentClient(instance, tracer);
  } else {
    console.warn(
      "[otel-better-auth] Unable to detect Better Auth instance type. Skipping instrumentation.",
    );
    return instance;
  }

  (instance as T & InstrumentedClient)[INSTRUMENTED_FLAG] = true;

  return instance;
}

// Re-export for convenience
export { instrumentBetterAuth as default };
