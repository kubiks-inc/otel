import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";

const DEFAULT_TRACER_NAME = "@kubiks/otel-inbound";
const INSTRUMENTED_FLAG = Symbol("kubiksOtelInboundInstrumented");

// Semantic attribute constants - Base
export const SEMATTRS_MESSAGING_SYSTEM = "messaging.system" as const;
export const SEMATTRS_MESSAGING_OPERATION = "messaging.operation" as const;
export const SEMATTRS_INBOUND_RESOURCE = "inbound.resource" as const;
export const SEMATTRS_INBOUND_TARGET = "inbound.target" as const;

// Email-specific attributes
export const SEMATTRS_INBOUND_MESSAGE_ID = "inbound.message_id" as const;
export const SEMATTRS_INBOUND_TO_ADDRESSES = "inbound.to_addresses" as const;
export const SEMATTRS_INBOUND_CC_ADDRESSES = "inbound.cc_addresses" as const;
export const SEMATTRS_INBOUND_BCC_ADDRESSES = "inbound.bcc_addresses" as const;
export const SEMATTRS_INBOUND_RECIPIENT_COUNT = "inbound.recipient_count" as const;
export const SEMATTRS_INBOUND_FROM = "inbound.from" as const;
export const SEMATTRS_INBOUND_SUBJECT = "inbound.subject" as const;
export const SEMATTRS_INBOUND_HTML_CONTENT = "inbound.html_content" as const;
export const SEMATTRS_INBOUND_TEXT_CONTENT = "inbound.text_content" as const;

// Scheduling attributes
export const SEMATTRS_INBOUND_SCHEDULED_AT = "inbound.scheduled_at" as const;
export const SEMATTRS_INBOUND_SCHEDULE_ID = "inbound.schedule_id" as const;

// Management attributes
export const SEMATTRS_INBOUND_ENDPOINT_ID = "inbound.endpoint_id" as const;
export const SEMATTRS_INBOUND_DOMAIN_ID = "inbound.domain_id" as const;
export const SEMATTRS_INBOUND_ADDRESS_ID = "inbound.address_id" as const;
export const SEMATTRS_INBOUND_THREAD_ID = "inbound.thread_id" as const;
export const SEMATTRS_INBOUND_ATTACHMENT_ID = "inbound.attachment_id" as const;

// Webhook-specific attributes
export const SEMATTRS_INBOUND_WEBHOOK_ID = "inbound.webhook_id" as const;
export const SEMATTRS_HTTP_STATUS_CODE = "http.status_code" as const;

// Configuration interface
export interface InstrumentInboundConfig {
  /**
   * Whether to capture email content (html/text) in spans.
   * @default false
   */
  captureEmailContent?: boolean;
  
  /**
   * Maximum length of content to capture. Content longer than this will be truncated.
   * @default 1024
   */
  maxContentLength?: number;
}

interface InstrumentedInbound {
  [INSTRUMENTED_FLAG]?: true;
  emails?: any;
  endpoints?: any;
  addresses?: any;
  domains?: any;
  threads?: any;
  attachments?: any;
}

// Helper function to extract email addresses
function extractEmailAddresses(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value
      .filter((email) => typeof email === "string" && email.trim())
      .map((email) => email.trim());
  }
  return [];
}

// Helper function to serialize and truncate content
function serializeContent(content: unknown, maxLength: number): string {
  try {
    const serialized = typeof content === "string" ? content : JSON.stringify(content);
    if (serialized.length > maxLength) {
      return serialized.substring(0, maxLength) + "... (truncated)";
    }
    return serialized;
  } catch (error) {
    return "[Unable to serialize content]";
  }
}

