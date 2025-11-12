import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import type { Polar } from "@polar-sh/sdk";

const DEFAULT_TRACER_NAME = "@kubiks/otel-polar";
const INSTRUMENTED_FLAG = Symbol("kubiksOtelPolarInstrumented");

// Semantic attribute constants following OpenTelemetry conventions
export const SEMATTRS_POLAR_OPERATION = "polar.operation" as const;
export const SEMATTRS_POLAR_RESOURCE = "polar.resource" as const;
export const SEMATTRS_POLAR_RESOURCE_ID = "polar.resource_id" as const;
export const SEMATTRS_POLAR_ORGANIZATION_ID = "polar.organization_id" as const;
export const SEMATTRS_POLAR_CUSTOMER_ID = "polar.customer_id" as const;
export const SEMATTRS_POLAR_PRODUCT_ID = "polar.product_id" as const;
export const SEMATTRS_POLAR_SUBSCRIPTION_ID = "polar.subscription_id" as const;
export const SEMATTRS_POLAR_CHECKOUT_ID = "polar.checkout_id" as const;
export const SEMATTRS_POLAR_ORDER_ID = "polar.order_id" as const;
export const SEMATTRS_POLAR_BENEFIT_ID = "polar.benefit_id" as const;
export const SEMATTRS_POLAR_LICENSE_KEY_ID = "polar.license_key_id" as const;
export const SEMATTRS_POLAR_FILE_ID = "polar.file_id" as const;
export const SEMATTRS_POLAR_EVENT_ID = "polar.event_id" as const;
export const SEMATTRS_POLAR_DISCOUNT_ID = "polar.discount_id" as const;
export const SEMATTRS_POLAR_WEBHOOK_EVENT_TYPE = "polar.webhook.event_type" as const;
export const SEMATTRS_POLAR_WEBHOOK_VALID = "polar.webhook.valid" as const;
export const SEMATTRS_POLAR_HTTP_METHOD = "http.method" as const;
export const SEMATTRS_POLAR_HTTP_STATUS_CODE = "http.status_code" as const;

/**
 * Configuration options for Polar instrumentation.
 */
export interface InstrumentPolarConfig {
  /**
   * Custom tracer name. Defaults to "@kubiks/otel-polar".
   */
  tracerName?: string;

  /**
   * Whether to capture resource IDs in spans.
   * @default true
   */
  captureResourceIds?: boolean;

  /**
   * Whether to capture organization IDs in spans.
   * @default true
   */
  captureOrganizationIds?: boolean;

  /**
   * Whether to instrument customer portal operations.
   * @default true
   */
  instrumentCustomerPortal?: boolean;
}

interface InstrumentedPolar extends Polar {
  [INSTRUMENTED_FLAG]?: true;
}

interface InstrumentedResource {
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
 * Generic wrapper to instrument async methods.
 */
function wrapAsyncMethod(
  originalMethod: any,
  operationName: string,
  resourceName: string,
  tracer: ReturnType<typeof trace.getTracer>,
  config?: InstrumentPolarConfig
): any {
  return async function instrumentedMethod(...args: any[]): Promise<any> {
    const span = tracer.startSpan(`polar.${resourceName}.${operationName}`, {
      kind: SpanKind.CLIENT,
    });

    span.setAttributes({
      [SEMATTRS_POLAR_OPERATION]: `${resourceName}.${operationName}`,
      [SEMATTRS_POLAR_RESOURCE]: resourceName,
    });

    // Extract and set resource IDs from arguments if available
    if (config?.captureResourceIds !== false && args.length > 0) {
      const firstArg = args[0];
      if (typeof firstArg === "string") {
        span.setAttribute(SEMATTRS_POLAR_RESOURCE_ID, firstArg);
      } else if (firstArg && typeof firstArg === "object") {
        // Try to extract common ID fields
        if (firstArg.id) {
          span.setAttribute(SEMATTRS_POLAR_RESOURCE_ID, firstArg.id);
        }
        if (firstArg.organizationId) {
          span.setAttribute(SEMATTRS_POLAR_ORGANIZATION_ID, firstArg.organizationId);
        }
        if (firstArg.customerId) {
          span.setAttribute(SEMATTRS_POLAR_CUSTOMER_ID, firstArg.customerId);
        }
        if (firstArg.productId) {
          span.setAttribute(SEMATTRS_POLAR_PRODUCT_ID, firstArg.productId);
        }
        if (firstArg.subscriptionId) {
          span.setAttribute(SEMATTRS_POLAR_SUBSCRIPTION_ID, firstArg.subscriptionId);
        }
        if (firstArg.checkoutId) {
          span.setAttribute(SEMATTRS_POLAR_CHECKOUT_ID, firstArg.checkoutId);
        }
      }
    }

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalMethod.apply(this, args)
      );

      // Try to extract ID from response
      if (config?.captureResourceIds !== false && result?.data?.id) {
        span.setAttribute(SEMATTRS_POLAR_RESOURCE_ID, result.data.id);
      }

      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };
}

/**
 * Instruments a resource object (like benefits, customers, etc.) with all its methods.
 */
function instrumentResource(
  resource: any,
  resourceName: string,
  tracer: ReturnType<typeof trace.getTracer>,
  config?: InstrumentPolarConfig
): any {
  if (!resource || (resource as InstrumentedResource)[INSTRUMENTED_FLAG]) {
    return resource;
  }

  // Common CRUD operations to instrument
  const operationsToInstrument = [
    "list",
    "create",
    "get",
    "update",
    "delete",
    "search",
    "export",
    "validate",
    "activate",
    "deactivate",
    "claim",
    "release",
    "ingest",
    "upload",
    "download",
    "authorize",
    "token",
    "revoke",
    "introspect",
    "getLimits",
    "getActivation",
  ];

  for (const operation of operationsToInstrument) {
    if (typeof resource[operation] === "function") {
      const originalMethod = resource[operation].bind(resource);
      resource[operation] = wrapAsyncMethod(
        originalMethod,
        operation,
        resourceName,
        tracer,
        config
      );
    }
  }

  // Mark as instrumented
  (resource as InstrumentedResource)[INSTRUMENTED_FLAG] = true;

  return resource;
}

