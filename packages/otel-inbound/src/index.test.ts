import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  instrumentInbound,
  instrumentInboundWebhook,
  SEMATTRS_MESSAGING_OPERATION,
  SEMATTRS_MESSAGING_SYSTEM,
  SEMATTRS_INBOUND_MESSAGE_ID,
  SEMATTRS_INBOUND_RECIPIENT_COUNT,
  SEMATTRS_INBOUND_RESOURCE,
  SEMATTRS_INBOUND_TARGET,
  SEMATTRS_INBOUND_TO_ADDRESSES,
  SEMATTRS_INBOUND_CC_ADDRESSES,
  SEMATTRS_INBOUND_BCC_ADDRESSES,
  SEMATTRS_INBOUND_FROM,
  SEMATTRS_INBOUND_SUBJECT,
  SEMATTRS_INBOUND_HTML_CONTENT,
  SEMATTRS_INBOUND_TEXT_CONTENT,
  SEMATTRS_INBOUND_SCHEDULED_AT,
  SEMATTRS_INBOUND_SCHEDULE_ID,
  SEMATTRS_INBOUND_ENDPOINT_ID,
  SEMATTRS_INBOUND_DOMAIN_ID,
  SEMATTRS_INBOUND_ADDRESS_ID,
  SEMATTRS_INBOUND_THREAD_ID,
  SEMATTRS_INBOUND_ATTACHMENT_ID,
  SEMATTRS_HTTP_STATUS_CODE,
} from "./index";

