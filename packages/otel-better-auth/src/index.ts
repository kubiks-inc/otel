import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import type { BetterAuthPlugin } from "better-auth/plugins";

const DEFAULT_TRACER_NAME = "@kubiks/otel-better-auth";

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
export interface OtelBetterAuthConfig {
  /**
   * Custom tracer name. Defaults to "@kubiks/otel-better-auth".
   */
  tracerName?: string;

  /**
   * Whether to capture user email in spans.
   * Defaults to false for privacy.
   */
  captureEmail?: boolean;

  /**
   * Whether to capture detailed error messages in spans.
   * Defaults to true.
   */
  captureErrors?: boolean;

  /**
   * Custom tracer instance. If not provided, will use trace.getTracer().
   */
  tracer?: Tracer;
}

/**
 * Finalizes a span with status, timing, and optional error.
 */
function finalizeSpan(span: Span, error?: unknown, success = true): void {
  span.setAttribute(SEMATTRS_AUTH_SUCCESS, success);

  if (error) {
    if (error instanceof Error) {
      span.recordException(error);
      span.setAttribute(SEMATTRS_AUTH_ERROR, error.message);
    } else {
      const errorMsg = String(error);
      span.recordException(new Error(errorMsg));
      span.setAttribute(SEMATTRS_AUTH_ERROR, errorMsg);
    }
    span.setStatus({ code: SpanStatusCode.ERROR });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

/**
 * Creates a Better Auth plugin that adds OpenTelemetry tracing to all auth operations.
 *
 * This plugin automatically instruments key authentication events including:
 * - User signup (password, OAuth, magic link, etc.)
 * - User signin (all methods)
 * - Password reset flows
 * - Email verification
 * - Session creation and management
 *
 * @param config - Optional configuration for instrumentation behavior
 * @returns A Better Auth plugin that can be added via .use()
 *
 * @example
 * ```typescript
 * import { betterAuth } from "better-auth";
 * import { otelPlugin } from "@kubiks/otel-better-auth";
 *
 * export const auth = betterAuth({
 *   database: db,
 *   // ... other config
 * }).use(otelPlugin());
 *
 * // Or with custom configuration
 * export const auth = betterAuth({
 *   database: db,
 * }).use(otelPlugin({
 *   tracerName: "my-app-auth",
 *   captureEmail: true,
 *   captureErrors: true,
 * }));
 * ```
 */
export function otelPlugin(config?: OtelBetterAuthConfig): BetterAuthPlugin {
  const {
    tracerName = DEFAULT_TRACER_NAME,
    captureEmail = false,
    captureErrors = true,
    tracer: customTracer,
  } = config ?? {};

  const tracer = customTracer ?? trace.getTracer(tracerName);

  return {
    id: "otel",
    hooks: {
      before: [
        {
          matcher: (ctx) => {
            // Match signup endpoints
            return (
              ctx.path === "/sign-up/email" ||
              ctx.path === "/sign-up" ||
              ctx.request?.url?.includes("/sign-up")
            );
          },
          handler: async (ctx) => {
            const attributes: Record<string, string | boolean> = {
              [SEMATTRS_AUTH_OPERATION]: "signup",
              [SEMATTRS_AUTH_METHOD]: "password",
            };

            if (captureEmail && (ctx.body as any)?.email) {
              attributes[SEMATTRS_USER_EMAIL] = (ctx.body as any).email;
            }

            const span = tracer.startSpan("auth.signup.email", {
              kind: SpanKind.INTERNAL,
              attributes,
            });

            const activeContext = trace.setSpan(context.active(), span);
            (ctx as any).__otelSpan = span;
            (ctx as any).__otelContext = activeContext;

            return ctx;
          },
        },
        {
          matcher: (ctx) => {
            // Match signin endpoints
            return (
              ctx.path === "/sign-in/email" ||
              ctx.path === "/sign-in" ||
              ctx.request?.url?.includes("/sign-in")
            );
          },
          handler: async (ctx) => {
            const attributes: Record<string, string | boolean> = {
              [SEMATTRS_AUTH_OPERATION]: "signin",
              [SEMATTRS_AUTH_METHOD]: "password",
            };

            if (captureEmail && (ctx.body as any)?.email) {
              attributes[SEMATTRS_USER_EMAIL] = (ctx.body as any).email;
            }

            const span = tracer.startSpan("auth.signin.email", {
              kind: SpanKind.INTERNAL,
              attributes,
            });

            const activeContext = trace.setSpan(context.active(), span);
            (ctx as any).__otelSpan = span;
            (ctx as any).__otelContext = activeContext;

            return ctx;
          },
        },
        {
          matcher: (ctx) => {
            // Match forgot password endpoints
            return (
              ctx.path === "/forget-password" ||
              ctx.request?.url?.includes("/forget-password")
            );
          },
          handler: async (ctx) => {
            const attributes: Record<string, string> = {
              [SEMATTRS_AUTH_OPERATION]: "forgot_password",
            };

            if (captureEmail && (ctx.body as any)?.email) {
              attributes[SEMATTRS_USER_EMAIL] = (ctx.body as any).email;
            }

            const span = tracer.startSpan("auth.forgot_password", {
              kind: SpanKind.INTERNAL,
              attributes,
            });

            const activeContext = trace.setSpan(context.active(), span);
            (ctx as any).__otelSpan = span;
            (ctx as any).__otelContext = activeContext;

            return ctx;
          },
        },
        {
          matcher: (ctx) => {
            // Match reset password endpoints
            return (
              ctx.path === "/reset-password" ||
              ctx.request?.url?.includes("/reset-password")
            );
          },
          handler: async (ctx) => {
            const attributes: Record<string, string> = {
              [SEMATTRS_AUTH_OPERATION]: "reset_password",
            };

            const span = tracer.startSpan("auth.reset_password", {
              kind: SpanKind.INTERNAL,
              attributes,
            });

            const activeContext = trace.setSpan(context.active(), span);
            (ctx as any).__otelSpan = span;
            (ctx as any).__otelContext = activeContext;

            return ctx;
          },
        },
        {
          matcher: (ctx) => {
            // Match signout endpoints
            return (
              ctx.path === "/sign-out" || ctx.request?.url?.includes("/sign-out")
            );
          },
          handler: async (ctx) => {
            const attributes: Record<string, string> = {
              [SEMATTRS_AUTH_OPERATION]: "signout",
            };

            const span = tracer.startSpan("auth.signout", {
              kind: SpanKind.INTERNAL,
              attributes,
            });

            const activeContext = trace.setSpan(context.active(), span);
            (ctx as any).__otelSpan = span;
            (ctx as any).__otelContext = activeContext;

            return ctx;
          },
        },
        {
          matcher: (ctx) => {
            // Match verify email endpoints
            return (
              ctx.path === "/verify-email" ||
              ctx.request?.url?.includes("/verify-email")
            );
          },
          handler: async (ctx) => {
            const attributes: Record<string, string> = {
              [SEMATTRS_AUTH_OPERATION]: "verify_email",
            };

            const span = tracer.startSpan("auth.verify_email", {
              kind: SpanKind.INTERNAL,
              attributes,
            });

            const activeContext = trace.setSpan(context.active(), span);
            (ctx as any).__otelSpan = span;
            (ctx as any).__otelContext = activeContext;

            return ctx;
          },
        },
        {
          matcher: (ctx) => {
            // Match OAuth callback endpoints
            return (
              (ctx as any).path?.includes("/callback/") ||
              ctx.request?.url?.includes("/callback/")
            );
          },
          handler: async (ctx) => {
            const url = ctx.request?.url || (ctx as any).path;
            const provider = url?.split("/callback/")[1]?.split("/")[0]?.split("?")[0];

            if (provider) {
              const attributes: Record<string, string> = {
                [SEMATTRS_AUTH_OPERATION]: "signin",
                [SEMATTRS_AUTH_METHOD]: "oauth",
                [SEMATTRS_AUTH_PROVIDER]: provider,
              };

              const span = tracer.startSpan(`auth.oauth.${provider}`, {
                kind: SpanKind.INTERNAL,
                attributes,
              });

              const activeContext = trace.setSpan(context.active(), span);
              (ctx as any).__otelSpan = span;
              (ctx as any).__otelContext = activeContext;
            }

            return ctx;
          },
        },
      ],
      after: [
        {
          matcher: () => true, // Match all requests
          handler: async (ctx) => {
            const span = (ctx as any).__otelSpan;
            if (span) {
              const ctxAny = ctx as any;
              const success =
                !ctxAny.error &&
                (!ctxAny.returned ||
                 (ctxAny.returned.status >= 200 && ctxAny.returned.status < 300));

              // Add user/session info if available
              if (ctxAny.context?.session?.userId) {
                span.setAttribute(SEMATTRS_USER_ID, ctxAny.context.session.userId);
              }
              if (ctxAny.context?.session?.sessionId) {
                span.setAttribute(SEMATTRS_SESSION_ID, ctxAny.context.session.sessionId);
              }

              finalizeSpan(span, ctxAny.error, success);
              delete (ctx as any).__otelSpan;
              delete (ctx as any).__otelContext;
            }

            return ctx;
          },
        },
      ],
    },
  };
}

// Re-export for convenience
export { otelPlugin as default };