// Annotate email operation spans
function annotateEmailSpan(
  span: Span,
  operation: string,
  resource: string,
  payload: any,
  config?: InstrumentInboundConfig
): void {
  span.setAttributes({
    [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
    [SEMATTRS_MESSAGING_OPERATION]: operation,
    [SEMATTRS_INBOUND_RESOURCE]: resource,
    [SEMATTRS_INBOUND_TARGET]: `${resource}.${operation}`,
  });

  // Extract and set email addresses
  const toAddresses = extractEmailAddresses(payload.to);
  if (toAddresses.length > 0) {
    span.setAttribute(SEMATTRS_INBOUND_TO_ADDRESSES, toAddresses.join(", "));
  }

  const ccAddresses = extractEmailAddresses(payload.cc);
  if (ccAddresses.length > 0) {
    span.setAttribute(SEMATTRS_INBOUND_CC_ADDRESSES, ccAddresses.join(", "));
  }

  const bccAddresses = extractEmailAddresses(payload.bcc);
  if (bccAddresses.length > 0) {
    span.setAttribute(SEMATTRS_INBOUND_BCC_ADDRESSES, bccAddresses.join(", "));
  }

  // Count recipients
  const recipientCount = toAddresses.length + ccAddresses.length + bccAddresses.length;
  if (recipientCount > 0) {
    span.setAttribute(SEMATTRS_INBOUND_RECIPIENT_COUNT, recipientCount);
  }

  // Set other email attributes
  if (payload.from) {
    span.setAttribute(SEMATTRS_INBOUND_FROM, payload.from);
  }

  if (payload.subject) {
    span.setAttribute(SEMATTRS_INBOUND_SUBJECT, payload.subject);
  }

  // Capture email content if enabled
  if (config?.captureEmailContent) {
    const maxLength = config.maxContentLength ?? 1024;
    
    if (payload.html) {
      span.setAttribute(
        SEMATTRS_INBOUND_HTML_CONTENT,
        serializeContent(payload.html, maxLength)
      );
    }
    
    if (payload.text) {
      span.setAttribute(
        SEMATTRS_INBOUND_TEXT_CONTENT,
        serializeContent(payload.text, maxLength)
      );
    }
  }

  // Scheduling attributes
  if (payload.scheduledAt) {
    span.setAttribute(SEMATTRS_INBOUND_SCHEDULED_AT, payload.scheduledAt);
  }

  // Thread ID for replies
  if (payload.threadId) {
    span.setAttribute(SEMATTRS_INBOUND_THREAD_ID, payload.threadId);
  }
}

// Annotate management operation spans
function annotateManagementSpan(
  span: Span,
  operation: string,
  resource: string,
  payload?: any,
  response?: any
): void {
  span.setAttributes({
    [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
    [SEMATTRS_MESSAGING_OPERATION]: operation,
    [SEMATTRS_INBOUND_RESOURCE]: resource,
    [SEMATTRS_INBOUND_TARGET]: `${resource}.${operation}`,
  });

  // Set resource-specific IDs
  if (response?.data?.id) {
    if (resource === "endpoints") {
      span.setAttribute(SEMATTRS_INBOUND_ENDPOINT_ID, response.data.id);
    } else if (resource === "domains") {
      span.setAttribute(SEMATTRS_INBOUND_DOMAIN_ID, response.data.id);
    } else if (resource === "addresses") {
      span.setAttribute(SEMATTRS_INBOUND_ADDRESS_ID, response.data.id);
    }
  }

  // Also check payload for ID (for get/update/delete operations)
  if (payload && typeof payload === "string") {
    if (resource === "endpoints") {
      span.setAttribute(SEMATTRS_INBOUND_ENDPOINT_ID, payload);
    } else if (resource === "domains") {
      span.setAttribute(SEMATTRS_INBOUND_DOMAIN_ID, payload);
    } else if (resource === "addresses") {
      span.setAttribute(SEMATTRS_INBOUND_ADDRESS_ID, payload);
    }
  }
}

// Annotate email response
function annotateEmailResponse(span: Span, response: any): void {
  if (response?.data?.id) {
    span.setAttribute(SEMATTRS_INBOUND_MESSAGE_ID, response.data.id);
  }
  
  if (response?.data?.scheduleId) {
    span.setAttribute(SEMATTRS_INBOUND_SCHEDULE_ID, response.data.scheduleId);
  }
}

// Finalize span with status
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

// Wrapper for async operations
function wrapAsyncOperation(
  tracer: any,
  spanName: string,
  originalFn: Function,
  annotator: (span: Span, ...args: any[]) => void,
  config?: InstrumentInboundConfig
) {
  return async function wrapped(...args: any[]): Promise<any> {
    const span = tracer.startSpan(spanName, { kind: SpanKind.CLIENT });
    
    annotator(span, ...args);
    
    const activeContext = trace.setSpan(context.active(), span);
    
    try {
      const response = await context.with(activeContext, () =>
        originalFn.apply(this, args)
      );
      
      annotateEmailResponse(span, response);
      finalizeSpan(span);
      
      return response;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };
}

/**
 * Instruments an Inbound client instance with OpenTelemetry tracing.
 * 
 * @param client - The Inbound client instance to instrument
 * @param config - Optional configuration for instrumentation
 * @returns The instrumented client instance
 * 
 * @example
 * ```typescript
 * import { Inbound } from '@inboundemail/sdk';
 * import { instrumentInbound } from '@kubiks/otel-inbound';
 * 
 * const inbound = instrumentInbound(
 *   new Inbound(process.env.INBOUND_API_KEY!),
 *   { captureEmailContent: true }
 * );
 * 
 * await inbound.emails.send({
 *   from: 'hello@example.com',
 *   to: 'user@example.com',
 *   subject: 'Welcome',
 *   html: '<p>Hello world</p>',
 * });
 * ```
 */
export function instrumentInbound<T extends InstrumentedInbound>(
  client: T,
  config?: InstrumentInboundConfig
): T {
  // Check if already instrumented
  if ((client as InstrumentedInbound)[INSTRUMENTED_FLAG]) {
    return client;
  }

  const tracer = trace.getTracer(DEFAULT_TRACER_NAME);

  // Instrument emails namespace
  if (client.emails) {
    const emails = client.emails;

    // emails.send
    if (emails.send) {
      const originalSend = emails.send.bind(emails);
      emails.send = wrapAsyncOperation(
        tracer,
        "inbound.emails.send",
        originalSend,
        (span, payload) => annotateEmailSpan(span, "send", "emails", payload, config),
        config
      );
    }

    // emails.schedule
    if (emails.schedule) {
      const originalSchedule = emails.schedule.bind(emails);
      emails.schedule = wrapAsyncOperation(
        tracer,
        "inbound.emails.schedule",
        originalSchedule,
        (span, payload) => annotateEmailSpan(span, "schedule", "emails", payload, config),
        config
      );
    }

    // emails.reply
    if (emails.reply) {
      const originalReply = emails.reply.bind(emails);
      emails.reply = wrapAsyncOperation(
        tracer,
        "inbound.emails.reply",
        originalReply,
        (span, payload) => annotateEmailSpan(span, "reply", "emails", payload, config),
        config
      );
    }

    // emails.retrieve
    if (emails.retrieve) {
      const originalRetrieve = emails.retrieve.bind(emails);
      emails.retrieve = wrapAsyncOperation(
        tracer,
        "inbound.emails.retrieve",
        originalRetrieve,
        (span, id) => {
          span.setAttributes({
            [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
            [SEMATTRS_MESSAGING_OPERATION]: "retrieve",
            [SEMATTRS_INBOUND_RESOURCE]: "emails",
            [SEMATTRS_INBOUND_TARGET]: "emails.retrieve",
            [SEMATTRS_INBOUND_MESSAGE_ID]: id,
          });
        },
        config
      );
    }

    // emails.listScheduled
    if (emails.listScheduled) {
      const originalListScheduled = emails.listScheduled.bind(emails);
      emails.listScheduled = wrapAsyncOperation(
        tracer,
        "inbound.emails.listScheduled",
        originalListScheduled,
        (span) => {
          span.setAttributes({
            [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
            [SEMATTRS_MESSAGING_OPERATION]: "list",
            [SEMATTRS_INBOUND_RESOURCE]: "scheduled_emails",
            [SEMATTRS_INBOUND_TARGET]: "emails.listScheduled",
          });
        },
        config
      );
    }

    // emails.getScheduled
    if (emails.getScheduled) {
      const originalGetScheduled = emails.getScheduled.bind(emails);
      emails.getScheduled = wrapAsyncOperation(
        tracer,
        "inbound.emails.getScheduled",
        originalGetScheduled,
        (span, id) => {
          span.setAttributes({
            [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
            [SEMATTRS_MESSAGING_OPERATION]: "get",
            [SEMATTRS_INBOUND_RESOURCE]: "scheduled_emails",
            [SEMATTRS_INBOUND_TARGET]: "emails.getScheduled",
            [SEMATTRS_INBOUND_SCHEDULE_ID]: id,
          });
        },
        config
      );
    }

    // emails.cancelScheduled
    if (emails.cancelScheduled) {
      const originalCancelScheduled = emails.cancelScheduled.bind(emails);
      emails.cancelScheduled = wrapAsyncOperation(
        tracer,
        "inbound.emails.cancelScheduled",
        originalCancelScheduled,
        (span, id) => {
          span.setAttributes({
            [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
            [SEMATTRS_MESSAGING_OPERATION]: "cancel",
            [SEMATTRS_INBOUND_RESOURCE]: "scheduled_emails",
            [SEMATTRS_INBOUND_TARGET]: "emails.cancelScheduled",
            [SEMATTRS_INBOUND_SCHEDULE_ID]: id,
          });
        },
        config
      );
    }
  }

  // Instrument endpoints namespace
  if (client.endpoints) {
    const endpoints = client.endpoints;

    if (endpoints.list) {
      const originalList = endpoints.list.bind(endpoints);
      endpoints.list = wrapAsyncOperation(
        tracer,
        "inbound.endpoints.list",
        originalList,
        (span) => annotateManagementSpan(span, "list", "endpoints"),
        config
      );
    }

    if (endpoints.create) {
      const originalCreate = endpoints.create.bind(endpoints);
      endpoints.create = async function(...args: any[]) {
        const span = tracer.startSpan("inbound.endpoints.create", { kind: SpanKind.CLIENT });
        annotateManagementSpan(span, "create", "endpoints", args[0]);
        const activeContext = trace.setSpan(context.active(), span);
        
        try {
          const response = await context.with(activeContext, () => originalCreate.apply(this, args));
          annotateManagementSpan(span, "create", "endpoints", args[0], response);
          finalizeSpan(span);
          return response;
        } catch (error) {
          finalizeSpan(span, error);
          throw error;
        }
      };
    }

    if (endpoints.get) {
      const originalGet = endpoints.get.bind(endpoints);
      endpoints.get = wrapAsyncOperation(
        tracer,
        "inbound.endpoints.get",
        originalGet,
        (span, id) => annotateManagementSpan(span, "get", "endpoints", id),
        config
      );
    }

    if (endpoints.update) {
      const originalUpdate = endpoints.update.bind(endpoints);
      endpoints.update = wrapAsyncOperation(
        tracer,
        "inbound.endpoints.update",
        originalUpdate,
        (span, id, payload) => annotateManagementSpan(span, "update", "endpoints", id),
        config
      );
    }

    if (endpoints.delete) {
      const originalDelete = endpoints.delete.bind(endpoints);
      endpoints.delete = wrapAsyncOperation(
        tracer,
        "inbound.endpoints.delete",
        originalDelete,
        (span, id) => annotateManagementSpan(span, "delete", "endpoints", id),
        config
      );
    }
  }

  // Instrument addresses namespace
  if (client.addresses) {
    const addresses = client.addresses;

    if (addresses.list) {
      const originalList = addresses.list.bind(addresses);
      addresses.list = wrapAsyncOperation(
        tracer,
        "inbound.addresses.list",
        originalList,
        (span) => annotateManagementSpan(span, "list", "addresses"),
        config
      );
    }

    if (addresses.create) {
      const originalCreate = addresses.create.bind(addresses);
      addresses.create = async function(...args: any[]) {
        const span = tracer.startSpan("inbound.addresses.create", { kind: SpanKind.CLIENT });
        annotateManagementSpan(span, "create", "addresses", args[0]);
        const activeContext = trace.setSpan(context.active(), span);
        
        try {
          const response = await context.with(activeContext, () => originalCreate.apply(this, args));
          annotateManagementSpan(span, "create", "addresses", args[0], response);
          finalizeSpan(span);
          return response;
        } catch (error) {
          finalizeSpan(span, error);
          throw error;
        }
      };
    }

    if (addresses.get) {
      const originalGet = addresses.get.bind(addresses);
      addresses.get = wrapAsyncOperation(
        tracer,
        "inbound.addresses.get",
        originalGet,
        (span, id) => annotateManagementSpan(span, "get", "addresses", id),
        config
      );
    }

    if (addresses.update) {
      const originalUpdate = addresses.update.bind(addresses);
      addresses.update = wrapAsyncOperation(
        tracer,
        "inbound.addresses.update",
        originalUpdate,
        (span, id, payload) => annotateManagementSpan(span, "update", "addresses", id),
        config
      );
    }

    if (addresses.delete) {
      const originalDelete = addresses.delete.bind(addresses);
      addresses.delete = wrapAsyncOperation(
        tracer,
        "inbound.addresses.delete",
        originalDelete,
        (span, id) => annotateManagementSpan(span, "delete", "addresses", id),
        config
      );
    }
  }

  // Instrument domains namespace
  if (client.domains) {
    const domains = client.domains;

    if (domains.list) {
      const originalList = domains.list.bind(domains);
      domains.list = wrapAsyncOperation(
        tracer,
        "inbound.domains.list",
        originalList,
        (span) => annotateManagementSpan(span, "list", "domains"),
        config
      );
    }

    if (domains.create) {
      const originalCreate = domains.create.bind(domains);
      domains.create = async function(...args: any[]) {
        const span = tracer.startSpan("inbound.domains.create", { kind: SpanKind.CLIENT });
        annotateManagementSpan(span, "create", "domains", args[0]);
        const activeContext = trace.setSpan(context.active(), span);
        
        try {
          const response = await context.with(activeContext, () => originalCreate.apply(this, args));
          annotateManagementSpan(span, "create", "domains", args[0], response);
          finalizeSpan(span);
          return response;
        } catch (error) {
          finalizeSpan(span, error);
          throw error;
        }
      };
    }

    if (domains.get) {
      const originalGet = domains.get.bind(domains);
      domains.get = wrapAsyncOperation(
        tracer,
        "inbound.domains.get",
        originalGet,
        (span, id) => annotateManagementSpan(span, "get", "domains", id),
        config
      );
    }

    if (domains.update) {
      const originalUpdate = domains.update.bind(domains);
      domains.update = wrapAsyncOperation(
        tracer,
        "inbound.domains.update",
        originalUpdate,
        (span, id, payload) => annotateManagementSpan(span, "update", "domains", id),
        config
      );
    }

    if (domains.delete) {
      const originalDelete = domains.delete.bind(domains);
      domains.delete = wrapAsyncOperation(
        tracer,
        "inbound.domains.delete",
        originalDelete,
        (span, id) => annotateManagementSpan(span, "delete", "domains", id),
        config
      );
    }

    if (domains.getDNS) {
      const originalGetDNS = domains.getDNS.bind(domains);
      domains.getDNS = wrapAsyncOperation(
        tracer,
        "inbound.domains.getDNS",
        originalGetDNS,
        (span, id) => {
          span.setAttributes({
            [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
            [SEMATTRS_MESSAGING_OPERATION]: "getDNS",
            [SEMATTRS_INBOUND_RESOURCE]: "domains",
            [SEMATTRS_INBOUND_TARGET]: "domains.getDNS",
            [SEMATTRS_INBOUND_DOMAIN_ID]: id,
          });
        },
        config
      );
    }
  }

  // Instrument threads namespace
  if (client.threads) {
    const threads = client.threads;

    if (threads.list) {
      const originalList = threads.list.bind(threads);
      threads.list = wrapAsyncOperation(
        tracer,
        "inbound.threads.list",
        originalList,
        (span) => {
          span.setAttributes({
            [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
            [SEMATTRS_MESSAGING_OPERATION]: "list",
            [SEMATTRS_INBOUND_RESOURCE]: "threads",
            [SEMATTRS_INBOUND_TARGET]: "threads.list",
          });
        },
        config
      );
    }

    if (threads.get) {
      const originalGet = threads.get.bind(threads);
      threads.get = wrapAsyncOperation(
        tracer,
        "inbound.threads.get",
        originalGet,
        (span, id) => {
          span.setAttributes({
            [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
            [SEMATTRS_MESSAGING_OPERATION]: "get",
            [SEMATTRS_INBOUND_RESOURCE]: "threads",
            [SEMATTRS_INBOUND_TARGET]: "threads.get",
            [SEMATTRS_INBOUND_THREAD_ID]: id,
          });
        },
        config
      );
    }

    if (threads.actions) {
      const originalActions = threads.actions.bind(threads);
      threads.actions = wrapAsyncOperation(
        tracer,
        "inbound.threads.actions",
        originalActions,
        (span, id, action) => {
          span.setAttributes({
            [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
            [SEMATTRS_MESSAGING_OPERATION]: "actions",
            [SEMATTRS_INBOUND_RESOURCE]: "threads",
            [SEMATTRS_INBOUND_TARGET]: "threads.actions",
            [SEMATTRS_INBOUND_THREAD_ID]: id,
          });
        },
        config
      );
    }

    if (threads.statistics) {
      const originalStatistics = threads.statistics.bind(threads);
      threads.statistics = wrapAsyncOperation(
        tracer,
        "inbound.threads.statistics",
        originalStatistics,
        (span) => {
          span.setAttributes({
            [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
            [SEMATTRS_MESSAGING_OPERATION]: "statistics",
            [SEMATTRS_INBOUND_RESOURCE]: "threads",
            [SEMATTRS_INBOUND_TARGET]: "threads.statistics",
          });
        },
        config
      );
    }
  }

  // Instrument attachments namespace
  if (client.attachments) {
    const attachments = client.attachments;

    if (attachments.download) {
      const originalDownload = attachments.download.bind(attachments);
      attachments.download = wrapAsyncOperation(
        tracer,
        "inbound.attachments.download",
        originalDownload,
        (span, id) => {
          span.setAttributes({
            [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
            [SEMATTRS_MESSAGING_OPERATION]: "download",
            [SEMATTRS_INBOUND_RESOURCE]: "attachments",
            [SEMATTRS_INBOUND_TARGET]: "attachments.download",
            [SEMATTRS_INBOUND_ATTACHMENT_ID]: id,
          });
        },
        config
      );
    }
  }

  // Mark as instrumented
  (client as InstrumentedInbound)[INSTRUMENTED_FLAG] = true;

  return client;
}

// Type for Next.js route handlers
type RouteHandler = (request: Request) => Promise<Response> | Response;

// Extract webhook headers
function extractWebhookHeaders(request: Request): Record<string, string> {
  const attributes: Record<string, string> = {};

  // Extract common webhook headers from Inbound
  const webhookId = request.headers.get("x-webhook-id") || request.headers.get("x-inbound-webhook-id");
  if (webhookId) {
    attributes[SEMATTRS_INBOUND_WEBHOOK_ID] = webhookId;
  }

  const messageId = request.headers.get("x-message-id") || request.headers.get("x-inbound-message-id");
  if (messageId) {
    attributes[SEMATTRS_INBOUND_MESSAGE_ID] = messageId;
  }

  return attributes;
}

// Annotate webhook span with email data
function annotateWebhookSpan(
  span: Span,
  payload: any,
  config?: InstrumentInboundConfig
): void {
  if (!payload) return;

  // Extract email information from webhook payload
  if (payload.from) {
    span.setAttribute(SEMATTRS_INBOUND_FROM, payload.from);
  }

  if (payload.to) {
    const toAddresses = extractEmailAddresses(payload.to);
    if (toAddresses.length > 0) {
      span.setAttribute(SEMATTRS_INBOUND_TO_ADDRESSES, toAddresses.join(", "));
    }
  }

  if (payload.subject) {
    span.setAttribute(SEMATTRS_INBOUND_SUBJECT, payload.subject);
  }

  if (payload.messageId || payload.id) {
    span.setAttribute(SEMATTRS_INBOUND_MESSAGE_ID, payload.messageId || payload.id);
  }

  if (payload.threadId) {
    span.setAttribute(SEMATTRS_INBOUND_THREAD_ID, payload.threadId);
  }

  // Capture email content if enabled
  if (config?.captureEmailContent) {
    const maxLength = config.maxContentLength ?? 1024;
    
    if (payload.html) {
      span.setAttribute(
        SEMATTRS_INBOUND_HTML_CONTENT,
        serializeContent(payload.html, maxLength)
      );
    }
    
    if (payload.text) {
      span.setAttribute(
        SEMATTRS_INBOUND_TEXT_CONTENT,
        serializeContent(payload.text, maxLength)
      );
    }
  }
}

/**
 * Instruments a Next.js route handler to trace incoming webhook requests from Inbound.
 * 
 * @param handler - The Next.js route handler function
 * @param config - Optional configuration for instrumentation
 * @returns The instrumented route handler
 * 
 * @example
 * ```typescript
 * import { instrumentInboundWebhook } from '@kubiks/otel-inbound';
 * 
 * export const POST = instrumentInboundWebhook(async (request: Request) => {
 *   const email = await request.json();
 *   
 *   // Process incoming email
 *   console.log('Received email from:', email.from);
 *   
 *   return Response.json({ success: true });
 * }, { captureEmailContent: true });
 * ```
 */
export function instrumentInboundWebhook(
  handler: RouteHandler,
  config?: InstrumentInboundConfig
): RouteHandler {
  const tracer = trace.getTracer(DEFAULT_TRACER_NAME);

  return async function instrumentedWebhook(request: Request): Promise<Response> {
    const span = tracer.startSpan("inbound.webhook.receive", {
      kind: SpanKind.SERVER,
    });

    // Set base attributes
    span.setAttributes({
      [SEMATTRS_MESSAGING_SYSTEM]: "inbound",
      [SEMATTRS_MESSAGING_OPERATION]: "receive",
      [SEMATTRS_INBOUND_RESOURCE]: "webhook",
      [SEMATTRS_INBOUND_TARGET]: "webhook.receive",
    });

    // Extract webhook headers
    const webhookHeaders = extractWebhookHeaders(request);
    span.setAttributes(webhookHeaders);

    // Try to parse and annotate with email data
    try {
      const clonedRequest = request.clone();
      const payload = await clonedRequest.json();
      annotateWebhookSpan(span, payload, config);
    } catch (error) {
      // Ignore errors when parsing webhook payload
    }

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const response = await context.with(activeContext, () => handler(request));

      // Capture response status
      span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);

      // Mark as successful if status is 2xx
      if (response.status >= 200 && response.status < 300) {
        finalizeSpan(span);
      } else {
        finalizeSpan(span, new Error(`Handler returned status ${response.status}`));
      }

      return response;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };
}

