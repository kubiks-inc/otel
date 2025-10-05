import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import type { CreateEmailOptions } from "resend";

const DEFAULT_TRACER_NAME = "@kubiks/otel-resend";
const INSTRUMENTED_FLAG = "__kubiksOtelResendInstrumented" as const;
const INSTRUMENTED_METHOD_FLAG = Symbol("kubiksOtelResendInstrumentedMethod");

export const SEMATTRS_MESSAGING_SYSTEM = "messaging.system" as const;
export const SEMATTRS_MESSAGING_OPERATION = "messaging.operation" as const;
export const SEMATTRS_RESEND_RESOURCE = "resend.resource" as const;
export const SEMATTRS_RESEND_TARGET = "resend.target" as const;
export const SEMATTRS_RESEND_MESSAGE_ID = "resend.message_id" as const;
export const SEMATTRS_RESEND_MESSAGE_COUNT = "resend.message_count" as const;
export const SEMATTRS_RESEND_TEMPLATE_ID = "resend.template_id" as const;
export const SEMATTRS_RESEND_SEGMENT_ID = "resend.segment_id" as const;
export const SEMATTRS_RESEND_AUDIENCE_ID = "resend.audience_id" as const;
export const SEMATTRS_RESEND_RECIPIENT_COUNT = "resend.recipient_count" as const;
export const SEMATTRS_RESEND_RESOURCE_ID = "resend.resource_id" as const;
export const SEMATTRS_RESEND_TO_ADDRESSES = "resend.to_addresses" as const;
export const SEMATTRS_RESEND_CC_ADDRESSES = "resend.cc_addresses" as const;
export const SEMATTRS_RESEND_BCC_ADDRESSES = "resend.bcc_addresses" as const;
export const SEMATTRS_RESEND_FROM = "resend.from" as const;
export const SEMATTRS_RESEND_SUBJECT = "resend.subject" as const;

export interface InstrumentResendConfig {
  tracerName?: string;
  tracer?: Tracer;
  captureRequestMetadata?: boolean;
  captureResponseMetadata?: boolean;
  shouldInstrument?(
    path: readonly string[],
    methodName: string,
    original: AnyFunction,
  ): boolean;
}

type AnyFunction = (...args: unknown[]) => unknown;
type ResendLike = Record<string, unknown>;

interface InstrumentedResendLike extends ResendLike {
  [INSTRUMENTED_FLAG]?: true;
}

interface NormalizedConfig {
  tracer: Tracer;
  tracerName: string;
  captureRequestMetadata: boolean;
  captureResponseMetadata: boolean;
  shouldInstrument(
    path: readonly string[],
    methodName: string,
    original: AnyFunction,
  ): boolean;
}

const instrumentedObjects = new WeakSet<object>();
const defaultShouldInstrument: NormalizedConfig["shouldInstrument"] = () => true;

function toSnakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s./-]+/g, "_")
    .toLowerCase();
}

function buildSpanName(path: readonly string[], methodName: string): string {
  const parts = [...path, methodName].filter(Boolean);
  return parts.length ? `resend.${parts.join(".")}` : "resend.call";
}

function buildBaseAttributes(
  path: readonly string[],
  methodName: string,
): Record<string, string> {
  const attributes: Record<string, string> = {
    [SEMATTRS_MESSAGING_SYSTEM]: "resend",
    [SEMATTRS_MESSAGING_OPERATION]: toSnakeCase(methodName),
    [SEMATTRS_RESEND_TARGET]: [...path, methodName].join("."),
  };

  if (path[0]) {
    attributes[SEMATTRS_RESEND_RESOURCE] = path[0];
  }

  return attributes;
}

function countRecipients(value: string | string[] | undefined): number {
  if (!value) {
    return 0;
  }
  if (typeof value === "string") {
    return value.trim() ? 1 : 0;
  }
  if (Array.isArray(value)) {
    return value.filter(email => typeof email === "string" && email.trim()).length;
  }
  return 0;
}

function extractEmailAddresses(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.filter(email => typeof email === "string" && email.trim()).map(email => email.trim());
  }
  return [];
}