/**
 * Instruments the Polar SDK client with OpenTelemetry tracing.
 *
 * This function wraps all SDK methods to create spans for each operation.
 * The instrumentation is idempotent - calling it multiple times on the same
 * client will only instrument it once.
 *
 * @param client - The Polar SDK client to instrument
 * @param config - Optional configuration for instrumentation behavior
 * @returns The instrumented client (same instance, modified in place)
 *
 * @example
 * ```typescript
 * import { Polar } from '@polar-sh/sdk';
 * import { instrumentPolar } from '@kubiks/otel-polar';
 *
 * const polar = new Polar({
 *   accessToken: process.env.POLAR_ACCESS_TOKEN,
 * });
 *
 * instrumentPolar(polar, {
 *   captureResourceIds: true,
 *   captureOrganizationIds: true,
 * });
 *
 * // All operations are now traced
 * await polar.benefits.list({ organizationId: 'org_123' });
 * ```
 */
export function instrumentPolar(
  client: Polar,
  config?: InstrumentPolarConfig
): Polar {
  if (!client) {
    return client;
  }

  // Check if already instrumented
  if ((client as InstrumentedPolar)[INSTRUMENTED_FLAG]) {
    return client;
  }

  const { tracerName = DEFAULT_TRACER_NAME, instrumentCustomerPortal = true } =
    config ?? {};

  const tracer = trace.getTracer(tracerName);

  // Instrument all main resources
  const mainResources = [
    { name: "benefitGrants", prop: "benefitGrants" },
    { name: "benefits", prop: "benefits" },
    { name: "checkoutLinks", prop: "checkoutLinks" },
    { name: "checkouts", prop: "checkouts" },
    { name: "customerMeters", prop: "customerMeters" },
    { name: "customers", prop: "customers" },
    { name: "customerSeats", prop: "customerSeats" },
    { name: "customerSessions", prop: "customerSessions" },
    { name: "customFields", prop: "customFields" },
    { name: "discounts", prop: "discounts" },
    { name: "events", prop: "events" },
    { name: "files", prop: "files" },
    { name: "licenseKeys", prop: "licenseKeys" },
    { name: "organizations", prop: "organizations" },
    { name: "orders", prop: "orders" },
    { name: "products", prop: "products" },
    { name: "subscriptions", prop: "subscriptions" },
    { name: "wallets", prop: "wallets" },
    { name: "metrics", prop: "metrics" },
    { name: "oauth2", prop: "oauth2" },
  ];

  for (const { name, prop } of mainResources) {
    if ((client as any)[prop]) {
      instrumentResource((client as any)[prop], name, tracer, config);
    }
  }

  // Instrument customer portal if enabled
  if (instrumentCustomerPortal && (client as any).customerPortal) {
    const portalResources = [
      { name: "customerPortal.benefitGrants", prop: "benefitGrants" },
      { name: "customerPortal.customerMeters", prop: "customerMeters" },
      { name: "customerPortal.customers", prop: "customers" },
      { name: "customerPortal.customerSession", prop: "customerSession" },
      { name: "customerPortal.downloadables", prop: "downloadables" },
      { name: "customerPortal.licenseKeys", prop: "licenseKeys" },
      { name: "customerPortal.orders", prop: "orders" },
      { name: "customerPortal.organizations", prop: "organizations" },
      { name: "customerPortal.seats", prop: "seats" },
      { name: "customerPortal.subscriptions", prop: "subscriptions" },
      { name: "customerPortal.wallets", prop: "wallets" },
    ];

    const customerPortal = (client as any).customerPortal;
    for (const { name, prop } of portalResources) {
      if (customerPortal[prop]) {
        instrumentResource(customerPortal[prop], name, tracer, config);
      }
    }
  }

  // Instrument webhook validation if available
  if (typeof (client as any).webhooks?.validate === "function") {
    const originalValidate = (client as any).webhooks.validate.bind(
      (client as any).webhooks
    );

    (client as any).webhooks.validate = async function instrumentedValidate(
      ...args: any[]
    ): Promise<any> {
      const span = tracer.startSpan("polar.webhooks.validate", {
        kind: SpanKind.SERVER,
      });

      span.setAttributes({
        [SEMATTRS_POLAR_OPERATION]: "webhooks.validate",
        [SEMATTRS_POLAR_RESOURCE]: "webhooks",
      });

      const activeContext = trace.setSpan(context.active(), span);

      try {
        const result = await context.with(activeContext, () =>
          originalValidate(...args)
        );

        span.setAttribute(SEMATTRS_POLAR_WEBHOOK_VALID, true);
        if (result?.type) {
          span.setAttribute(SEMATTRS_POLAR_WEBHOOK_EVENT_TYPE, result.type);
        }

        finalizeSpan(span);
        return result;
      } catch (error) {
        span.setAttribute(SEMATTRS_POLAR_WEBHOOK_VALID, false);
        finalizeSpan(span, error);
        throw error;
      }
    };
  }

  // Mark as instrumented
  (client as InstrumentedPolar)[INSTRUMENTED_FLAG] = true;

  return client;
}

/**
 * Re-export types for convenience
 */
export type { Polar } from "@polar-sh/sdk";
