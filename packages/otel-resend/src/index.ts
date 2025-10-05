import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import type { Resend, CreateEmailOptions, CreateEmailResponse } from "resend";

const DEFAULT_TRACER_NAME = "@kubiks/otel-resend";
const INSTRUMENTED_FLAG = Symbol("kubiksOtelResendInstrumented");

// Semantic attribute constants
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
}

interface InstrumentedResend extends Resend {
  [INSTRUMENTED_FLAG]?: true;
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

function annotateEmailSpan(span: Span, payload: CreateEmailOptions): void {
  // Set base attributes
  span.setAttributes({
    [SEMATTRS_MESSAGING_SYSTEM]: "resend",
    [SEMATTRS_MESSAGING_OPERATION]: "send",
    [SEMATTRS_RESEND_RESOURCE]: "emails",
    [SEMATTRS_RESEND_TARGET]: "emails.send",
  });

  // Extract and set email addresses
  const toAddresses = extractEmailAddresses(payload.to);
  if (toAddresses.length > 0) {
    span.setAttribute(SEMATTRS_RESEND_TO_ADDRESSES, toAddresses.join(", "));
  }

  const ccAddresses = extractEmailAddresses(payload.cc);
  if (ccAddresses.length > 0) {
    span.setAttribute(SEMATTRS_RESEND_CC_ADDRESSES, ccAddresses.join(", "));
  }

  const bccAddresses = extractEmailAddresses(payload.bcc);
  if (bccAddresses.length > 0) {
    span.setAttribute(SEMATTRS_RESEND_BCC_ADDRESSES, bccAddresses.join(", "));
  }

  // Count recipients
  const recipientCount = toAddresses.length + ccAddresses.length + bccAddresses.length;
  if (recipientCount > 0) {
    span.setAttribute(SEMATTRS_RESEND_RECIPIENT_COUNT, recipientCount);
  }

  // Set other email attributes
  if (payload.subject) {
    span.setAttribute(SEMATTRS_RESEND_SUBJECT, payload.subject);
  }

  if (payload.from) {
    span.setAttribute(SEMATTRS_RESEND_FROM, payload.from);
  }

  // Handle template IDs (support both formats for compatibility)
  const templateId = (payload as any).template_id || (payload as any).templateId || (payload as any).template;
  if (templateId && typeof templateId === "string") {
    span.setAttribute(SEMATTRS_RESEND_TEMPLATE_ID, templateId);
  }
}

function annotateEmailResponse(span: Span, response: CreateEmailResponse): void {
  if (response.data?.id) {
    span.setAttribute(SEMATTRS_RESEND_MESSAGE_ID, response.data.id);
    span.setAttribute(SEMATTRS_RESEND_MESSAGE_COUNT, 1);
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

export function instrumentResend(client: Resend, config?: InstrumentResendConfig): Resend {
  // Check if already instrumented
  if ((client as InstrumentedResend)[INSTRUMENTED_FLAG]) {
    return client;
  }

  const tracerName = config?.tracerName ?? DEFAULT_TRACER_NAME;
  const tracer = config?.tracer ?? trace.getTracer(tracerName);

  // Save the original send method
  const originalSend = client.emails.send.bind(client.emails);

  // Replace the send method with our instrumented version
  client.emails.send = async function instrumentedSend(
    payload: CreateEmailOptions
  ): Promise<CreateEmailResponse> {
    const span = tracer.startSpan("resend.emails.send", {
      kind: SpanKind.CLIENT,
    });

    // Annotate span with email details
    annotateEmailSpan(span, payload);

    // Set the span as active
    const activeContext = trace.setSpan(context.active(), span);

    try {
      // Call the original method within the active context
      const response = await context.with(activeContext, () => originalSend(payload));
      
      // Annotate with response data
      annotateEmailResponse(span, response);
      
      // Mark as successful
      finalizeSpan(span);
      
      return response;
    } catch (error) {
      // Mark as failed
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Also wrap the create method (it's an alias for send)
  client.emails.create = client.emails.send;

  // Mark as instrumented
  (client as InstrumentedResend)[INSTRUMENTED_FLAG] = true;

  return client;
}