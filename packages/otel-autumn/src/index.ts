import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import type { Autumn } from "autumn-js";

const DEFAULT_TRACER_NAME = "@kubiks/otel-autumn";
const INSTRUMENTED_FLAG = Symbol("kubiksOtelAutumnInstrumented");

// Semantic attribute constants
export const SEMATTRS_BILLING_SYSTEM = "billing.system" as const;
export const SEMATTRS_BILLING_OPERATION = "billing.operation" as const;
export const SEMATTRS_AUTUMN_RESOURCE = "autumn.resource" as const;
export const SEMATTRS_AUTUMN_TARGET = "autumn.target" as const;

// Customer attributes
export const SEMATTRS_AUTUMN_CUSTOMER_ID = "autumn.customer_id" as const;
export const SEMATTRS_AUTUMN_ENTITY_ID = "autumn.entity_id" as const;

// Product attributes
export const SEMATTRS_AUTUMN_PRODUCT_ID = "autumn.product_id" as const;
export const SEMATTRS_AUTUMN_PRODUCT_IDS = "autumn.product_ids" as const;
export const SEMATTRS_AUTUMN_PRODUCT_NAME = "autumn.product_name" as const;
export const SEMATTRS_AUTUMN_PRODUCT_SCENARIO = "autumn.product_scenario" as const;

// Feature attributes
export const SEMATTRS_AUTUMN_FEATURE_ID = "autumn.feature_id" as const;
export const SEMATTRS_AUTUMN_FEATURE_NAME = "autumn.feature_name" as const;
export const SEMATTRS_AUTUMN_ALLOWED = "autumn.allowed" as const;
export const SEMATTRS_AUTUMN_BALANCE = "autumn.balance" as const;
export const SEMATTRS_AUTUMN_USAGE = "autumn.usage" as const;
export const SEMATTRS_AUTUMN_INCLUDED_USAGE = "autumn.included_usage" as const;
export const SEMATTRS_AUTUMN_UNLIMITED = "autumn.unlimited" as const;
export const SEMATTRS_AUTUMN_REQUIRED_BALANCE = "autumn.required_balance" as const;

// Checkout attributes
export const SEMATTRS_AUTUMN_CHECKOUT_URL = "autumn.checkout_url" as const;
export const SEMATTRS_AUTUMN_HAS_PRORATIONS = "autumn.has_prorations" as const;
export const SEMATTRS_AUTUMN_TOTAL_AMOUNT = "autumn.total_amount" as const;
export const SEMATTRS_AUTUMN_CURRENCY = "autumn.currency" as const;
export const SEMATTRS_AUTUMN_FORCE_CHECKOUT = "autumn.force_checkout" as const;
export const SEMATTRS_AUTUMN_INVOICE = "autumn.invoice" as const;

// Track attributes
export const SEMATTRS_AUTUMN_EVENT_NAME = "autumn.event_name" as const;
export const SEMATTRS_AUTUMN_VALUE = "autumn.value" as const;
export const SEMATTRS_AUTUMN_EVENT_ID = "autumn.event_id" as const;
export const SEMATTRS_AUTUMN_IDEMPOTENCY_KEY = "autumn.idempotency_key" as const;

// Attach/Cancel attributes
export const SEMATTRS_AUTUMN_SUCCESS = "autumn.success" as const;

export interface InstrumentationConfig {
  /**
   * Whether to capture customer data in spans.
   * @default false
   */
  captureCustomerData?: boolean;

  /**
   * Whether to capture product options/configuration in spans.
   * @default false
   */
  captureOptions?: boolean;
}

interface InstrumentedAutumn extends Autumn {
  [INSTRUMENTED_FLAG]?: true;
}

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

