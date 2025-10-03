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
   * Custom tracer instance. If not provided, will use trace.getTracer().
   */
  tracer?: Tracer;
}

// Store spans per request
const requestSpans = new Map<string, Span>();

/**
 * Creates a Better Auth plugin that adds OpenTelemetry tracing to all auth operations.
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
 * }).use(otelPlugin());
 * ```
 */
export function otelPlugin(config?: OtelBetterAuthConfig): BetterAuthPlugin {
  const {
    tracerName = DEFAULT_TRACER_NAME,
    tracer: customTracer,
  } = config ?? {};

  const tracer = customTracer ?? trace.getTracer(tracerName);

  return {
    id: "otel",
    
    onRequest: async (request) => {
      try {
        const url = new URL(request.url);
        const path = url.pathname;

        let spanName: string | null = null;
        const attributes: Record<string, string> = {};

        // Determine operation type from path
        if (path.endsWith("/sign-up/email")) {
          spanName = "auth.signup.email";
          attributes[SEMATTRS_AUTH_OPERATION] = "signup";
          attributes[SEMATTRS_AUTH_METHOD] = "password";
        } else if (path.endsWith("/sign-in/email")) {
          spanName = "auth.signin.email";
          attributes[SEMATTRS_AUTH_OPERATION] = "signin";
          attributes[SEMATTRS_AUTH_METHOD] = "password";
        } else if (path.includes("/callback/")) {
          const provider = path.split("/callback/")[1]?.split("/")[0]?.split("?")[0];
          if (provider) {
            spanName = `auth.oauth.${provider}`;
            attributes[SEMATTRS_AUTH_OPERATION] = "oauth_callback";
            attributes[SEMATTRS_AUTH_METHOD] = "oauth";
            attributes[SEMATTRS_AUTH_PROVIDER] = provider;
          }
        } else if (path.endsWith("/forget-password")) {
          spanName = "auth.forgot_password";
          attributes[SEMATTRS_AUTH_OPERATION] = "forgot_password";
        } else if (path.endsWith("/reset-password")) {
          spanName = "auth.reset_password";
          attributes[SEMATTRS_AUTH_OPERATION] = "reset_password";
        } else if (path.endsWith("/verify-email")) {
          spanName = "auth.verify_email";
          attributes[SEMATTRS_AUTH_OPERATION] = "verify_email";
        } else if (path.endsWith("/sign-out")) {
          spanName = "auth.signout";
          attributes[SEMATTRS_AUTH_OPERATION] = "signout";
        } else if (path.endsWith("/get-session")) {
          spanName = "auth.get_session";
          attributes[SEMATTRS_AUTH_OPERATION] = "get_session";
        } else if (path.includes("/sign-in/") && !path.endsWith("/sign-in/email")) {
          // OAuth initiation
          const pathParts = path.split("/sign-in/");
          const provider = pathParts[1]?.split("/")[0]?.split("?")[0];
          if (provider && provider !== "email") {
            spanName = `auth.oauth.${provider}.initiate`;
            attributes[SEMATTRS_AUTH_OPERATION] = "oauth_initiate";
            attributes[SEMATTRS_AUTH_METHOD] = "oauth";
            attributes[SEMATTRS_AUTH_PROVIDER] = provider;
          }
        }

        if (spanName) {
          const span = tracer.startSpan(spanName, {
            kind: SpanKind.INTERNAL,
            attributes,
          });

          const spanKey = `${request.method}:${request.url}`;
          requestSpans.set(spanKey, span);

          context.with(trace.setSpan(context.active(), span), () => {});
        }
      } catch (error) {
        console.error("[otel-better-auth]", error);
      }
    },

    onResponse: async (response) => {
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

          // Extract userId and sessionId from response for get-session endpoint
          if (success && url.includes("/get-session")) {
            try {
              // Clone the response to avoid consuming the body
              const clonedResponse = response.clone();
              const body = await clonedResponse.json();
              
              if (body?.user?.id) {
                span.setAttribute(SEMATTRS_USER_ID, body.user.id);
              }
              if (body?.session?.id) {
                span.setAttribute(SEMATTRS_SESSION_ID, body.session.id);
              }
            } catch (parseError) {
              // Silently fail if we can't parse the response
            }
          }

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
        console.error("[otel-better-auth]", error);
      }
    },
  };
}

// Re-export for convenience
export { otelPlugin as default };