function annotateRequest(
  span: Span,
  path: readonly string[],
  args: unknown[],
  capture: boolean,
): void {
  if (!capture || !args.length) {
    return;
  }

  const payload = args[0];
  if (!payload || typeof payload !== "object") {
    return;
  }

  // Check if this is an email send operation
  if (path[0] === "emails" || path[0] === "batch") {
    // Try to cast to CreateEmailOptions for better type safety
    const data = payload as Partial<CreateEmailOptions>;

    // Extract and set email addresses using proper types
    const toAddresses = extractEmailAddresses(data.to);
    if (toAddresses.length > 0) {
      span.setAttribute(SEMATTRS_RESEND_TO_ADDRESSES, toAddresses.join(", "));
    }

    const ccAddresses = extractEmailAddresses(data.cc);
    if (ccAddresses.length > 0) {
      span.setAttribute(SEMATTRS_RESEND_CC_ADDRESSES, ccAddresses.join(", "));
    }

    const bccAddresses = extractEmailAddresses(data.bcc);
    if (bccAddresses.length > 0) {
      span.setAttribute(SEMATTRS_RESEND_BCC_ADDRESSES, bccAddresses.join(", "));
    }

    // Count recipients
    const recipientCount = toAddresses.length + ccAddresses.length + bccAddresses.length;
    if (recipientCount > 0) {
      span.setAttribute(SEMATTRS_RESEND_RECIPIENT_COUNT, recipientCount);
    }

    // Handle other email-specific attributes
    if (data.subject) {
      span.setAttribute(SEMATTRS_RESEND_SUBJECT, data.subject);
    }

    if (data.from) {
      span.setAttribute(SEMATTRS_RESEND_FROM, data.from);
    }
  } else {
    // For non-email operations, use generic handling
    const data = payload as Record<string, unknown>;
    
    // Only count if the fields exist and are the right type
    let recipientCount = 0;
    if (typeof data.to === "string" || Array.isArray(data.to)) {
      recipientCount += countRecipients(data.to as string | string[]);
    }
    if (typeof data.cc === "string" || Array.isArray(data.cc)) {
      recipientCount += countRecipients(data.cc as string | string[]);
    }
    if (typeof data.bcc === "string" || Array.isArray(data.bcc)) {
      recipientCount += countRecipients(data.bcc as string | string[]);
    }
    if (recipientCount > 0) {
      span.setAttribute(SEMATTRS_RESEND_RECIPIENT_COUNT, recipientCount);
    }
  }

  // Handle generic attributes that apply to all operations
  const data = payload as Record<string, unknown>;
  
  const templateId =
    (typeof data.template_id === "string" && data.template_id) ||
    (typeof data.templateId === "string" && data.templateId) ||
    (typeof data.template === "string" && data.template);
  if (templateId) {
    span.setAttribute(SEMATTRS_RESEND_TEMPLATE_ID, templateId);
  }

  const segmentId =
    (typeof data.segment_id === "string" && data.segment_id) ||
    (typeof data.segmentId === "string" && data.segmentId);
  if (segmentId) {
    span.setAttribute(SEMATTRS_RESEND_SEGMENT_ID, segmentId);
  }

  const audienceId =
    (typeof data.audience_id === "string" && data.audience_id) ||
    (typeof data.audienceId === "string" && data.audienceId);
  if (audienceId) {
    span.setAttribute(SEMATTRS_RESEND_AUDIENCE_ID, audienceId);
  }
}

function collectIdentifiers(value: unknown, depth = 0): string[] {
  if (!value || depth > 3) {
    return [];
  }

  if (typeof value === "string") {
    return value ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectIdentifiers(item, depth + 1));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const ids: string[] = [];

    const directId =
      (typeof record.id === "string" && record.id) ||
      (typeof record.messageId === "string" && record.messageId) ||
      (typeof record.message_id === "string" && record.message_id);
    if (directId) {
      ids.push(directId);
    }

    const nestedKeys = ["data", "items", "messages", "results", "entries"];
    for (const key of nestedKeys) {
      if (key in record) {
        ids.push(...collectIdentifiers(record[key], depth + 1));
      }
    }

    return ids;
  }

  return [];
}