describe("instrumentInbound", () => {
  let provider: BasicTracerProvider;
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
    exporter.reset();
    trace.disable();
  });

  const createMockInbound = () => {
    return {
      emails: {
        send: vi.fn(async (payload: any) => ({
          data: { id: "email_123" },
          error: null,
        })),
        schedule: vi.fn(async (payload: any) => ({
          data: { id: "email_123", scheduleId: "sched_456" },
          error: null,
        })),
        reply: vi.fn(async (payload: any) => ({
          data: { id: "email_789" },
          error: null,
        })),
        retrieve: vi.fn(async (id: string) => ({
          data: { id, from: "sender@example.com", to: "user@example.com" },
          error: null,
        })),
        listScheduled: vi.fn(async () => ({
          data: [{ id: "sched_1" }, { id: "sched_2" }],
          error: null,
        })),
        getScheduled: vi.fn(async (id: string) => ({
          data: { id, scheduledAt: "2025-01-01T00:00:00Z" },
          error: null,
        })),
        cancelScheduled: vi.fn(async (id: string) => ({
          data: { success: true },
          error: null,
        })),
      },
      endpoints: {
        list: vi.fn(async () => ({
          data: [{ id: "ep_1" }, { id: "ep_2" }],
          error: null,
        })),
        create: vi.fn(async (payload: any) => ({
          data: { id: "ep_123" },
          error: null,
        })),
        get: vi.fn(async (id: string) => ({
          data: { id },
          error: null,
        })),
        update: vi.fn(async (id: string, payload: any) => ({
          data: { id },
          error: null,
        })),
        delete: vi.fn(async (id: string) => ({
          data: { success: true },
          error: null,
        })),
      },
      addresses: {
        list: vi.fn(async () => ({
          data: [{ id: "addr_1" }, { id: "addr_2" }],
          error: null,
        })),
        create: vi.fn(async (payload: any) => ({
          data: { id: "addr_123" },
          error: null,
        })),
        get: vi.fn(async (id: string) => ({
          data: { id },
          error: null,
        })),
        update: vi.fn(async (id: string, payload: any) => ({
          data: { id },
          error: null,
        })),
        delete: vi.fn(async (id: string) => ({
          data: { success: true },
          error: null,
        })),
      },
      domains: {
        list: vi.fn(async () => ({
          data: [{ id: "dom_1" }, { id: "dom_2" }],
          error: null,
        })),
        create: vi.fn(async (payload: any) => ({
          data: { id: "dom_123" },
          error: null,
        })),
        get: vi.fn(async (id: string) => ({
          data: { id },
          error: null,
        })),
        update: vi.fn(async (id: string, payload: any) => ({
          data: { id },
          error: null,
        })),
        delete: vi.fn(async (id: string) => ({
          data: { success: true },
          error: null,
        })),
        getDNS: vi.fn(async (id: string) => ({
          data: { records: [] },
          error: null,
        })),
      },
      threads: {
        list: vi.fn(async () => ({
          data: [{ id: "thread_1" }, { id: "thread_2" }],
          error: null,
        })),
        get: vi.fn(async (id: string) => ({
          data: { id },
          error: null,
        })),
        actions: vi.fn(async (id: string, action: any) => ({
          data: { success: true },
          error: null,
        })),
        statistics: vi.fn(async () => ({
          data: { total: 100 },
          error: null,
        })),
      },
      attachments: {
        download: vi.fn(async (id: string) => ({
          data: new Blob(),
          error: null,
        })),
      },
    };
  };

  describe("Email Operations", () => {
    it("instruments emails.send with all attributes", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound);

      const payload = {
        to: ["user@example.com", "second@example.com"],
        cc: ["cc@example.com"],
        bcc: "bcc@example.com",
        from: "sender@example.com",
        subject: "Test Email",
        html: "<p>Hello</p>",
        text: "Hello",
      };

      const response = await inbound.emails.send(payload);
      expect(response.data?.id).toBe("email_123");

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.name).toBe("inbound.emails.send");
      expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toBe("inbound");
      expect(span.attributes[SEMATTRS_MESSAGING_OPERATION]).toBe("send");
      expect(span.attributes[SEMATTRS_INBOUND_RESOURCE]).toBe("emails");
      expect(span.attributes[SEMATTRS_INBOUND_TARGET]).toBe("emails.send");
      expect(span.attributes[SEMATTRS_INBOUND_MESSAGE_ID]).toBe("email_123");
      expect(span.attributes[SEMATTRS_INBOUND_RECIPIENT_COUNT]).toBe(4);
      expect(span.attributes[SEMATTRS_INBOUND_TO_ADDRESSES]).toBe(
        "user@example.com, second@example.com"
      );
      expect(span.attributes[SEMATTRS_INBOUND_CC_ADDRESSES]).toBe("cc@example.com");
      expect(span.attributes[SEMATTRS_INBOUND_BCC_ADDRESSES]).toBe("bcc@example.com");
      expect(span.attributes[SEMATTRS_INBOUND_FROM]).toBe("sender@example.com");
      expect(span.attributes[SEMATTRS_INBOUND_SUBJECT]).toBe("Test Email");
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("instruments emails.schedule with scheduling attributes", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound);

      const payload = {
        to: "user@example.com",
        from: "sender@example.com",
        subject: "Scheduled Email",
        html: "<p>Hello</p>",
        scheduledAt: "2025-01-01T00:00:00Z",
      };

      const response = await inbound.emails.schedule(payload);
      expect(response.data?.scheduleId).toBe("sched_456");

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.name).toBe("inbound.emails.schedule");
      expect(span.attributes[SEMATTRS_MESSAGING_OPERATION]).toBe("schedule");
      expect(span.attributes[SEMATTRS_INBOUND_SCHEDULED_AT]).toBe("2025-01-01T00:00:00Z");
      expect(span.attributes[SEMATTRS_INBOUND_SCHEDULE_ID]).toBe("sched_456");
    });

    it("instruments emails.reply with thread tracking", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound);

      const payload = {
        to: "user@example.com",
        from: "sender@example.com",
        subject: "Re: Test",
        html: "<p>Reply</p>",
        threadId: "thread_123",
      };

      await inbound.emails.reply(payload);

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.name).toBe("inbound.emails.reply");
      expect(span.attributes[SEMATTRS_MESSAGING_OPERATION]).toBe("reply");
      expect(span.attributes[SEMATTRS_INBOUND_THREAD_ID]).toBe("thread_123");
    });

    it("instruments emails.retrieve", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound);

      await inbound.emails.retrieve("email_123");

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.name).toBe("inbound.emails.retrieve");
      expect(span.attributes[SEMATTRS_MESSAGING_OPERATION]).toBe("retrieve");
      expect(span.attributes[SEMATTRS_INBOUND_MESSAGE_ID]).toBe("email_123");
    });

    it("instruments scheduled email operations", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound);

      await inbound.emails.listScheduled();
      await inbound.emails.getScheduled("sched_123");
      await inbound.emails.cancelScheduled("sched_123");

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(3);

      expect(spans[0].name).toBe("inbound.emails.listScheduled");
      expect(spans[0].attributes[SEMATTRS_MESSAGING_OPERATION]).toBe("list");

      expect(spans[1].name).toBe("inbound.emails.getScheduled");
      expect(spans[1].attributes[SEMATTRS_INBOUND_SCHEDULE_ID]).toBe("sched_123");

      expect(spans[2].name).toBe("inbound.emails.cancelScheduled");
      expect(spans[2].attributes[SEMATTRS_MESSAGING_OPERATION]).toBe("cancel");
    });

    it("captures email content when enabled", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound, { captureEmailContent: true });

      const payload = {
        to: "user@example.com",
        from: "sender@example.com",
        subject: "Test",
        html: "<p>HTML content</p>",
        text: "Text content",
      };

      await inbound.emails.send(payload);

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.attributes[SEMATTRS_INBOUND_HTML_CONTENT]).toBe("<p>HTML content</p>");
      expect(span.attributes[SEMATTRS_INBOUND_TEXT_CONTENT]).toBe("Text content");
    });

    it("truncates long content", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound, {
        captureEmailContent: true,
        maxContentLength: 10,
      });

      const payload = {
        to: "user@example.com",
        from: "sender@example.com",
        subject: "Test",
        html: "This is a very long HTML content that should be truncated",
      };

      await inbound.emails.send(payload);

      const spans = exporter.getFinishedSpans();
      const span = spans[0];
      expect(span.attributes[SEMATTRS_INBOUND_HTML_CONTENT]).toContain("... (truncated)");
    });
  });

  describe("Management Operations", () => {
    it("instruments endpoint operations", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound);

      await inbound.endpoints.list();
      await inbound.endpoints.create({ url: "https://example.com" });
      await inbound.endpoints.get("ep_123");
      await inbound.endpoints.update("ep_123", { url: "https://new.com" });
      await inbound.endpoints.delete("ep_123");

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(5);

      expect(spans[0].name).toBe("inbound.endpoints.list");
      expect(spans[0].attributes[SEMATTRS_INBOUND_RESOURCE]).toBe("endpoints");

      expect(spans[1].name).toBe("inbound.endpoints.create");
      expect(spans[1].attributes[SEMATTRS_INBOUND_ENDPOINT_ID]).toBe("ep_123");

      expect(spans[2].name).toBe("inbound.endpoints.get");
      expect(spans[2].attributes[SEMATTRS_INBOUND_ENDPOINT_ID]).toBe("ep_123");

      expect(spans[3].name).toBe("inbound.endpoints.update");
      expect(spans[4].name).toBe("inbound.endpoints.delete");
    });

    it("instruments address operations", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound);

      await inbound.addresses.list();
      await inbound.addresses.create({ email: "test@example.com" });
      await inbound.addresses.get("addr_123");
      await inbound.addresses.update("addr_123", { name: "Test" });
      await inbound.addresses.delete("addr_123");

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(5);

      expect(spans[0].name).toBe("inbound.addresses.list");
      expect(spans[1].name).toBe("inbound.addresses.create");
      expect(spans[1].attributes[SEMATTRS_INBOUND_ADDRESS_ID]).toBe("addr_123");
      expect(spans[2].attributes[SEMATTRS_INBOUND_ADDRESS_ID]).toBe("addr_123");
    });

    it("instruments domain operations", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound);

      await inbound.domains.list();
      await inbound.domains.create({ domain: "example.com" });
      await inbound.domains.get("dom_123");
      await inbound.domains.update("dom_123", { name: "Example" });
      await inbound.domains.delete("dom_123");
      await inbound.domains.getDNS("dom_123");

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(6);

      expect(spans[0].name).toBe("inbound.domains.list");
      expect(spans[1].name).toBe("inbound.domains.create");
      expect(spans[1].attributes[SEMATTRS_INBOUND_DOMAIN_ID]).toBe("dom_123");
      expect(spans[5].name).toBe("inbound.domains.getDNS");
      expect(spans[5].attributes[SEMATTRS_INBOUND_DOMAIN_ID]).toBe("dom_123");
    });
  });

  describe("Thread Operations", () => {
    it("instruments thread operations", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound);

      await inbound.threads.list();
      await inbound.threads.get("thread_123");
      await inbound.threads.actions("thread_123", { action: "archive" });
      await inbound.threads.statistics();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(4);

      expect(spans[0].name).toBe("inbound.threads.list");
      expect(spans[1].name).toBe("inbound.threads.get");
      expect(spans[1].attributes[SEMATTRS_INBOUND_THREAD_ID]).toBe("thread_123");
      expect(spans[2].name).toBe("inbound.threads.actions");
      expect(spans[3].name).toBe("inbound.threads.statistics");
    });
  });

  describe("Attachment Operations", () => {
    it("instruments attachment download", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound);

      await inbound.attachments.download("attach_123");

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.name).toBe("inbound.attachments.download");
      expect(span.attributes[SEMATTRS_INBOUND_ATTACHMENT_ID]).toBe("attach_123");
    });
  });

  describe("Error Handling", () => {
    it("captures errors and marks span status", async () => {
      const inbound = createMockInbound();
      inbound.emails.send = vi.fn().mockRejectedValue(new Error("API Error"));

      instrumentInbound(inbound);

      await expect(
        inbound.emails.send({
          to: "test@example.com",
          from: "sender@example.com",
          subject: "Test",
          html: "<p>Test</p>",
        })
      ).rejects.toThrowError("API Error");

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      const hasException = span.events.some((event) => event.name === "exception");
      expect(hasException).toBe(true);
    });
  });

  describe("Idempotency", () => {
    it("is idempotent", async () => {
      const inbound = createMockInbound();
      const first = instrumentInbound(inbound);
      const second = instrumentInbound(first);

      expect(first).toBe(second);

      await second.emails.send({
        to: "test@example.com",
        from: "sender@example.com",
        subject: "Test",
        html: "<p>Test</p>",
      });

      expect(exporter.getFinishedSpans()).toHaveLength(1);
    });
  });

  describe("Edge Cases", () => {
    it("handles missing optional fields gracefully", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound);

      const payload = {
        to: "single@example.com",
        from: "sender@example.com",
        subject: "Test",
        html: "<p>Test</p>",
      };

      await inbound.emails.send(payload);

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.attributes[SEMATTRS_INBOUND_RECIPIENT_COUNT]).toBe(1);
      expect(span.attributes[SEMATTRS_INBOUND_TO_ADDRESSES]).toBe("single@example.com");
      expect(span.attributes[SEMATTRS_INBOUND_CC_ADDRESSES]).toBeUndefined();
      expect(span.attributes[SEMATTRS_INBOUND_BCC_ADDRESSES]).toBeUndefined();
    });

    it("handles mixed string and array formats", async () => {
      const inbound = createMockInbound();
      instrumentInbound(inbound);

      const payload = {
        to: "single@example.com",
        cc: ["cc1@example.com", "cc2@example.com"],
        bcc: ["bcc@example.com"],
        from: "sender@example.com",
        subject: "Mixed Format",
        html: "<p>Test</p>",
      };

      await inbound.emails.send(payload);

      const spans = exporter.getFinishedSpans();
      const span = spans[0];

      expect(span.attributes[SEMATTRS_INBOUND_TO_ADDRESSES]).toBe("single@example.com");
      expect(span.attributes[SEMATTRS_INBOUND_CC_ADDRESSES]).toBe(
        "cc1@example.com, cc2@example.com"
      );
      expect(span.attributes[SEMATTRS_INBOUND_BCC_ADDRESSES]).toBe("bcc@example.com");
      expect(span.attributes[SEMATTRS_INBOUND_RECIPIENT_COUNT]).toBe(4);
    });
  });
});

