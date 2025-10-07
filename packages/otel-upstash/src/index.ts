import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import type { Client, PublishRequest, PublishResponse } from "@upstash/qstash";

const DEFAULT_TRACER_NAME = "@kubiks/otel-upstash";
const INSTRUMENTED_FLAG = Symbol("kubiksOtelUpstashInstrumented");

// Semantic attribute constants
export const SEMATTRS_MESSAGING_SYSTEM = "messaging.system" as const;
export const SEMATTRS_MESSAGING_OPERATION = "messaging.operation" as const;
export const SEMATTRS_QSTASH_RESOURCE = "qstash.resource" as const;
export const SEMATTRS_QSTASH_TARGET = "qstash.target" as const;
export const SEMATTRS_QSTASH_MESSAGE_ID = "qstash.message_id" as const;
export const SEMATTRS_QSTASH_URL = "qstash.url" as const;
export const SEMATTRS_QSTASH_METHOD = "qstash.method" as const;
export const SEMATTRS_QSTASH_DELAY = "qstash.delay" as const;
export const SEMATTRS_QSTASH_NOT_BEFORE = "qstash.not_before" as const;
export const SEMATTRS_QSTASH_DEDUPLICATION_ID = "qstash.deduplication_id" as const;
export const SEMATTRS_QSTASH_RETRIES = "qstash.retries" as const;
export const SEMATTRS_QSTASH_CALLBACK_URL = "qstash.callback_url" as const;
export const SEMATTRS_QSTASH_FAILURE_CALLBACK_URL = "qstash.failure_callback_url" as const;

interface InstrumentedClient extends Client {
  [INSTRUMENTED_FLAG]?: true;
}

function annotatePublishSpan(span: Span, request: PublishRequest<string>): void {
  // Set base attributes
  span.setAttributes({
    [SEMATTRS_MESSAGING_SYSTEM]: "qstash",
    [SEMATTRS_MESSAGING_OPERATION]: "publish",
    [SEMATTRS_QSTASH_RESOURCE]: "messages",
    [SEMATTRS_QSTASH_TARGET]: "messages.publish",
  });

  // Set URL
  if (request.url) {
    span.setAttribute(SEMATTRS_QSTASH_URL, request.url);
  }

  // Set HTTP method (default is POST)
  const method = request.method || "POST";
  span.setAttribute(SEMATTRS_QSTASH_METHOD, method);

  // Set delay if present
  if (typeof request.delay !== "undefined") {
    if (typeof request.delay === "number") {
      span.setAttribute(SEMATTRS_QSTASH_DELAY, request.delay);
    } else if (typeof request.delay === "string") {
      span.setAttribute(SEMATTRS_QSTASH_DELAY, request.delay);
    }
  }

  // Set notBefore if present
  if (typeof request.notBefore !== "undefined") {
    span.setAttribute(SEMATTRS_QSTASH_NOT_BEFORE, request.notBefore);
  }

  // Set deduplication ID if present
  if (request.deduplicationId) {
    span.setAttribute(SEMATTRS_QSTASH_DEDUPLICATION_ID, request.deduplicationId);
  }

  // Set retries if present
  if (typeof request.retries !== "undefined") {
    span.setAttribute(SEMATTRS_QSTASH_RETRIES, request.retries);
  }

  // Set callback URL if present
  if (request.callback) {
    span.setAttribute(SEMATTRS_QSTASH_CALLBACK_URL, request.callback);
  }

  // Set failure callback URL if present
  if (request.failureCallback) {
    span.setAttribute(SEMATTRS_QSTASH_FAILURE_CALLBACK_URL, request.failureCallback);
  }
}

function annotatePublishResponse(
  span: Span,
  response: { messageId?: string },
): void {
  if (response && typeof response === "object" && "messageId" in response && response.messageId) {
    span.setAttribute(SEMATTRS_QSTASH_MESSAGE_ID, response.messageId);
  }
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

export function instrumentUpstash(client: Client): Client {
  // Check if already instrumented
  if ((client as InstrumentedClient)[INSTRUMENTED_FLAG]) {
    return client;
  }

  const tracer = trace.getTracer(DEFAULT_TRACER_NAME);

  // Instrument publishJSON method
  const originalPublishJSON = client.publishJSON.bind(client);

  const instrumentedPublishJSON = async function instrumentedPublishJSON<TBody = unknown, TRequest extends PublishRequest<TBody> = PublishRequest<TBody>>(
    request: TRequest,
  ): Promise<PublishResponse<TRequest>> {
    const span = tracer.startSpan("qstash.messages.publish", {
      kind: SpanKind.CLIENT,
    });

    // Annotate span with request details
    annotatePublishSpan(span, request as PublishRequest<string>);

    // Set the span as active
    const activeContext = trace.setSpan(context.active(), span);

    try {
      // Call the original method within the active context
      const response = await context.with(activeContext, () =>
        originalPublishJSON(request),
      );

      // Annotate with response data
      annotatePublishResponse(span, response);

      // Mark as successful
      finalizeSpan(span);

      return response;
    } catch (error) {
      // Mark as failed
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Replace the method with our instrumented version
  client.publishJSON = instrumentedPublishJSON;

  // Mark as instrumented
  (client as InstrumentedClient)[INSTRUMENTED_FLAG] = true;

  return client;
}