function annotateResponse(
  span: Span,
  resource: string | undefined,
  result: unknown,
  capture: boolean,
): void {
  if (!capture) {
    return;
  }

  const identifiers = collectIdentifiers(result);
  if (!identifiers.length) {
    return;
  }

  const uniqueIds = Array.from(new Set(identifiers));
  span.setAttribute(SEMATTRS_RESEND_MESSAGE_COUNT, uniqueIds.length);

  if (resource === "emails") {
    if (uniqueIds.length === 1) {
      span.setAttribute(SEMATTRS_RESEND_MESSAGE_ID, uniqueIds[0]!);
    }
  } else if (uniqueIds.length === 1) {
    span.setAttribute(SEMATTRS_RESEND_RESOURCE_ID, uniqueIds[0]!);
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

function wrapMethod(
  original: AnyFunction,
  path: readonly string[],
  methodName: string,
  tracer: Tracer,
  config: NormalizedConfig,
): AnyFunction {
  const spanName = buildSpanName(path, methodName);
  const baseAttributes = buildBaseAttributes(path, methodName);
  const resource = path[0];

  const instrumented = function instrumentedResendMethod(
    this: unknown,
    ...args: unknown[]
  ) {
    const span = tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
      attributes: baseAttributes,
    });

    annotateRequest(span, path, args, config.captureRequestMetadata);

    const activeContext = trace.setSpan(context.active(), span);

    const invokeOriginal = () => original.apply(this, args);

    try {
      const result = context.with(activeContext, invokeOriginal);

      if (result && typeof (result as Promise<unknown>).then === "function") {
        return (result as Promise<unknown>)
          .then((value) => {
            annotateResponse(span, resource, value, config.captureResponseMetadata);
            finalizeSpan(span);
            return value;
          })
          .catch((error: unknown) => {
            finalizeSpan(span, error);
            throw error;
          });
      }

      annotateResponse(span, resource, result, config.captureResponseMetadata);
      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  (instrumented as { [INSTRUMENTED_METHOD_FLAG]?: true })[INSTRUMENTED_METHOD_FLAG] = true;
  return instrumented;
}

function instrumentObject(
  target: ResendLike,
  path: readonly string[],
  tracer: Tracer,
  config: NormalizedConfig,
): void {
  if (!target || typeof target !== "object") {
    return;
  }

  if (instrumentedObjects.has(target)) {
    return;
  }
  instrumentedObjects.add(target);

  const processedKeys = new Set<string>();

  for (const key of Reflect.ownKeys(target)) {
    if (typeof key === "symbol") {
      continue;
    }
    if (key === INSTRUMENTED_FLAG) {
      continue;
    }

    processedKeys.add(key);

    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    let value: unknown;

    if (!descriptor || "value" in descriptor) {
      value = (target as ResendLike)[key];
    }

    if (typeof value === "function") {
      const original = value as AnyFunction;

      if ((original as { [INSTRUMENTED_METHOD_FLAG]?: true })[INSTRUMENTED_METHOD_FLAG]) {
        continue;
      }

      if (!config.shouldInstrument(path, key, original)) {
        continue;
      }

      const wrapped = wrapMethod(original, path, key, tracer, config);

      let replaced = false;
      try {
        replaced = Reflect.set(target, key, wrapped);
      } catch {
        replaced = false;
      }

      if (!replaced) {
        Object.defineProperty(target, key, {
          configurable: descriptor?.configurable ?? true,
          enumerable: descriptor?.enumerable ?? true,
          writable: descriptor?.writable ?? true,
          value: wrapped,
        });
      }

      continue;
    }

    if (value && typeof value === "object") {
      instrumentObject(value as ResendLike, [...path, key], tracer, config);
      continue;
    }

    if (descriptor && (descriptor.get || descriptor.set)) {
      try {
        const resolved = (target as ResendLike)[key];
        if (resolved && typeof resolved === "object") {
          instrumentObject(resolved as ResendLike, [...path, key], tracer, config);
        }
      } catch {
        // Ignore accessor errors.
      }
    }
  }

  let prototype = Object.getPrototypeOf(target);
  while (
    prototype &&
    prototype !== Object.prototype &&
    prototype !== Function.prototype
  ) {
    for (const key of Reflect.ownKeys(prototype)) {
      if (typeof key === "symbol" || key === "constructor") {
        continue;
      }
      if (processedKeys.has(key)) {
        continue;
      }

      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      if (!descriptor || typeof descriptor.value !== "function") {
        continue;
      }

      const original = descriptor.value as AnyFunction;
      if ((original as { [INSTRUMENTED_METHOD_FLAG]?: true })[INSTRUMENTED_METHOD_FLAG]) {
        continue;
      }

      if (!config.shouldInstrument(path, key, original)) {
        continue;
      }

      const wrapped = wrapMethod(original, path, key, tracer, config);

      let replaced = false;
      try {
        replaced = Reflect.set(target, key, wrapped);
      } catch {
        replaced = false;
      }

      if (!replaced) {
        Object.defineProperty(target, key, {
          configurable: true,
          enumerable: descriptor.enumerable ?? true,
          writable: true,
          value: wrapped,
        });
      }

      processedKeys.add(key);
    }

    prototype = Object.getPrototypeOf(prototype);
  }
}

export function instrumentResend<TClient extends ResendLike>(
  client: TClient,
  config?: InstrumentResendConfig,
): TClient {
  if (!client || typeof client !== "object") {
    return client;
  }

  if ((client as InstrumentedResendLike)[INSTRUMENTED_FLAG]) {
    return client;
  }

  const tracerName = config?.tracerName ?? DEFAULT_TRACER_NAME;
  const tracer = config?.tracer ?? trace.getTracer(tracerName);

  const normalizedConfig: NormalizedConfig = {
    tracer,
    tracerName,
    captureRequestMetadata: config?.captureRequestMetadata ?? true,
    captureResponseMetadata: config?.captureResponseMetadata ?? true,
    shouldInstrument: config?.shouldInstrument ?? defaultShouldInstrument,
  };

  instrumentObject(client, [], tracer, normalizedConfig);

  (client as InstrumentedResendLike)[INSTRUMENTED_FLAG] = true;

  return client;
}