function annotateCheckSpan(
  span: Span,
  params: {
    customer_id: string;
    feature_id?: string;
    product_id?: string;
    entity_id?: string;
    required_balance?: number;
  },
): void {
  span.setAttributes({
    [SEMATTRS_BILLING_SYSTEM]: "autumn",
    [SEMATTRS_BILLING_OPERATION]: "check",
    [SEMATTRS_AUTUMN_RESOURCE]: params.feature_id ? "features" : "products",
    [SEMATTRS_AUTUMN_TARGET]: params.feature_id
      ? "features.check"
      : "products.check",
  });

  span.setAttribute(SEMATTRS_AUTUMN_CUSTOMER_ID, params.customer_id);

  if (params.feature_id) {
    span.setAttribute(SEMATTRS_AUTUMN_FEATURE_ID, params.feature_id);
  }

  if (params.product_id) {
    span.setAttribute(SEMATTRS_AUTUMN_PRODUCT_ID, params.product_id);
  }

  if (params.entity_id) {
    span.setAttribute(SEMATTRS_AUTUMN_ENTITY_ID, params.entity_id);
  }

  if (typeof params.required_balance === "number") {
    span.setAttribute(SEMATTRS_AUTUMN_REQUIRED_BALANCE, params.required_balance);
  }
}

function annotateCheckResponse(span: Span, response: Record<string, unknown>): void {
  if (typeof response.allowed === "boolean") {
    span.setAttribute(SEMATTRS_AUTUMN_ALLOWED, response.allowed);
  }

  if (typeof response.balance === "number") {
    span.setAttribute(SEMATTRS_AUTUMN_BALANCE, response.balance);
  }

  if (typeof response.usage === "number") {
    span.setAttribute(SEMATTRS_AUTUMN_USAGE, response.usage);
  }

  if (typeof response.included_usage === "number") {
    span.setAttribute(SEMATTRS_AUTUMN_INCLUDED_USAGE, response.included_usage);
  }

  if (typeof response.unlimited === "boolean") {
    span.setAttribute(SEMATTRS_AUTUMN_UNLIMITED, response.unlimited);
  }

  if (typeof response.status === "string") {
    span.setAttribute(SEMATTRS_AUTUMN_PRODUCT_SCENARIO, response.status);
  }
}

function annotateTrackSpan(
  span: Span,
  params: {
    customer_id: string;
    feature_id?: string;
    event_name?: string;
    value?: number;
    entity_id?: string;
    idempotency_key?: string;
  },
): void {
  span.setAttributes({
    [SEMATTRS_BILLING_SYSTEM]: "autumn",
    [SEMATTRS_BILLING_OPERATION]: "track",
    [SEMATTRS_AUTUMN_RESOURCE]: "events",
    [SEMATTRS_AUTUMN_TARGET]: "events.track",
  });

  span.setAttribute(SEMATTRS_AUTUMN_CUSTOMER_ID, params.customer_id);

  if (params.feature_id) {
    span.setAttribute(SEMATTRS_AUTUMN_FEATURE_ID, params.feature_id);
  }

  if (params.event_name) {
    span.setAttribute(SEMATTRS_AUTUMN_EVENT_NAME, params.event_name);
  }

  if (typeof params.value === "number") {
    span.setAttribute(SEMATTRS_AUTUMN_VALUE, params.value);
  }

  if (params.entity_id) {
    span.setAttribute(SEMATTRS_AUTUMN_ENTITY_ID, params.entity_id);
  }

  if (params.idempotency_key) {
    span.setAttribute(SEMATTRS_AUTUMN_IDEMPOTENCY_KEY, params.idempotency_key);
  }
}

function annotateTrackResponse(span: Span, response: { id?: string }): void {
  if (response.id) {
    span.setAttribute(SEMATTRS_AUTUMN_EVENT_ID, response.id);
  }
}

