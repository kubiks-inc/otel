import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import type { Client, PublishRequest, PublishResponse } from "@upstash/qstash";

const DEFAULT_TRACER_NAME = "@kubiks/otel-upstash-queues";
const INSTRUMENTED_FLAG = Symbol("kubiksOtelUpstashQueuesInstrumented");

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

// Receiver-specific attributes
export const SEMATTRS_QSTASH_RETRIED = "qstash.retried" as const;
export const SEMATTRS_QSTASH_SCHEDULE_ID = "qstash.schedule_id" as const;
export const SEMATTRS_QSTASH_CALLER_IP = "qstash.caller_ip" as const;
export const SEMATTRS_HTTP_STATUS_CODE = "http.status_code" as const;

// Body/payload attributes
export const SEMATTRS_QSTASH_REQUEST_BODY = "qstash.request.body" as const;
export const SEMATTRS_QSTASH_RESPONSE_BODY = "qstash.response.body" as const;

export interface InstrumentationConfig {
  /**
   * Whether to capture request/response bodies in spans.
   * @default false
   */
  captureBody?: boolean;
  
  /**
   * Maximum length of the body to capture. Bodies longer than this will be truncated.
   * @default 1024
   */
  maxBodyLength?: number;
}

interface InstrumentedClient extends Client {
  [INSTRUMENTED_FLAG]?: true;
}

function serializeBody(body: unknown, maxLength: number): string {
  try {
    const serialized = typeof body === "string" ? body : JSON.stringify(body);
    if (serialized.length > maxLength) {
      return serialized.substring(0, maxLength) + "... (truncated)";
    }
    return serialized;
  } catch (error) {
    return "[Unable to serialize body]";
  }
}

function annotatePublishSpan(span: Span, request: PublishRequest<string>, config?: InstrumentationConfig): void {
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

  // Capture request body if enabled
  if (config?.captureBody && request.body !== undefined) {
    const maxLength = config.maxBodyLength ?? 1024;
    const bodyString = serializeBody(request.body, maxLength);
    span.setAttribute(SEMATTRS_QSTASH_REQUEST_BODY, bodyString);
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

export function instrumentUpstash(client: Client, config?: InstrumentationConfig): Client {
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
    annotatePublishSpan(span, request as PublishRequest<string>, config);

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

// Type for Next.js route handlers
type RouteHandler = (request: Request) => Promise<Response> | Response;

function extractQStashHeaders(request: Request): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};

  // Extract QStash message ID
  const messageId = request.headers.get("upstash-message-id");
  if (messageId) {
    attributes[SEMATTRS_QSTASH_MESSAGE_ID] = messageId;
  }

  // Extract retry count
  const retried = request.headers.get("upstash-retried");
  if (retried) {
    const retriedNum = parseInt(retried, 10);
    if (!isNaN(retriedNum)) {
      attributes[SEMATTRS_QSTASH_RETRIED] = retriedNum;
    }
  }

  // Extract schedule ID if present
  const scheduleId = request.headers.get("upstash-schedule-id");
  if (scheduleId) {
    attributes[SEMATTRS_QSTASH_SCHEDULE_ID] = scheduleId;
  }

  // Extract caller IP
  const callerIp = request.headers.get("upstash-caller-ip");
  if (callerIp) {
    attributes[SEMATTRS_QSTASH_CALLER_IP] = callerIp;
  }

  return attributes;
}

export function instrumentConsumer(handler: RouteHandler, config?: InstrumentationConfig): RouteHandler {
  const tracer = trace.getTracer(DEFAULT_TRACER_NAME);

  return async function instrumentedConsumer(request: Request): Promise<Response> {
    const span = tracer.startSpan("qstash.messages.receive", {
      kind: SpanKind.SERVER,
    });

    // Set base attributes
    span.setAttributes({
      [SEMATTRS_MESSAGING_SYSTEM]: "qstash",
      [SEMATTRS_MESSAGING_OPERATION]: "receive",
      [SEMATTRS_QSTASH_RESOURCE]: "messages",
      [SEMATTRS_QSTASH_TARGET]: "messages.receive",
    });

    // Extract and set QStash headers
    const qstashHeaders = extractQStashHeaders(request);
    span.setAttributes(qstashHeaders);

    // Capture request body if enabled
    if (config?.captureBody) {
      try {
        const clonedRequest = request.clone();
        const body = await clonedRequest.text();
        if (body) {
          const maxLength = config.maxBodyLength ?? 1024;
          const bodyString = serializeBody(body, maxLength);
          span.setAttribute(SEMATTRS_QSTASH_REQUEST_BODY, bodyString);
        }
      } catch (error) {
        // Ignore errors when capturing request body
      }
    }

    // Set the span as active
    const activeContext = trace.setSpan(context.active(), span);

    try {
      // Call the handler within the active context
      const response = await context.with(activeContext, () => handler(request));

      // Capture response status
      span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);

      // Capture response body if enabled
      if (config?.captureBody) {
        try {
          const clonedResponse = response.clone();
          const responseBody = await clonedResponse.text();
          if (responseBody) {
            const maxLength = config.maxBodyLength ?? 1024;
            const bodyString = serializeBody(responseBody, maxLength);
            span.setAttribute(SEMATTRS_QSTASH_RESPONSE_BODY, bodyString);
          }
        } catch (error) {
          // Ignore errors when capturing response body
        }
      }

      // Mark as successful if status is 2xx
      if (response.status >= 200 && response.status < 300) {
        finalizeSpan(span);
      } else {
        finalizeSpan(span, new Error(`Handler returned status ${response.status}`));
      }

      return response;
    } catch (error) {
      // Mark as failed
      finalizeSpan(span, error);
      throw error;
    }
  };
}