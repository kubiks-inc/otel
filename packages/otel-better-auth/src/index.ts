import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import type { Auth, BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

const DEFAULT_TRACER_NAME = "@kubiks/otel-better-auth";
const INSTRUMENTED_FLAG = "__kubiksOtelBetterAuthInstrumented" as const;

// Store spans per request URL
const requestSpans = new Map<string, Span>();

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

interface InstrumentedAuth {
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
 * Maps API method names to their operation metadata.
 */
const API_METHOD_METADATA: Record<
  string,
  { operation: string; method?: string }
> = {
  getSession: { operation: "get_session" },
  signOut: { operation: "signout" },
  signInEmail: { operation: "signin", method: "email" },
  signUpEmail: { operation: "signup", method: "email" },
  signInSocial: { operation: "signin", method: "oauth" },
  callbackOAuth: { operation: "oauth_callback", method: "oauth" },
  linkSocialAccount: { operation: "link_social_account", method: "oauth" },
  unlinkAccount: { operation: "unlink_account" },
  listUserAccounts: { operation: "list_user_accounts" },
  updateUser: { operation: "update_user" },
  deleteUser: { operation: "delete_user" },
  changePassword: { operation: "change_password" },
  setPassword: { operation: "set_password" },
  changeEmail: { operation: "change_email" },
  verifyEmail: { operation: "verify_email" },
  sendVerificationEmail: { operation: "send_verification_email" },
  forgetPassword: { operation: "forget_password" },
  resetPassword: { operation: "reset_password" },
  listSessions: { operation: "list_sessions" },
  revokeSession: { operation: "revoke_session" },
  revokeSessions: { operation: "revoke_sessions" },
  revokeOtherSessions: { operation: "revoke_other_sessions" },
  refreshToken: { operation: "refresh_token" },
  getAccessToken: { operation: "get_access_token" },
};

/**
 * Instruments a Better Auth server instance with OpenTelemetry tracing.
 */
function instrumentServer<O extends Record<string, any> = any>(
  server: Auth<O>,
  tracer: Tracer,
): Auth<O> {
  const api = server.api as any; // Cast to any to allow property assignment
  const instrumentedMethods = new Set<string>();

  // First, instrument all known API methods with specific metadata
  for (const [methodName, metadata] of Object.entries(API_METHOD_METADATA)) {
    if (typeof api[methodName] === "function") {
      const originalMethod = api[methodName];
      const spanName = `auth.api.${metadata.operation}`;
      const attributes: Record<string, string> = {
        [SEMATTRS_AUTH_OPERATION]: metadata.operation,
      };

      if (metadata.method) {
        attributes[SEMATTRS_AUTH_METHOD] = metadata.method;
      }

      api[methodName] = wrapAuthMethod(
        originalMethod,
        spanName,
        attributes,
        tracer,
      );
      instrumentedMethods.add(methodName);
    }
  }

  // Then, instrument any remaining API methods as generic operations
  // This catches any methods we might have missed or future additions
  for (const key of Object.keys(api)) {
    if (
      typeof api[key] === "function" &&
      !instrumentedMethods.has(key) &&
      !key.startsWith("$") && // Skip special properties
      !key.startsWith("_") // Skip private methods
    ) {
      const originalMethod = api[key];
      const operationName = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      const spanName = `auth.api.${operationName}`;

      api[key] = wrapAuthMethod(
        originalMethod,
        spanName,
        { [SEMATTRS_AUTH_OPERATION]: operationName },
        tracer,
      );
    }
  }

  return server;
}

/**
 * Instruments a Better Auth server instance with OpenTelemetry tracing.
 *
 * This function wraps all server API methods (api.getSession, api.signInEmail, etc.)
 * to automatically create spans for each auth operation. It captures user IDs,
 * session IDs, and auth status in span attributes.
 *
 * The instrumentation is idempotent - calling it multiple times on the same
 * instance will only instrument it once.
 *
 * @param auth - The Better Auth server instance to instrument
 * @param config - Optional configuration for instrumentation behavior
 * @returns The instrumented auth instance (same instance, modified in place)
 *
 * @example
 * ```typescript
 * import { betterAuth } from "better-auth";
 * import { instrumentBetterAuth, otelPlugin } from "@kubiks/otel-better-auth";
 *
 * export const auth = instrumentBetterAuth(betterAuth({
 *   database: db,
 *   plugins: [otelPlugin()], // For HTTP-level tracing
 *   // ... your config
 * }));
 *
 * // Now direct API calls are traced:
 * await auth.api.getSession({ headers });
 * ```
 */
export function instrumentBetterAuth<O extends Record<string, any> = any>(
  auth: Auth<O>,
  config?: InstrumentBetterAuthConfig,
): Auth<O> {
  if (!auth || typeof auth !== "object") {
    return auth;
  }

  if ((auth as Auth<O> & InstrumentedAuth)[INSTRUMENTED_FLAG]) {
    return auth;
  }

  const { tracerName = DEFAULT_TRACER_NAME, tracer: customTracer } =
    config ?? {};

  const tracer = customTracer ?? trace.getTracer(tracerName);

  instrumentServer(auth, tracer);

  (auth as Auth<O> & InstrumentedAuth)[INSTRUMENTED_FLAG] = true;

  return auth;
}

/**
 * Creates a Better Auth plugin that adds OpenTelemetry tracing to HTTP requests.
 *
 * This plugin hooks into the Better Auth request/response lifecycle to trace
 * all authentication operations, including OAuth callbacks and social sign-ins.
 *
 * Use this in addition to `instrumentBetterAuth()` for comprehensive tracing:
 * - The plugin traces HTTP-level operations (OAuth callbacks, etc.)
 * - `instrumentBetterAuth()` traces direct API method calls
 *
 * @param config - Optional configuration for instrumentation behavior
 * @returns A Better Auth plugin that can be added via the plugins array
 *
 * @example
 * ```typescript
 * import { betterAuth } from "better-auth";
 * import { otelPlugin } from "@kubiks/otel-better-auth";
 *
 * export const auth = betterAuth({
 *   database: db,
 *   plugins: [otelPlugin()],
 * });
 * ```
 */
export function otelPlugin(config?: InstrumentBetterAuthConfig): BetterAuthPlugin {
  const {
    tracerName = DEFAULT_TRACER_NAME,
    tracer: customTracer,
  } = config ?? {};

  const tracer = customTracer ?? trace.getTracer(tracerName);

  return {
    id: "otel",

    hooks: {
      after: [
        {
          matcher: () => true, // Match all endpoints
          handler: createAuthMiddleware(async (ctx) => {
            try {
              const path = ctx.path;
              
              // Get the span we created in onRequest
              const spanKey = `${ctx.request?.method || "GET"}:${ctx.request?.url}`;
              const span = requestSpans.get(spanKey);
              
              if (span && ctx.context.newSession) {
                // Extract user and session data from newSession
                const { user, session } = ctx.context.newSession;
                
                if (user?.id) {
                  span.setAttribute(SEMATTRS_USER_ID, user.id);
                }
                if (user?.email) {
                  span.setAttribute(SEMATTRS_USER_EMAIL, user.email);
                }
                if (session?.id) {
                  span.setAttribute(SEMATTRS_SESSION_ID, session.id);
                }
              }
            } catch (error) {
              console.error("[otel-better-auth] after hook error:", error);
            }
          }),
        },
      ],
    },

    onRequest: async (request, ctx) => {
      try {
        const url = new URL(request.url);
        const path = url.pathname;

        let spanName: string | null = null;
        const attributes: Record<string, string> = {};

        // Determine operation type from path
        if (path.endsWith("/sign-up/email")) {
          spanName = "auth.http.signup.email";
          attributes[SEMATTRS_AUTH_OPERATION] = "signup";
          attributes[SEMATTRS_AUTH_METHOD] = "email";
        } else if (path.endsWith("/sign-in/email")) {
          spanName = "auth.http.signin.email";
          attributes[SEMATTRS_AUTH_OPERATION] = "signin";
          attributes[SEMATTRS_AUTH_METHOD] = "email";
        } else if (path.includes("/callback/")) {
          const provider = path.split("/callback/")[1]?.split("/")[0]?.split("?")[0];
          if (provider) {
            spanName = `auth.http.oauth.callback.${provider}`;
            attributes[SEMATTRS_AUTH_OPERATION] = "oauth_callback";
            attributes[SEMATTRS_AUTH_METHOD] = "oauth";
            attributes[SEMATTRS_AUTH_PROVIDER] = provider;
          }
        } else if (path.endsWith("/forget-password")) {
          spanName = "auth.http.forgot_password";
          attributes[SEMATTRS_AUTH_OPERATION] = "forgot_password";
        } else if (path.endsWith("/reset-password")) {
          spanName = "auth.http.reset_password";
          attributes[SEMATTRS_AUTH_OPERATION] = "reset_password";
        } else if (path.endsWith("/verify-email")) {
          spanName = "auth.http.verify_email";
          attributes[SEMATTRS_AUTH_OPERATION] = "verify_email";
        } else if (path.endsWith("/sign-out")) {
          spanName = "auth.http.signout";
          attributes[SEMATTRS_AUTH_OPERATION] = "signout";
        } else if (path.endsWith("/get-session")) {
          spanName = "auth.http.get_session";
          attributes[SEMATTRS_AUTH_OPERATION] = "get_session";
        } else if (path.includes("/sign-in/") && !path.endsWith("/sign-in/email")) {
          // OAuth initiation
          const pathParts = path.split("/sign-in/");
          const provider = pathParts[1]?.split("/")[0]?.split("?")[0];
          if (provider && provider !== "email") {
            spanName = `auth.http.oauth.initiate.${provider}`;
            attributes[SEMATTRS_AUTH_OPERATION] = "oauth_initiate";
            attributes[SEMATTRS_AUTH_METHOD] = "oauth";
            attributes[SEMATTRS_AUTH_PROVIDER] = provider;
          }
        }

        if (spanName) {
          const span = tracer.startSpan(spanName, {
            kind: SpanKind.SERVER,
            attributes,
          });

          const spanKey = `${request.method}:${request.url}`;
          requestSpans.set(spanKey, span);

          context.with(trace.setSpan(context.active(), span), () => {});
        }
      } catch (error) {
        console.error("[otel-better-auth] onRequest error:", error);
      }
    },

    onResponse: async (response, ctx) => {
      try {
        const url = response.url;
        if (!url) return;

        let spanKey = `POST:${url}`;
        let span = requestSpans.get(spanKey);

        if (!span) {
          spanKey = `GET:${url}`;
          span = requestSpans.get(spanKey);
        }

        if (span) {
          const success = response.status >= 200 && response.status < 400;
          span.setAttribute(SEMATTRS_AUTH_SUCCESS, success);

          // Note: User/session data is extracted in the after hook via ctx.context.newSession
          // This ensures we capture data even for redirect responses (OAuth callbacks)

          if (success) {
            span.setStatus({ code: SpanStatusCode.OK });
          } else {
            span.setStatus({ code: SpanStatusCode.ERROR });
            span.setAttribute(SEMATTRS_AUTH_ERROR, `HTTP ${response.status}`);
          }

          span.end();
          requestSpans.delete(spanKey);
        }
      } catch (error) {
        console.error("[otel-better-auth] onResponse error:", error);
      }
    },
  };
}

// Re-export for convenience
export { instrumentBetterAuth as default, otelPlugin as plugin };