function annotateCheckoutSpan(
  span: Span,
  params: {
    customer_id: string;
    product_id?: string;
    product_ids?: string[];
    entity_id?: string;
    force_checkout?: boolean;
    invoice?: boolean;
  },
  config?: InstrumentationConfig,
): void {
  span.setAttributes({
    [SEMATTRS_BILLING_SYSTEM]: "autumn",
    [SEMATTRS_BILLING_OPERATION]: "checkout",
    [SEMATTRS_AUTUMN_RESOURCE]: "checkout",
    [SEMATTRS_AUTUMN_TARGET]: "checkout.create",
  });

  span.setAttribute(SEMATTRS_AUTUMN_CUSTOMER_ID, params.customer_id);

  if (params.product_id) {
    span.setAttribute(SEMATTRS_AUTUMN_PRODUCT_ID, params.product_id);
  }

  if (params.product_ids && params.product_ids.length > 0) {
    span.setAttribute(SEMATTRS_AUTUMN_PRODUCT_IDS, params.product_ids.join(", "));
  }

  if (params.entity_id) {
    span.setAttribute(SEMATTRS_AUTUMN_ENTITY_ID, params.entity_id);
  }

  if (typeof params.force_checkout === "boolean") {
    span.setAttribute(SEMATTRS_AUTUMN_FORCE_CHECKOUT, params.force_checkout);
  }

  if (typeof params.invoice === "boolean") {
    span.setAttribute(SEMATTRS_AUTUMN_INVOICE, params.invoice);
  }
}

function annotateCheckoutResponse(
  span: Span,
  response: {
    url?: string;
    has_prorations?: boolean;
    total?: number;
    currency?: string;
  },
): void {
  if (response.url) {
    span.setAttribute(SEMATTRS_AUTUMN_CHECKOUT_URL, response.url);
  }

  if (typeof response.has_prorations === "boolean") {
    span.setAttribute(SEMATTRS_AUTUMN_HAS_PRORATIONS, response.has_prorations);
  }

  if (typeof response.total === "number") {
    span.setAttribute(SEMATTRS_AUTUMN_TOTAL_AMOUNT, response.total);
  }

  if (response.currency) {
    span.setAttribute(SEMATTRS_AUTUMN_CURRENCY, response.currency);
  }
}

function annotateAttachSpan(
  span: Span,
  params: {
    customer_id: string;
    product_id: string;
    entity_id?: string;
  },
): void {
  span.setAttributes({
    [SEMATTRS_BILLING_SYSTEM]: "autumn",
    [SEMATTRS_BILLING_OPERATION]: "attach",
    [SEMATTRS_AUTUMN_RESOURCE]: "products",
    [SEMATTRS_AUTUMN_TARGET]: "products.attach",
  });

  span.setAttribute(SEMATTRS_AUTUMN_CUSTOMER_ID, params.customer_id);
  span.setAttribute(SEMATTRS_AUTUMN_PRODUCT_ID, params.product_id);

  if (params.entity_id) {
    span.setAttribute(SEMATTRS_AUTUMN_ENTITY_ID, params.entity_id);
  }
}

function annotateAttachResponse(
  span: Span,
  response: {
    success?: boolean;
    checkout_url?: string;
  },
): void {
  if (typeof response.success === "boolean") {
    span.setAttribute(SEMATTRS_AUTUMN_SUCCESS, response.success);
  }

  if (response.checkout_url) {
    span.setAttribute(SEMATTRS_AUTUMN_CHECKOUT_URL, response.checkout_url);
  }
}

function annotateCancelSpan(
  span: Span,
  params: {
    customer_id: string;
    product_id: string;
  },
): void {
  span.setAttributes({
    [SEMATTRS_BILLING_SYSTEM]: "autumn",
    [SEMATTRS_BILLING_OPERATION]: "cancel",
    [SEMATTRS_AUTUMN_RESOURCE]: "products",
    [SEMATTRS_AUTUMN_TARGET]: "products.cancel",
  });

  span.setAttribute(SEMATTRS_AUTUMN_CUSTOMER_ID, params.customer_id);
  span.setAttribute(SEMATTRS_AUTUMN_PRODUCT_ID, params.product_id);
}