describe("instrumentInboundWebhook", () => {
  let provider: BasicTracerProvider;
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
    exporter.reset();
    trace.disable();
  });

  it("instruments webhook receivers", async () => {
    const handler = vi.fn(async (request: Request) => {
      return Response.json({ success: true });
    });

    const instrumentedHandler = instrumentInboundWebhook(handler);

    const emailPayload = {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Webhook Test",
      html: "<p>Test</p>",
      messageId: "msg_123",
    };

    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-id": "webhook_123",
        "x-message-id": "msg_123",
      },
      body: JSON.stringify(emailPayload),
    });

    const response = await instrumentedHandler(request);
    expect(response.status).toBe(200);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span.name).toBe("inbound.webhook.receive");
    expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toBe("inbound");
    expect(span.attributes[SEMATTRS_MESSAGING_OPERATION]).toBe("receive");
    expect(span.attributes[SEMATTRS_INBOUND_RESOURCE]).toBe("webhook");
    expect(span.attributes[SEMATTRS_INBOUND_FROM]).toBe("sender@example.com");
    expect(span.attributes[SEMATTRS_INBOUND_SUBJECT]).toBe("Webhook Test");
    expect(span.attributes[SEMATTRS_INBOUND_MESSAGE_ID]).toBe("msg_123");
    expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toBe(200);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("captures webhook email content when enabled", async () => {
    const handler = vi.fn(async () => Response.json({ success: true }));
    const instrumentedHandler = instrumentInboundWebhook(handler, {
      captureEmailContent: true,
    });

    const emailPayload = {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Content Test",
      html: "<p>HTML content</p>",
      text: "Text content",
    };

    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(emailPayload),
    });

    await instrumentedHandler(request);

    const spans = exporter.getFinishedSpans();
    const span = spans[0];

    expect(span.attributes[SEMATTRS_INBOUND_HTML_CONTENT]).toBe("<p>HTML content</p>");
    expect(span.attributes[SEMATTRS_INBOUND_TEXT_CONTENT]).toBe("Text content");
  });

  it("handles webhook errors", async () => {
    const handler = vi.fn(async () => {
      throw new Error("Webhook processing failed");
    });

    const instrumentedHandler = instrumentInboundWebhook(handler);

    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "test@example.com" }),
    });

    await expect(instrumentedHandler(request)).rejects.toThrowError(
      "Webhook processing failed"
    );

    const spans = exporter.getFinishedSpans();
    const span = spans[0];

    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    const hasException = span.events.some((event) => event.name === "exception");
    expect(hasException).toBe(true);
  });

  it("marks non-2xx responses as errors", async () => {
    const handler = vi.fn(async () => {
      return new Response("Bad Request", { status: 400 });
    });

    const instrumentedHandler = instrumentInboundWebhook(handler);

    const request = new Request("https://example.com/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await instrumentedHandler(request);
    expect(response.status).toBe(400);

    const spans = exporter.getFinishedSpans();
    const span = spans[0];

    expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toBe(400);
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });
});