function annotateCancelResponse(span: Span, response: { success?: boolean }): void {
  if (typeof response.success === "boolean") {
    span.setAttribute(SEMATTRS_AUTUMN_SUCCESS, response.success);
  }
}

export function instrumentAutumn(
  client: Autumn,
  config?: InstrumentationConfig,
): Autumn {
  // Check if already instrumented
  if ((client as InstrumentedAutumn)[INSTRUMENTED_FLAG]) {
    return client;
  }

  const tracer = trace.getTracer(DEFAULT_TRACER_NAME);

  // Instrument check method
  const originalCheck = client.check.bind(client);
  const instrumentedCheck = async function instrumentedCheck(
    params: Parameters<typeof originalCheck>[0],
  ): Promise<ReturnType<typeof originalCheck>> {
    const span = tracer.startSpan("autumn.check", {
      kind: SpanKind.CLIENT,
    });

    annotateCheckSpan(span, params as {
      customer_id: string;
      feature_id?: string;
      product_id?: string;
      entity_id?: string;
      required_balance?: number;
    });

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalCheck(params),
      );

      if (result.data) {
        annotateCheckResponse(span, result.data as Record<string, unknown>);
      }

      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument track method
  const originalTrack = client.track.bind(client);
  const instrumentedTrack = async function instrumentedTrack(
    params: Parameters<typeof originalTrack>[0],
  ): Promise<ReturnType<typeof originalTrack>> {
    const span = tracer.startSpan("autumn.track", {
      kind: SpanKind.CLIENT,
    });

    annotateTrackSpan(span, params as {
      customer_id: string;
      feature_id?: string;
      event_name?: string;
      value?: number;
      entity_id?: string;
      idempotency_key?: string;
    });

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalTrack(params),
      );

      if (result.data) {
        annotateTrackResponse(span, result.data);
      }

      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument checkout method
  const originalCheckout = client.checkout.bind(client);
  const instrumentedCheckout = async function instrumentedCheckout(
    params: Parameters<typeof originalCheckout>[0],
  ): Promise<ReturnType<typeof originalCheckout>> {
    const span = tracer.startSpan("autumn.checkout", {
      kind: SpanKind.CLIENT,
    });

    annotateCheckoutSpan(span, params as {
      customer_id: string;
      product_id?: string;
      product_ids?: string[];
      entity_id?: string;
      force_checkout?: boolean;
      invoice?: boolean;
    }, config);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalCheckout(params),
      );

      if (result.data) {
        annotateCheckoutResponse(span, result.data);
      }

      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument attach method
  const originalAttach = client.attach.bind(client);
  const instrumentedAttach = async function instrumentedAttach(
    params: Parameters<typeof originalAttach>[0],
  ): Promise<ReturnType<typeof originalAttach>> {
    const span = tracer.startSpan("autumn.attach", {
      kind: SpanKind.CLIENT,
    });

    annotateAttachSpan(span, params as {
      customer_id: string;
      product_id: string;
      entity_id?: string;
    });

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalAttach(params),
      );

      if (result.data) {
        annotateAttachResponse(span, result.data);
      }

      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument cancel method
  const originalCancel = client.cancel.bind(client);
  const instrumentedCancel = async function instrumentedCancel(
    params: Parameters<typeof originalCancel>[0],
  ): Promise<ReturnType<typeof originalCancel>> {
    const span = tracer.startSpan("autumn.cancel", {
      kind: SpanKind.CLIENT,
    });

    annotateCancelSpan(span, params as {
      customer_id: string;
      product_id: string;
    });

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalCancel(params),
      );

      if (result.data) {
        annotateCancelResponse(span, result.data);
      }

      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Replace methods with instrumented versions
  client.check = instrumentedCheck;
  client.track = instrumentedTrack;
  client.checkout = instrumentedCheckout;
  client.attach = instrumentedAttach;
  client.cancel = instrumentedCancel;

  // Mark as instrumented
  (client as InstrumentedAutumn)[INSTRUMENTED_FLAG] = true;

  return client;
}
